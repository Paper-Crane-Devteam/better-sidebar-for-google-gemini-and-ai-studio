import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { useI18n } from '@/shared/hooks/useI18n';
import { Button } from '@/entrypoints/overlay.content/shared/components/ui/button';
import { Input } from '@/entrypoints/overlay.content/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import openInDriveImg from '@/assets/images/open-in-drive.png';
import downloadConversationsImg from '@/assets/images/download-conversations.png';
import { toast } from '@/shared/lib/toast';

export const ImportHistoryDialog = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<{ total: number; success: number; failed: number } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logs.length > 0) {
      logContainerRef.current?.scrollTo({ top: logContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [logs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setStats(null);
      setLogs([]);
    }
  };

  const normalizeTitle = (title: string) => {
    return title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, '_');
  };

  /** Loose normalization: collapse underscores, trim, lowercase — used as fallback */
  const looseNormalize = (title: string) => {
    return normalizeTitle(title)
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .trim()
      .toLowerCase();
  };

  const handleImport = async () => {
    if (!file) return;
    setIsProcessing(true);
    setLogs(prev => [...prev, t('importHistory.logInitializing')]);
    
    // Force UI update
    await new Promise(r => setTimeout(r, 50));

    try {
      // 1. Fetch Conversations First (Check DB Health)
      setLogs((prev) => [...prev, t('importHistory.logFetching')]);

      const response = await browser.runtime.sendMessage({
        type: 'GET_CONVERSATIONS',
      });
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch conversations');
      }
      const conversations = response.data;

      const titleMap = new Map<string, string>();
      const looseTitleMap = new Map<string, string>();

      conversations.forEach((c: any) => {
        if (c.title) {
          const norm = normalizeTitle(c.title);
          titleMap.set(norm, c.id);
          const loose = looseNormalize(c.title);
          // Only keep first match for loose map to avoid ambiguity
          if (!looseTitleMap.has(loose)) {
            looseTitleMap.set(loose, c.id);
          }
        }
      });
      setLogs((prev) => [
        ...prev,
        t('importHistory.logFoundDb', { count: conversations.length }),
      ]);

      console.log('Starting ZIP initialization');

      // 2. Load ZIP — read as ArrayBuffer for Firefox/extension compatibility (File object may not be recognized in content script)
      setLogs((prev) => [...prev, t('importHistory.logReadingZip')]);

      console.log('File details:', {
        name: file.name,
        type: file.type,
        size: file.size,
        constructor: file.constructor.name,
      });

      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          console.log(
            'FileReader loaded. Result type:',
            reader.result?.constructor.name,
          );
          if (reader.result instanceof ArrayBuffer) {
            console.log('ArrayBuffer byteLength:', reader.result.byteLength);
          }
          resolve(reader.result as ArrayBuffer);
        };
        reader.onerror = () => {
          console.error('FileReader error:', reader.error);
          reject(reader.error);
        };
        reader.readAsArrayBuffer(file);
      });

      console.log(
        'Passing to JSZip, isArrayBuffer:',
        arrayBuffer instanceof ArrayBuffer,
      );

      // Adaptive fix:
      // In Chrome/Standard envs: arrayBuffer instanceof ArrayBuffer is true. Use directly (zero copy).
      // In Firefox Content Scripts: instanceof fails due to Xray wrappers. Use structuredClone to unwrap/copy.
      let dataToLoad: ArrayBuffer | Uint8Array = arrayBuffer;

      if (!((arrayBuffer as any) instanceof ArrayBuffer)) {
        console.warn(
          'ArrayBuffer instanceof check failed (Firefox Xray?), attempting structuredClone fix...',
        );
        try {
          // structuredClone is the most reliable way to unwrap/copy across realms
          const clonedBuffer = structuredClone(arrayBuffer);
          console.log(
            'structuredClone success. instanceof ArrayBuffer:',
            clonedBuffer instanceof ArrayBuffer,
          );
          dataToLoad = clonedBuffer;
        } catch (e) {
          console.error(
            'structuredClone failed, falling back to Uint8Array hack:',
            e,
          );
          dataToLoad = new Uint8Array(arrayBuffer);
        }
      }

      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(dataToLoad);
      console.log('JSZip loaded');

      let fileNames = Object.keys(loadedZip.files);

      // Filter out files with extensions and directories
      fileNames = fileNames.filter((fileName) => {
        const fileObj = loadedZip.files[fileName];
        if (fileObj.dir) return false;

        const basename = fileName.split('/').pop() || fileName;
        // Filter out hidden files and files with extensions
        return !basename.startsWith('.') && !basename.includes('.');
      });

      console.log('Entries retrieved:', fileNames.length);

      setLogs((prev) => [
        ...prev,
        t('importHistory.logFoundZip', { count: fileNames.length }),
      ]);

      let successCount = 0;
      let failCount = 0;
      let processedCount = 0;
      const BATCH_SIZE = 10;

      console.log('Starting iteration...');

      for (let i = 0; i < fileNames.length; i++) {
        const fileName = fileNames[i];
        const fileObj = loadedZip.files[fileName];

        if (fileObj.dir) continue;
        if (fileName.includes('__MACOSX') || fileName.includes('.DS_Store'))
          continue;

        const basename = fileName.split('/').pop() || fileName;
        const normalizedBasename = normalizeTitle(basename);
        // Exact match first, then fallback to loose match for special-char titles
        const conversationId =
          titleMap.get(normalizedBasename) ??
          looseTitleMap.get(looseNormalize(basename));

        if (conversationId) {
          try {
            const content = await fileObj.async('string');
            const json = JSON.parse(content);

            const chunks = json.chunkedPrompt?.chunks || [];
            const messagesToInsert: any[] = [];

            for (const chunk of chunks) {
              let text = chunk.text || '';
              text = text.replace(
                /!\[.*?\]\(data:image\/.*?;base64,.*?\)/g,
                '[IMAGE REMOVED]',
              );
              text = text.replace(
                /data:image\/.*?;base64,[^\s"']+/g,
                '[IMAGE REMOVED]',
              );

              messagesToInsert.push({
                role: chunk.role,
                content: text,
                message_type: chunk.isThought ? 'thought' : 'text',
              });
            }

            if (messagesToInsert.length > 0) {
              // Replace Messages (Delete + Insert in one transaction)
              console.log('REPLACE_MESSAGES', conversationId, messagesToInsert);
              await browser.runtime.sendMessage({
                type: 'REPLACE_MESSAGES',
                payload: { conversationId, messages: messagesToInsert },
              });

              successCount++;
            } else {
              setLogs((prev) => [
                ...prev,
                t('importHistory.logSkippingEmpty', { name: basename }),
              ]);
            }
          } catch (err) {
            console.error(`Failed to parse ${basename}:`, err);
            setLogs((prev) => [
              ...prev,
              t('importHistory.logFailedProcess', { name: basename }),
            ]);
            failCount++;
          }
        } else {
          console.log('No conversation found for', basename);
          setLogs((prev) => [
            ...prev,
            t('importHistory.logNoConversation', { name: basename }),
          ]);
          failCount++;
        }

        processedCount++;
        if (processedCount % BATCH_SIZE === 0) {
          console.log(`Processed batch ${processedCount}/${fileNames.length}`);
          setLogs((prev) => [
            ...prev,
            t('importHistory.logProcessed', {
              current: processedCount,
              total: fileNames.length,
            }),
          ]);
          // Longer delay to allow GC and UI updates
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }

      setStats({
        total: successCount + failCount,
        success: successCount,
        failed: failCount,
      });

      toast.success(t('toast.imported', { count: successCount }));
      setLogs((prev) => [
        ...prev,
        t('importHistory.logComplete', { count: successCount }),
      ]);

      // Compact DB after import so re-importing the same ZIP doesn't bloat the file
      // (fire-and-forget; export also runs VACUUM before dump)
      if (successCount > 0) {
        browser.runtime
          .sendMessage({ type: 'VACUUM_DATABASE' })
          .catch(() => {});
      }
    } catch (e) {
      console.error(e);
      setLogs(prev => [...prev, t('importHistory.logCriticalError', { message: String(e) })]);
      toast.error(t('toast.importFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in-0"
        onClick={onClose}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-2xl grid gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg animate-in zoom-in-95 fade-in-0 slide-in-from-bottom-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col space-y-2 text-center sm:text-left">
            <h2 className="text-lg font-semibold leading-none tracking-tight">
              {t('menu.importHistory')}
            </h2>
            <div className="text-sm text-muted-foreground">
              {t('importHistory.selectZipHint')}
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="flex w-full items-center justify-between text-sm font-medium hover:opacity-80"
            >
              <span className="flex items-center gap-2">
                {t('importHistory.howToExport')}
              </span>
              {showGuide ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {showGuide && (
              <div className="mt-3 flex flex-col gap-4 text-sm text-muted-foreground animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {t('importHistory.step1Title')}
                  </p>
                  <p>
                    {t('importHistory.step1Open')}{' '}
                    <a
                      href="https://aistudio.google.com/app/library"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center"
                    >
                      {t('importHistory.step1OpenLink')}{' '}
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="font-medium text-foreground">
                    {t('importHistory.step2Title')}
                  </p>
                  <p>{t('importHistory.step2Click')}</p>
                  <img
                    src={openInDriveImg}
                    alt="Open in Drive"
                    className="rounded-md border shadow-sm w-full h-auto object-contain bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <p className="font-medium text-foreground">
                    {t('importHistory.step3Title')}
                  </p>
                  <p>{t('importHistory.step3Click')}</p>
                  <img
                    src={downloadConversationsImg}
                    alt="Download"
                    className="rounded-md border shadow-sm w-full h-auto object-contain bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {t('importHistory.step4Title')}
                  </p>
                  <p>{t('importHistory.step4Upload')}</p>
                </div>

                <div className="rounded bg-muted/50 p-3 text-xs text-muted-foreground border border-border/50">
                  <p className="font-medium mb-1 text-foreground">
                    {t('importHistory.noteTitle')}
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>{t('importHistory.noteMatch')}</li>
                    <li>{t('importHistory.noteImages')}</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="zip-file">
              {t('importHistory.conversationZip')}
            </Label>
            <Input
              id="zip-file"
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
          </div>

          {logs.length > 0 && (
            <div
              ref={logContainerRef}
              className="max-h-32 overflow-y-auto rounded border p-2 text-xs text-muted-foreground bg-secondary/20"
            >
              {logs.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}

          {stats && (
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />{' '}
                {t('importHistory.importedCount', { count: stats.success })}
              </div>
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-4 w-4" />{' '}
                {t('importHistory.unmatchedCount', { count: stats.failed })}
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4">
            <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
              {t('common.close')}
            </Button>
            <Button onClick={handleImport} disabled={!file || isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
                  {t('importHistory.processing')}
                </>
              ) : (
                t('importHistory.startParsing')
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
