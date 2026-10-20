import React from 'react';
import { TopLayerPortal } from './TopLayerPortal';
import { useToastStore } from '@/shared/lib/toast';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils'; // Assuming cn utility exists, usually does in shadcn projects
import { Z_INDEX } from '@/shared/lib/z-index';

const icons = {
  success: <CheckCircle className="h-5 w-5 text-success" />,
  error: <AlertCircle className="h-5 w-5 text-destructive" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning" />,
};

const borderColors = {
    success: 'border-success/30',
    error: 'border-destructive/30',
    info: 'border-blue-200 dark:border-blue-900',
    warning: 'border-warning/30',
};

const bgColors = {
    success: 'bg-success/10',
    error: 'bg-destructive/10',
    info: 'bg-blue-50 dark:bg-blue-950/30',
    warning: 'bg-warning/10',
};

export const GlobalToast = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <TopLayerPortal>
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 pointer-events-none w-full max-w-sm items-center px-4"
      style={{ zIndex: Z_INDEX.TOAST }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-center gap-3 w-full p-4 rounded-md shadow-[shadow:var(--shadow-panel)] animate-in slide-in-from-top-full duration-300",
            "bg-popover text-popover-foreground", // Default fallback
            // borderColors[toast.type],
            // bgColors[toast.type]
          )}
        >
          {icons[toast.type]}
          <div className="flex-1 text-sm font-medium">{toast.message}</div>
          {toast.action && toast.action.label && (
            <button
              onClick={() => toast.action!.onClick()}
              className="text-xs font-semibold px-2 py-0.5 rounded text-primary hover:text-primary/80 hover:bg-primary/10 underline underline-offset-2 transition-colors"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => removeToast(toast.id)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
    </TopLayerPortal>
  );
};
