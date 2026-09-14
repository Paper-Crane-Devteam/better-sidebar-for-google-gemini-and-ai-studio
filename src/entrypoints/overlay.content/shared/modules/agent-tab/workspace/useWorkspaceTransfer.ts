/**
 * Upload and export, plus the reporting that makes their outcomes visible.
 *
 * Split out of `WorkspaceView` because the view's job is layout and this is a small state
 * machine: a hidden input to trigger, a destination to remember between the click and the
 * `change` event, a progress label, and a report to translate into a sentence.
 *
 * ## Why the destination is a ref
 *
 * `<input type="file">` cannot be opened programmatically with an argument. Picking a
 * folder from a row's menu therefore has to record where the files should land, then
 * click the input, and read the destination back when the event fires. State would work
 * but would re-render the tree between the click and the dialog for no reason.
 */

import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import { showPowerPackPaywall } from '@/shared/lib/powerpack-paywall';
import { fileBudget } from '@/shared/workspace/limits';
import {
  collectFromDataTransfer,
  collectFromInput,
  downloadZip,
  uploadFiles,
  type PickedFile,
  type UploadReport,
} from './workspace-io';

export interface UseWorkspaceTransferResult {
  /** Attach to a hidden `<input type="file" multiple>`. */
  fileInputRef: RefObject<HTMLInputElement | null>;
  /** Attach to a hidden `<input type="file" webkitdirectory>`. */
  dirInputRef: RefObject<HTMLInputElement | null>;
  /** Non-null while a transfer is in flight; render it as a status line. */
  progress: string | null;
  /** Open the file picker, writing into `destDir` ('' for the workspace root). */
  pickFiles: (destDir?: string) => void;
  /** Open the folder picker. */
  pickFolder: (destDir?: string) => void;
  /** Handle either hidden input's `change`. */
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Write files gathered from a drop. */
  dropFiles: (dataTransfer: DataTransfer, destDir?: string) => Promise<void>;
  /** Export a subtree, or the whole workspace when `base` is ''. */
  exportZip: (base: string, name: string) => Promise<void>;
}

