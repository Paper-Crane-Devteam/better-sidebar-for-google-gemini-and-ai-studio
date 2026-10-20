import React from 'react';
import { TopLayerPortal } from './TopLayerPortal';
import { useModalStore } from '@/shared/lib/modal';
import { Button } from './ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';
import { Z_INDEX } from '@/shared/lib/z-index';

const BASE_Z = Z_INDEX.MODAL;

export const GlobalModal = () => {
  const { t } = useI18n();
  const stack = useModalStore((state) => state.stack);
  const close = useModalStore((state) => state.close);

  if (stack.length === 0) return null;

  return (
    <TopLayerPortal>
      {stack.map((current, index) => {
        const { title, content, headerActions, confirmText, cancelText, destructive, onConfirm, onCancel, type, modalClassName } = current;
        const z = BASE_Z + index;
        return (
          <div
            key={index}
            className="fixed inset-0 flex items-center justify-center"
            style={{ zIndex: z }}
          >
            {/*
              Scrim and blur live on their own leaf layer, as a *sibling* of the
              panel rather than its parent.

              A non-none `backdrop-filter` puts the element on its own compositor
              render surface, and Chromium is known to paint that surface wrong
              for a frame or two when content inside it updates quickly — see
              crbug 483220231 (flicker with high-frequency content updates) and
              497855639 (composited layers flickering while an overflow-y:auto
              container scrolls). Scrolling this dialog's body is exactly that
              kind of update. While the panel sat *inside* the blur layer, one
              bad frame took the whole dialog with it, which is what the reported
              "the popup blinks out and flashes white mid-scroll" was. As a
              sibling, the worst case is a flicker in the scrim behind a panel
              that stays where it is.

              It also makes --panel-blur mean what it says: the panel's backdrop
              root used to be the overlay wrapping it, so blurring the panel
              blurred the scrim instead of the page.
            */}
            <div
              aria-hidden="true"
              className="absolute inset-0 animate-in fade-in-0"
              style={{ backgroundColor: 'var(--overlay-bg)', backdropFilter: 'var(--overlay-blur)', WebkitBackdropFilter: 'var(--overlay-blur)' }}
            />
            {/*
              Centred by the flex parent, not by `translate(-50%, -50%)`. The
              transform was the second half of the problem: a transformed,
              fixed-position box inside a backdrop-filter layer is the pairing
              crbug 40175472 is about. `duration-200` went with it — it set
              `transition-duration` with no `transition-property`, so every
              computed-style change on the panel, colours included, animated.

              `zIndex: 1` rather than relying on DOM order alone: it keeps the
              panel above the scrim and keeps it a stacking context, which is
              what the old `zIndex: z + 1` gave it. Descendant z-indexes (see the
              z-[10050] dropdown note in CreatePromptForm) are unaffected — they
              were already scoped inside the panel.
            */}
            <div
              ref={(el) => el?.focus()}
              tabIndex={-1}
              className={cn(
                'relative flex w-full max-w-lg max-h-[95vh] flex-col sm:rounded-lg animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 overflow-hidden outline-none',
                modalClassName,
              )}
              style={{ zIndex: 1, backgroundColor: 'var(--panel-bg)', boxShadow: 'var(--shadow-panel)', backdropFilter: 'var(--panel-blur)', WebkitBackdropFilter: 'var(--panel-blur)' }}
            >
              {/* Fixed header */}
              <div className="shrink-0 px-6 pt-6 pb-2 text-center sm:text-left min-w-0 border-b border-transparent">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold leading-tight tracking-tight min-w-0 break-words">
                    {title}
                  </h2>
                  {headerActions != null && (
                    <div className="flex items-center gap-1 shrink-0">
                      {headerActions}
                    </div>
                  )}
                </div>
              </div>
              {/* Scrollable content only */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 text-sm text-muted-foreground">
                {content}
              </div>
              {/* Fixed footer */}
              <div className="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 px-6 pb-6 pt-2 border-t border-transparent">
                {type === 'confirm' && (
                  <Button variant="ghost" onClick={onCancel}>
                    {cancelText || t('common.cancel')}
                  </Button>
                )}
                <Button
                  variant={type === 'error' || destructive ? 'destructive' : 'outline'}
                  onClick={
                    type === 'confirm'
                      ? onConfirm
                      : () => {
                          onConfirm?.();
                          close();
                        }
                  }
                >
                  {confirmText || t('common.ok')}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </TopLayerPortal>
  );
};
