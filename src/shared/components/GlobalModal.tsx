import React from 'react';
import { useModalStore } from '@/shared/lib/modal';
import { Button } from './ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';

const BASE_Z = 100;

export const GlobalModal = () => {
  const { t } = useI18n();
  const stack = useModalStore((state) => state.stack);
  const close = useModalStore((state) => state.close);

  if (stack.length === 0) return null;

  return (
    <>
      {stack.map((current, index) => {
        const { title, content, headerActions, confirmText, cancelText, onConfirm, onCancel, type, modalClassName } = current;
        const z = BASE_Z + index;
        return (
          <div
            key={index}
            className="fixed inset-0 flex items-center justify-center animate-in fade-in-0"
            style={{ zIndex: z, backgroundColor: 'var(--overlay-bg)', backdropFilter: 'var(--overlay-blur)', WebkitBackdropFilter: 'var(--overlay-blur)' }}
          >
            <div
              ref={(el) => el?.focus()}
              tabIndex={-1}
              className={cn(
                'fixed left-[50%] top-[50%] flex w-full max-w-lg max-h-[95vh] translate-x-[-50%] translate-y-[-50%] flex-col border shadow-lg duration-200 sm:rounded-lg animate-in fade-in-0 zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-48 overflow-hidden outline-none',
                modalClassName,
              )}
              style={{ zIndex: z + 1, backgroundColor: 'var(--panel-bg)', backdropFilter: 'var(--panel-blur)', WebkitBackdropFilter: 'var(--panel-blur)' }}
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
                  variant={type === 'error' ? 'destructive' : 'outline'}
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
    </>
  );
};
