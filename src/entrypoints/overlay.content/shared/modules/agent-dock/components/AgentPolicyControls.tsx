/**
 * AgentPolicyControls — what the agent may do without asking.
 *
 * One switch per kind of tool call, which is the whole model: queries and changes.
 * Everything else about approval is a scope chosen at the moment of asking (this
 * call / the rest of this response / the rest of this task), so it belongs on the
 * approval prompt, not here.
 *
 * Plus "keep going on its own", which is a different axis: whether the loop may run
 * unattended at all. It intersects with the two above rather than overriding them
 * (see `shouldAutoSend`), so it can only ever make things more manual. The note under
 * it spells out the part the labels don't: approving a step also hands you the send.
 *
 * These are long-standing preferences, so by rights they belong in Settings → Agent,
 * next to skills and tools. They're behind the dock's gear for now because that
 * settings section doesn't exist yet (the feature still borrows the slash-command
 * flag). Folded away by default either way: the moment anyone wants them is the
 * moment they're tired of being asked, and that moment happens right here.
 */

import React from 'react';
import { Switch } from '@/shared/components/ui/switch';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAgentPolicyStore } from '../../agent-loop/agent-policy-store';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';

export const AgentPolicyControls: React.FC = () => {
  const { t } = useI18n();
  /**
   * The Browser agent answers to neither data switch, so it does not get them.
   *
   * Its rule is fixed in the tool layer: reads never ask, writes always do, one batch at a
   * time, and no preference can waive it (`requiresApproval`). Drawing switches that the
   * running agent ignores is worse than drawing none — the user would turn one on and
   * reasonably conclude the confirmations that keep coming are a bug.
   *
   * ⚠️ "Keep going on its own" stays, and that is not an oversight. It is a different axis:
   * not *whether to ask* but *who presses send* once a step is settled, and it applies here
   * exactly as it does elsewhere.
   */
  const browserMode = useAgentLoopStore((s) => s.activeAgentId === 'browser');
  const autoRunReads = useAgentPolicyStore((s) => s.autoRunReads);
  const setAutoRunReads = useAgentPolicyStore((s) => s.setAutoRunReads);
  const autoRunWrites = useAgentPolicyStore((s) => s.autoRunWrites);
  const setAutoRunWrites = useAgentPolicyStore((s) => s.setAutoRunWrites);
  const autoContinue = useAgentPolicyStore((s) => s.autoContinue);
  const setAutoContinue = useAgentPolicyStore((s) => s.setAutoContinue);

  return (
    <div className="space-y-2 rounded-md border border-border/40 p-3">
      {browserMode ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('agent.policy.browserFixed', {
            defaultValue:
              'Reading your tabs and bookmarks never needs approval. Every change does, one batch at a time — that cannot be switched off.',
          })}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <label className="text-xs text-foreground">
                {t('agent.policy.autoReads', { defaultValue: 'Run queries without asking' })}
              </label>
            </div>
            <Switch checked={autoRunReads} onCheckedChange={setAutoRunReads} />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <label className="text-xs text-foreground">
                {t('agent.policy.autoWrites', { defaultValue: 'Change data without asking' })}
              </label>
              <p className="text-xs text-muted-foreground">
                {t('agent.policy.autoWritesHint', {
                  defaultValue:
                    "You can undo a task's changes afterwards, but only until the next one starts",
                })}
              </p>
            </div>
            <Switch checked={autoRunWrites} onCheckedChange={setAutoRunWrites} />
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <label className="text-xs text-foreground">
            {t('agent.policy.autoContinue', { defaultValue: 'Keep going on its own' })}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('agent.policy.autoContinueHint', {
              defaultValue: 'Off means you press Enter after every step',
            })}
          </p>
        </div>
        <Switch checked={autoContinue} onCheckedChange={setAutoContinue} />
      </div>

      {/* Spells out what "keep going" now covers. Approving a step used to still
          leave the send to the user; it no longer does, and a stale hint here is
          worse than none. */}
      {autoContinue && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('agent.policy.sendHint', {
            defaultValue:
              'Steps you approve are sent on automatically. Turn this off to press Enter yourself each time.',
          })}
        </p>
      )}

      {/* Taking back "don't ask again for this task" lives on the dock's pill, not
          here: switching it on removes every prompt that would open this panel, so the
          way out can't be behind a fold. */}
    </div>
  );
};