export function useWorkspaceTransfer(
  workspaceId: string,
  reload: () => Promise<void>,
): UseWorkspaceTransferResult {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const destRef = useRef('');
  const [progress, setProgress] = useState<string | null>(null);

  /**
   * Turn a report into one sentence.
   *
   * Everything that was silently adjusted has to appear here — a renamed file and a
   * stored-but-unreadable binary are both surprises the user would otherwise meet much
   * later, when the agent cannot find the name they remember typing.
   */
  const reportUpload = useCallback(
    (report: UploadReport) => {
      const parts: string[] = [];

      if (report.written.length > 0) {
        parts.push(
          t('agent.workspace.uploadedCount', {
            defaultValue: `Added ${report.written.length} file(s)`,
            count: report.written.length,
          }),
        );
      }
      if (report.renamed.length > 0) {
        parts.push(
          t('agent.workspace.renamedCount', {
            defaultValue: `${report.renamed.length} renamed to avoid overwriting`,
            count: report.renamed.length,
          }),
        );
      }
      if (report.binary.length > 0) {
        parts.push(
          t('agent.workspace.binaryCount', {
            defaultValue: `${report.binary.length} binary (stored, but the agent cannot read them)`,
            count: report.binary.length,
          }),
        );
      }

      if (report.written.length === 0 && report.failed.length > 0) {
        // Nothing landed, so the reason matters more than the tally. One example is
        // enough to act on and short enough to read in a toast.
        toast.error(`${report.failed[0].path}: ${report.failed[0].error}`);
        return;
      }

      if (report.failed.length > 0) {
        parts.push(
          t('agent.workspace.failedCount', {
            defaultValue: `${report.failed.length} failed`,
            count: report.failed.length,
          }),
        );
      }

      if (parts.length > 0) toast.success(parts.join(' · '), 3000);
    },
    [t],
  );

  /**
   * Import, up to whatever the free tier still allows.
   *
   * Partial rather than all-or-nothing. Someone on the free plan dropping ten files into
   * an empty workspace has five slots they are entitled to, and refusing the batch would
   * withhold those to make a point about the other five. So the first `remaining` land
   * normally — the usual toast reports them — and the paywall follows to account for the
   * rest. Shown after the upload, so it is the last thing on screen rather than a modal
   * over a progress line.
   */
  const run = useCallback(
    async (picked: PickedFile[], destDir: string) => {
      if (picked.length === 0) return;

      const budget = await fileBudget(workspaceId);
      const allowed = budget.unlimited ? picked : picked.slice(0, budget.remaining);
      const skipped = picked.length - allowed.length;

      const overLimit = () => {
        if (skipped === 0) return;
        showPowerPackPaywall(
          // `files` rather than `count`: a `count` param puts i18next into plural
          // resolution, which then needs `_one`/`_other` variants in every locale for a
          // string that reads the same either way.
          t('agent.workspace.paywallFilesSkipped', {
            defaultValue: `${skipped} file(s) not added — the free limit is ${budget.max} per workspace`,
            files: skipped,
            max: budget.max,
          }),
        );
      };

      if (allowed.length === 0) {
        overLimit();
        return;
      }

      setProgress(
        t('agent.workspace.uploading', {
          defaultValue: `Uploading 0/${allowed.length}…`,
          done: 0,
          total: allowed.length,
        }),
      );

      try {
        const report = await uploadFiles(workspaceId, allowed, destDir, (done, total) => {
          setProgress(
            t('agent.workspace.uploading', {
              defaultValue: `Uploading ${done}/${total}…`,
              done,
              total,
            }),
          );
        });
        await reload();
        reportUpload(report);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setProgress(null);
      }

      overLimit();
    },
    [reload, reportUpload, t, workspaceId],
  );

  const pickFiles = useCallback((destDir = '') => {
    destRef.current = destDir;
    fileInputRef.current?.click();
  }, []);

  const pickFolder = useCallback((destDir = '') => {
    destRef.current = destDir;
    dirInputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const picked = collectFromInput(e.target.files);
      // Cleared immediately so picking the same file twice in a row still fires `change`,
      // which it otherwise would not — the value would be unchanged.
      e.target.value = '';
      void run(picked, destRef.current);
    },
    [run],
  );

  const dropFiles = useCallback(
    async (dataTransfer: DataTransfer, destDir = '') => {
      // Must complete before anything else awaits: the item list is only alive for the
      // synchronous part of the drop handler. See `collectFromDataTransfer`.
      const picked = await collectFromDataTransfer(dataTransfer);
      if (picked.length === 0) {
        toast.error(
          t('agent.workspace.dropEmpty', {
            defaultValue: 'Nothing to upload from that drop.',
          }),
        );
        return;
      }
      await run(picked, destDir);
    },
    [run, t],
  );

  const exportZip = useCallback(
    async (base: string, name: string) => {
      setProgress(
        t('agent.workspace.zipping', { defaultValue: 'Preparing archive…' }),
      );
      try {
        const result = await downloadZip(workspaceId, {
          base,
          name,
          onProgress: (done, total) =>
            setProgress(
              t('agent.workspace.zippingProgress', {
                defaultValue: `Preparing archive ${done}/${total}…`,
                done,
                total,
              }),
            ),
        });

        if (result.files === 0) {
          toast.error(
            t('agent.workspace.zipEmpty', { defaultValue: 'Nothing to export.' }),
          );
          return;
        }
        if (result.failed.length > 0) {
          // The archive downloaded anyway, so this is a warning about what is missing
          // from it rather than a failure of the export.
          toast.error(
            t('agent.workspace.zipPartial', {
              defaultValue: `Exported ${result.files} file(s); ${result.failed.length} could not be read.`,
              count: result.files,
              failed: result.failed.length,
            }),
          );
          return;
        }
        toast.success(
          t('agent.workspace.zipDone', {
            defaultValue: `Exported ${result.files} file(s).`,
            count: result.files,
          }),
          2000,
        );
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setProgress(null);
      }
    },
    [t, workspaceId],
  );

  return {
    fileInputRef,
    dirInputRef,
    progress,
    pickFiles,
    pickFolder,
    onInputChange,
    dropFiles,
    exportZip,
  };
}
