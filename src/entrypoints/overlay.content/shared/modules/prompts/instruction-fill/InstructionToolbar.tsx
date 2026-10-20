import React, { useRef } from 'react';
import { BookmarkPlus, ChevronDown, Library } from 'lucide-react';
import i18n from '@/locale/i18n';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { useModalStore } from '@/shared/lib/modal';
import { usePopoverPickerStore } from '@/shared/lib/popover-picker';
import { toast } from '@/shared/lib/toast';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Button } from '@/shared/components/ui/button';
import { CreatePromptForm } from '../components/CreatePromptForm';
import { InstructionPromptPicker, type InstructionPickResult } from './InstructionPromptPicker';
import { appendContent, type InstructionTarget } from './targets';

const TITLE_MAX_LENGTH = 100;
const PICKER_WIDTH = 360;

/**
 * Open the prompt dropdown under `anchor`; the picked prompt is appended to the
 * target (or fills it when empty). A toast offers one-click undo.
 */
export async function fillFromLibrary(anchor: HTMLElement, target: InstructionTarget): Promise<void> {
  const picked = await usePopoverPickerStore.getState().open<InstructionPickResult>({
    anchorRect: anchor.getBoundingClientRect(),
    content: <InstructionPromptPicker />,
    width: PICKER_WIDTH,
    placement: 'bottom-end',
  });
  if (!picked) return;

  const previous = target.getText();
  try {
    if (target.append) target.append(picked.content);
    else await target.setText(appendContent(previous, picked.content));
  } catch (err) {
    console.error('[InstructionFill] write failed:', err);
    toast.error(i18n.t('instructionPrompt.fillFailed'));
    return;
  }

  const toastId = toast.withAction(
    i18n.t('instructionPrompt.filled', { title: picked.prompt.title }),
    'success',
    {
      label: i18n.t('instructionPrompt.undo'),
      onClick: () => {
        toast.dismiss(toastId);
        void target.setText(previous);
      },
    },
    5000,
  );
}

/** Save the target's current content as a new (system) prompt via the usual create form */
export function saveToLibrary(target: InstructionTarget): void {
  const content = target.getText().trim();
  if (!content) {
    toast.info(i18n.t('instructionPrompt.nothingToSave'));
    return;
  }

  const formRef = { current: null as HTMLFormElement | null };
  let formData = {
    title: (target.getTitle?.() ?? '').trim().slice(0, TITLE_MAX_LENGTH),
    content,
    type: 'system' as 'normal' | 'system',
    icon: 'Bot',
  };

  useModalStore.getState().open({
    type: 'confirm',
    title: i18n.t('instructionPrompt.saveTitle'),
    content: (
      <CreatePromptForm
        formRef={formRef}
        initialValues={formData}
        onChange={(d) => (formData = d)}
        onValidSubmit={async () => {
          useModalStore.getState().close();
          await useAppStore
            .getState()
            .createPrompt(formData.title, formData.content, formData.type, formData.icon, null);
          toast.success(i18n.t('instructionPrompt.saved'));
        }}
      />
    ),
    confirmText: i18n.t('common.save'),
    cancelText: i18n.t('common.cancel'),
    onConfirm: () => formRef.current?.requestSubmit(),
    onCancel: () => useModalStore.getState().close(),
    modalClassName: 'max-w-2xl',
  });
}

interface InstructionToolbarProps {
  target: InstructionTarget;
  /** Icon-only buttons, for tight spots like the Notebook settings dialog */
  compact?: boolean;
  className?: string;
  /** Rendered before the buttons (e.g. AI Studio's source switch) */
  leading?: React.ReactNode;
}

/** [Prompt Library ▾] [Save] — fill from / save to the prompt library */
export const InstructionToolbar: React.FC<InstructionToolbarProps> = ({ target, compact, className, leading }) => {
  const { t } = useI18n();
  const fillRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {leading}
      <SimpleTooltip content={t('instructionPrompt.fillFromLibrary')}>
        <Button
          ref={fillRef}
          type="button"
          variant="ghost"
          size={compact ? 'icon' : 'sm'}
          className={cn(compact ? 'h-8 w-8' : 'h-8 gap-1 px-2 text-xs')}
          aria-label={t('instructionPrompt.fillFromLibrary')}
          onClick={() => fillRef.current && void fillFromLibrary(fillRef.current, target)}
        >
          <Library className="h-4 w-4" />
          {!compact && (
            <>
              <span>{t('instructionPrompt.library')}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </>
          )}
        </Button>
      </SimpleTooltip>
      <SimpleTooltip content={t('instructionPrompt.saveToLibrary')}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('instructionPrompt.saveToLibrary')}
          onClick={() => saveToLibrary(target)}
        >
          <BookmarkPlus className="h-4 w-4" />
        </Button>
      </SimpleTooltip>
    </div>
  );
};
