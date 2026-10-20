/**
 * Prompt library in AI Studio's "System instructions" panel.
 *
 * The panel gets a source switch: AI Studio (native saved list) or
 * Better Sidebar (our prompt library). In library mode AI Studio's picker and
 * title row are hidden, the toolbar fills from / saves to the library, and all
 * writes go into one dedicated native entry (see lib/system-instructions).
 *
 * First time the panel opens: a one-time hint offers the switch, and AI Studio's
 * saved instructions are imported into the library (once, de-duplicated).
 */
import React, { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { toast } from '@/shared/lib/toast';
import i18n from '@/locale/i18n';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { InjectedHost } from '@/entrypoints/overlay.content/shared/modules/prompts/instruction-fill/InjectedHost';
import { InstructionToolbar } from '@/entrypoints/overlay.content/shared/modules/prompts/instruction-fill/InstructionToolbar';
import { TextareaInstructionSlash } from '@/entrypoints/overlay.content/shared/modules/prompts/instruction-fill/InstructionSlashCommand';
import {
  LIBRARY_MODE_CLASS,
  PANEL_SELECTOR,
  createAiStudioTarget,
  ensurePanelStyles,
  forkIntoSlot,
  getPanel,
  getPanelTextarea,
  importNativeInstructions,
} from '../lib/system-instructions';

type Source = 'native' | 'library';

let importStarted = false;

/** One-time import of AI Studio's saved instructions into the library */
async function autoImportOnce() {
  if (importStarted) return;
  const { enhancedFeatures, setAIStudioEnhancedFeature } = usePegasusStore.getState();
  if (enhancedFeatures.aistudio.systemInstructionsImported) return;
  importStarted = true;

  const result = await importNativeInstructions();
  if (result.status === 'failed') {
    importStarted = false; // try again next time the panel opens
    return;
  }
  setAIStudioEnhancedFeature('systemInstructionsImported', true);
  if (result.status === 'ok') {
    toast.success(
      i18n.t('instructionPrompt.autoImported', { count: result.count, folder: result.folderName }),
      5000,
    );
  }
}

const SourceSwitch: React.FC<{ value: Source | 'unset'; onChange: (v: Source) => void }> = ({ value, onChange }) => {
  const { t } = useI18n();
  const current = value === 'library' ? 'library' : 'native';
  return (
    <SimpleTooltip content={t('instructionPrompt.sourceTooltip')}>
      <div className="flex rounded-md bg-muted/60 p-0.5 text-xs" role="radiogroup">
        {(['native', 'library'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={current === v}
            className={cn(
              'h-7 rounded px-2.5 transition-colors',
              current === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onChange(v)}
          >
            {v === 'native' ? t('instructionPrompt.sourceNative') : t('instructionPrompt.sourceLibrary')}
          </button>
        ))}
      </div>
    </SimpleTooltip>
  );
};

const PanelBar: React.FC = () => {
  const { t } = useI18n();
  const source = usePegasusStore((s) => s.enhancedFeatures.aistudio.systemInstructionSource);
  const setFeature = usePegasusStore((s) => s.setAIStudioEnhancedFeature);
  const target = useMemo(() => createAiStudioTarget(), []);
  const isLibrary = source === 'library';

  const setSource = (v: Source) => setFeature('systemInstructionSource', v);

  // Mounted = the panel is on screen
  useEffect(() => {
    void autoImportOnce();
  }, []);

  // Library mode: hide AI Studio's picker/title, and keep the user's typing out
  // of their own saved entries by moving the text into our entry on focus.
  useEffect(() => {
    const panel = getPanel();
    if (!panel) return;
    ensurePanelStyles();
    panel.classList.toggle(LIBRARY_MODE_CLASS, isLibrary);
    if (!isLibrary) return;

    const onFocusIn = (e: FocusEvent) => {
      if (e.target === getPanelTextarea()) void forkIntoSlot();
    };
    panel.addEventListener('focusin', onFocusIn);
    return () => {
      panel.removeEventListener('focusin', onFocusIn);
      panel.classList.remove(LIBRARY_MODE_CLASS);
    };
  }, [isLibrary]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SourceSwitch value={source} onChange={setSource} />
        {isLibrary && <InstructionToolbar target={target} />}
      </div>

      {source === 'unset' && (
        <div className="relative rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5 pr-8 text-xs text-foreground">
          <p className="leading-relaxed">{t('instructionPrompt.switchTip')}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => setSource('library')}>
              {t('instructionPrompt.switchTipSwitch')}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSource('native')}>
              {t('instructionPrompt.switchTipKeep')}
            </Button>
          </div>
          <button
            type="button"
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            aria-label={t('instructionPrompt.switchTipKeep')}
            onClick={() => setSource('native')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export const SystemInstructionPromptFeature: React.FC = () => {
  const slashEnabled = usePegasusStore((s) => s.enhancedFeatures.aistudio?.slashCommand ?? true);
  const isLibrary = usePegasusStore((s) => s.enhancedFeatures.aistudio?.systemInstructionSource === 'library');

  return (
    <>
      <InjectedHost
        find={() => document.querySelector(PANEL_SELECTOR)}
        place={(anchor, host) => anchor.prepend(host)}
      >
        <PanelBar />
      </InjectedHost>
      <TextareaInstructionSlash getTextarea={getPanelTextarea} enabled={slashEnabled && isLibrary} />
    </>
  );
};
