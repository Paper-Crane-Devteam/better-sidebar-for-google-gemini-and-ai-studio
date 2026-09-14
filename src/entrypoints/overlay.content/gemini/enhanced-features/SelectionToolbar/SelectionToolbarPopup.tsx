/**
 * SelectionToolbarPopup — The floating toolbar UI that appears near text selection.
 * Renders action buttons based on user settings.
 */

import type { SelectionToolbarConfig } from '@/shared/lib/pegasus-store';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  QuoteIcon,
  LightbulbIcon,
  BookmarkIcon,
  FileTextIcon,
  CopyIcon,
  SaveIcon,
} from 'lucide-react';

interface SelectionToolbarPopupProps {
  visible: boolean;
  position: { top: number; left: number };
  config: SelectionToolbarConfig | undefined;
  onReference: () => void;
  onExplain: () => void;
  onSummarize: () => void;
  onSaveAsSnippet: () => void;
  onCopy: () => void;
  onSaveAsPrompt: () => void;
}

export const SelectionToolbarPopup = ({
  visible,
  position,
  config,
  onReference,
  onExplain,
  onSummarize,
  onSaveAsSnippet,
  onCopy,
  onSaveAsPrompt,
}: SelectionToolbarPopupProps) => {
  const { t } = useI18n();

  if (!visible) return null;

  const actions = [
    {
      key: 'reference' as const,
      enabled: config?.reference ?? true,
      icon: QuoteIcon,
      label: t('geminiUI.selectionToolbarReference'),
      onClick: onReference,
    },
    {
      key: 'explain' as const,
      enabled: config?.explain ?? true,
      icon: LightbulbIcon,
      label: t('geminiUI.selectionToolbarExplain'),
      onClick: onExplain,
    },
    {
      key: 'summarize' as const,
      enabled: config?.summarize ?? false,
      icon: FileTextIcon,
      label: t('geminiUI.selectionToolbarSummarize'),
      onClick: onSummarize,
    },
    {
      key: 'saveAsSnippet' as const,
      enabled: config?.saveAsSnippet ?? true,
      icon: BookmarkIcon,
      label: t('geminiUI.selectionToolbarSaveAsSnippet'),
      onClick: onSaveAsSnippet,
    },
    {
      key: 'copy' as const,
      enabled: config?.copy ?? true,
      icon: CopyIcon,
      label: t('geminiUI.selectionToolbarCopy'),
      onClick: onCopy,
    },
    {
      key: 'saveAsPrompt' as const,
      enabled: config?.saveAsPrompt ?? true,
      icon: SaveIcon,
      label: t('geminiUI.selectionToolbarSaveAsPrompt'),
      onClick: onSaveAsPrompt,
    },
  ].filter((a) => a.enabled);

  if (actions.length === 0) return null;

  return (
    /*
      No entrance animation.

      It used to carry `animate-in fade-in zoom-in-95`, which read as the toolbar
      sliding in sideways rather than fading. The cause is the `translateX(-50%)`
      below: tailwindcss-animate's `enter` keyframes write the whole `transform`
      property, so the animation started the element at `translate3d(0,0,0)` and
      only landed on the centring offset at the end — half its own width of
      horizontal travel, every time. Centring by transform and animating by
      transform cannot both be true, and the centring is the part that has to be.
    */
    <div
      className="fixed pointer-events-auto"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="flex items-center gap-1 rounded-lg bg-popover p-1 shadow-[shadow:var(--shadow-popover)] whitespace-nowrap">
        {actions.map(({ key, icon: Icon, label, onClick }) => (
          <button
            key={key}
            type="button"
            title={label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClick();
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          >
            <Icon size={14} className="shrink-0" />
            <span className="whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
