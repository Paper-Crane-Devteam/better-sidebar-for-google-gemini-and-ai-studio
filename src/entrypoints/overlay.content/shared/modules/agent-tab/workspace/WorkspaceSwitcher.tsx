/**
 * WorkspaceSwitcher — the workspace selector, pinned to the bottom.
 *
 * Bottom-left is where Obsidian puts its vault switcher, and the reasoning carries over:
 * it is a once-per-task decision rather than a frequent action, so it belongs out of the
 * way of the file list while staying permanently visible as the answer to "where am I".
 *
 * Three states, and the two inert ones are the reason this is a component at all:
 *
 * - free   — a picker; this conversation has not touched a workspace yet
 * - locked — it already ran a file tool, so the workspace is fixed for good
 * - busy   — a task is running; switching under it would split its file operations
 *            across two workspaces
 */

import React from 'react';
import { Check, ChevronsUpDown, FolderOpen, Lock, Plus } from 'lucide-react';
import { usePopoverPickerStore } from '@/shared/lib/popover-picker';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { UIcon } from '@/shared/components/ui/icon';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { canCreateWorkspace } from '@/shared/workspace/limits';
import { useWorkspaceStore } from '../../agent-loop/workspace/workspace-store';

interface WorkspaceSwitcherProps {
  /** The workspace currently on screen. */
  currentId: string;
  /** Set when this conversation is locked to a workspace. */
  lockedId: string | null;
  /** Set while a task is running. */
  busy: boolean;
  onCreate: () => void;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  currentId,
  lockedId,
  busy,
  onCreate,
}) => {
  const { t } = useI18n();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const setActiveId = useWorkspaceStore((s) => s.setActiveId);

  const name = workspaces.find((w) => w.id === currentId)?.name ?? currentId;
  const disabled = lockedId !== null || busy;

  const openPicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    const anchorRect = e.currentTarget.getBoundingClientRect();

    /**
     * Whether "New workspace" is going to produce an upgrade card instead of a workspace.
     *
     * The entry stays live either way — `onCreate` shows the paywall, which is the only
     * thing that explains the limit. This decides whether it carries the premium mark, so
     * the answer is visible before the click rather than only after it.
     *
     * Read here rather than during render on purpose: the licence store is not subscribed
     * to by this component, so a value computed in the render body would stay stale until
     * something unrelated re-rendered it — and the first thing someone does after buying
     * is come straight back to this menu.
     */
    const createIsPaid = !canCreateWorkspace(workspaces.length);

    void usePopoverPickerStore.getState().open({
      anchorRect,
      width: 224,
      content: (
        // The picker resolves its own promise, so each row closes the popover itself
        // rather than the caller awaiting a value — the actions differ per row.
        <div className="-mx-3 -my-2 py-1">
          <div className="max-h-64 overflow-y-auto">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => {
                  setActiveId(ws.id);
                  usePopoverPickerStore.getState().close();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/40"
              >
                <Check
                  className={cn(
                    'h-3 w-3 shrink-0',
                    ws.id === currentId ? 'text-primary' : 'invisible',
                  )}
                />
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
          </div>

          <div className="mt-1 border-t border-border/60 pt-1">
            <button
              type="button"
              onClick={() => {
                usePopoverPickerStore.getState().close();
                onCreate();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            >
              <Plus className="h-3 w-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {t('agent.workspace.create', { defaultValue: 'New workspace' })}
              </span>
              {createIsPaid && (
                <UIcon
                  icon="fluent-color:premium-24"
                  width={12}
                  height={12}
                  className="shrink-0"
                />
              )}
            </button>
          </div>
        </div>
      ),
    });
  };

  const row = (
    <div
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
        disabled ? 'cursor-default opacity-70' : 'hover:bg-accent/40',
      )}
    >
      {lockedId ? (
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {name}
      </span>
      {!disabled && <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />}
    </div>
  );

  // Inert: explain why, and open nothing. A control that still produces a menu it will
  // not act on is the more confusing of the two options.
  if (disabled) {
    return (
      <div className="border-t border-border/60 p-1.5">
        <SimpleTooltip
          content={
            lockedId
              ? t('agent.workspace.lockedHint', {
                  defaultValue: `This conversation is using "${name}". Start a new chat to switch.`,
                })
              : t('agent.workspace.busyHint', {
                  defaultValue: 'A task is running. Finish or stop it before switching.',
                })
          }
        >
          <div>{row}</div>
        </SimpleTooltip>
      </div>
    );
  }

  return (
    <div className="border-t border-border/60 p-1.5">
      <button type="button" className="w-full" onClick={openPicker}>
        {row}
      </button>
    </div>
  );
};
