import { useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ExtensionResponse } from '@/shared/types/messages';
import { modal } from '@/shared/lib/modal';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';

export const useDataManagement = () => {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const setIsScanning = useAppStore((state) => state.setIsScanning);

  const exportData = async () => {
    setIsLoading(true);
    let onMessage: ((message: any) => void) | null = null;

    try {
      const chunkBuffer: string[] = [];
      let resolveTransfer: (data: string) => void;
      let rejectTransfer: (err: Error) => void;
      const transferPromise = new Promise<string>((res, rej) => {
        resolveTransfer = res;
        rejectTransfer = rej;
      });

      onMessage = (message: any) => {
        if (message.type === 'EXPORT_CHUNK') {
          const { chunk, index, total } = message.payload;
          chunkBuffer[index] = chunk;

          // Count received chunks
          let receivedCount = 0;
          for (let i = 0; i < total; i++) {
            if (chunkBuffer[i]) receivedCount++;
          }

          if (receivedCount === total) {
            resolveTransfer(chunkBuffer.join(''));
          }
        }
      };
      browser.runtime.onMessage.addListener(onMessage);

      const response = (await browser.runtime.sendMessage({
        type: 'EXPORT_DATABASE',
      })) as ExtensionResponse;

      if (!response.success) {
        throw new Error(response.error);
      }

      let base64 = '';

      // Check if response indicates chunked transfer
      if (response.data && response.data.chunked) {
        console.log('Receiving chunked export...');
        base64 = await transferPromise;
      } else {
        base64 = response.data;
      }

      // Convert Base64 back to Uint8Array for download
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
      const filename = `ai-studio-backup-${new Date().toISOString().split('T')[0]}.db`;

      // Don't auto-click: preparing a large DB can outlast Chrome's user-activation
      // window, and the download then gets silently blocked as an "automatic download"
      // (never shows in chrome://downloads). Let the user trigger it with a fresh click.
      // Persistent toast; the X button dismisses it if the user changes their mind.
      const toastId = toast.withAction(t('toast.exportReady'), 'success', {
        label: t('toast.saveFile'),
        onClick: () => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          // Delay revoke so download managers that re-fetch the blob URL still find it.
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          toast.dismiss(toastId);
        },
      });
    } catch (error) {
      console.error('Export failed', error);
      toast.error(t('toast.exportFailed'));
    } finally {
      if (onMessage) {
        browser.runtime.onMessage.removeListener(onMessage);
      }
      setIsLoading(false);
    }
  };

  const importData = async (file: File) => {
    setIsLoading(true);
    try {
      // Convert file to Base64 string to avoid serialization issues
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (e.g., "data:application/octet-stream;base64,")
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Chunk import data if too large
      const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
      if (base64.length > CHUNK_SIZE) {
        const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
        for (let i = 0; i < totalChunks; i++) {
          const chunk = base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const response = (await browser.runtime.sendMessage({
            type: 'IMPORT_DATABASE',
            payload: {
              data: chunk,
              chunk: { index: i, total: totalChunks },
            },
          })) as ExtensionResponse;

          if (!response.success) throw new Error(response.error);
        }
      } else {
        const response = (await browser.runtime.sendMessage({
          type: 'IMPORT_DATABASE',
          payload: { data: base64 },
        })) as ExtensionResponse;
        if (!response.success) throw new Error(response.error);
      }

      toast.success(t('toast.importSuccessful'));
      // Data will be refreshed automatically via DATA_UPDATED notification from background
    } catch (error) {
      console.error('Import failed', error);
      toast.error(t('toast.importFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const resetData = async () => {
    const confirmed = await modal.confirm({
      title: t('dataManagement.resetDatabase'),
      content: t('dataManagement.resetDatabaseConfirm'),
      confirmText: t('modal.reset'),
      cancelText: t('common.cancel'),
    });

    if (!confirmed) return;

    setIsLoading(true);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'RESET_DATABASE',
      })) as ExtensionResponse;

      if (!response.success) {
        throw new Error(response.error);
      }

      toast.success(t('toast.resetSuccessful'));
      // Data will be refreshed automatically via DATA_UPDATED notification from background
    } catch (error) {
      console.error('Reset failed', error);
      toast.error(t('toast.resetFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const scanLibrary = async () => {
    setIsLoading(true);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'SCAN_LIBRARY',
      })) as ExtensionResponse;

      if (!response.success) {
        throw new Error(response.error);
      }

      setIsScanning(true);
      toast.success(t('toast.scanStarted'));
    } catch (error) {
      console.error('Scan failed', error);
      toast.error(t('toast.scanStartFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return { exportData, importData, resetData, scanLibrary, isLoading };
};
