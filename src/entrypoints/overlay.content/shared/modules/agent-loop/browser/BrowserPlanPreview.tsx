/**
 * The authoritative preview of a batch, built by the backend from real objects.
 *
 * This is the Browser agent's answer to `change_summary`. The difference matters: a summary
 * is the model's *claim* about what it is doing, and for tabs and bookmarks we can do better
 * than a claim — the background resolves every id against the live browser and reports the
 * objects themselves. So the card shows both, and this part is the one that cannot be wrong.
 *
 * Lives under `agent-loop/` rather than in the Agent tab because both approval surfaces
 * render it: the tool card in the chat (`renderer/`) and the dock's copy of the same
 * decision (`agent-dock/`). See "只有一条执行路径：引擎执行，卡片批准".
 *
 * Two kinds of plan, and they are shown differently because they are different decisions:
 *
 * | plan | what is being approved | how it reads |
 * |---|---|---|
 * | `operations` | a list of changes the AI asked for | one block per operation, objects named |
 * | `restore` | one recorded state, put back | the state itself, as a tree |
 *
 * ## ⚠️ Nothing here prints an id
 *
 * Chrome's tab, window, group and bookmark ids are how an approval stays bound to the
 * objects it was granted for. They describe nothing — a user asked to authorise a change to
 * `#66` has been shown a number they cannot look up. So ids resolve in the background,
 * where the full snapshot is, and this file renders names and ordinals.
 *
 * ⚠️ It also drops two fields it *is* given. See {@link HIDDEN_FIELDS}: a resolved value is
 * not automatically worth a line.
 *
 * ⚠️ The closing warnings are chosen here, not sent by the backend. The preview says
 * *which* warning applies — `kind` and `tier` — and the wording lives with every other
 * string the user reads. A service worker has no locale and no business having one.
 */

import React from 'react';
import type {
  OperationsPlan,
  Placement,
  PlanPreview,
  RestorePlan,
} from '@/shared/browser-agent/contracts';
import { useI18n } from '@/shared/hooks/useI18n';
import { BrowserTree } from './BrowserTree';

type Translate = ReturnType<typeof useI18n>['t'];

/**
 * Fields the card never prints, however completely the backend resolved them.
 *
 * `url` and `position` are both *technically* correct and both make the card unreadable. A
 * batch of twenty tabs printed one full URL per line, wrapped, which pushed the operations
 * themselves off the visible area — and the address adds nothing next to the title the user
 * recognises anyway. `position` is worse: an approval is a decision about *what* moves, and
 * a 1-based index into a window the user cannot see counting is a number they can neither
 * check nor act on.
 *
 * ⚠️ Hidden here rather than dropped in the background, deliberately. The `Placement`
 * contract stays complete — the same resolution feeds the restore effects — and this file is
 * already the one that decides what a person reads. See the note about ids below.
 */
const HIDDEN_FIELDS = new Set(['url', 'position']);

/**
 * A place, as a `·`-joined phrase: `in this window · in group Research · pinned`.
 *
 * Every part is optional and the order is fixed, so two lines of the same kind line up
 * without a table. Returning nothing is a legitimate answer — a tab group in a
 * single-window browser has no ordinal and no folder — and what to say in that case is the
 * caller's to decide, because it depends on why the place was empty.
 */
function phrase(place: Placement, t: Translate): string[] {
  const parts: string[] = [];
  if (place.folder) parts.push(t('agent.browser.preview.inFolder', { name: place.folder, defaultValue: 'in {{name}}' }));
  if (place.hostWindow) parts.push(t('agent.browser.preview.inThisWindow', { defaultValue: 'in this window' }));
  else if (place.window !== undefined) parts.push(t('agent.browser.preview.inWindow', { n: place.window, defaultValue: 'in window {{n}}' }));
  // `''` is a group the user never named — still worth saying, since it is where the tab is.
  if (place.group) parts.push(t('agent.browser.preview.inGroup', { name: place.group, defaultValue: 'in group {{name}}' }));
  else if (place.group === '') parts.push(t('agent.browser.preview.inUnnamedGroup', { defaultValue: 'in an unnamed group' }));
  if (place.pinned) parts.push(t('agent.browser.preview.pinned', { defaultValue: 'pinned' }));
  return parts;
}

export function BrowserPlanPreview({ plan }: { plan: PlanPreview }) {
  return plan.kind === 'restore' ? <RestoreCard plan={plan} /> : <OperationsCard plan={plan} />;
}

function OperationsCard({ plan }: { plan: OperationsPlan }) {
  const { t } = useI18n();
  const untitled = t('agent.browser.preview.untitled', { defaultValue: 'Untitled' });
  return <div className="space-y-2 rounded border border-border/50 bg-background/60 p-3 text-xs text-foreground">
    <strong>{t('agent.browser.preview.scope', { count: plan.count, defaultValue: '{{count}} operations · this approval covers only the batch below' })}</strong>
    <div className="max-h-64 space-y-2 overflow-y-auto">
      {plan.items.map((item, index) => <div key={index} className="rounded bg-muted/40 p-2">
        <div className="font-medium">
          {index + 1}. {t(`agent.browser.op.${item.type}`, { defaultValue: item.type })}
        </div>
        {!!item.targetCount && <div>
          {t('agent.browser.preview.objects', { count: item.targetCount, defaultValue: '{{count}} objects affected' })}
          {item.targetCount > 100 ? t('agent.browser.preview.firstHundred', { defaultValue: ' (first 100 shown)' }) : ''}
        </div>}
        {item.targets.map((target, i) => <div key={i} className="break-all text-muted-foreground">
          {[target.title || untitled, ...phrase(target, t)].join(' · ')}
        </div>)}
        {Object.entries(item.details)
          // ⚠️ `url` survives the filter for an operation with no targets, and only there.
          // That is a `create`: nothing exists yet, so the address *is* the object being
          // approved, and hiding it would leave the user agreeing to open a page the card
          // never named. Every other operation names things the user already recognises by
          // title, and the URL beside them is the noise this filter is for.
          .filter(([key]) => !HIDDEN_FIELDS.has(key) || (key === 'url' && !item.targetCount))
          .map(([key, value]) => <div key={key} className="break-all">
            {t(`agent.browser.field.${key}`, { defaultValue: key })}: <Value field={key} value={value} />
          </div>)}
      </div>)}
    </div>
    {/* ⚠️ The scope, and it is not decoration. "32 of your tabs are not being touched" is
        what tells the user how much of their browser the agent thinks is in play; a card
        that only lists what changes cannot be checked against that. */}
    <p>{t('agent.browser.preview.untouched', { count: plan.untouched, defaultValue: '{{count}} other objects are not touched' })}</p>
    {/* The tier, said plainly and at the top of the closing note: it is the only thing
        on this card that decides whether anything can be got back. */}
    {plan.tier === 'lossy' && <p className="font-medium text-destructive">
      {t('agent.browser.preview.lossy', { defaultValue: 'This batch removes objects. It is approved on its own, every time.' })}
    </p>}
    <p className="text-muted-foreground">
      {t('agent.browser.preview.warning', { defaultValue: 'This approval covers only the operations above.' })}
    </p>
  </div>;
}

/**
 * A restore: the state being put back, and the one sentence that keeps the tree honest.
 *
 * ⚠️ `effects.extra` is not optional decoration. Restoring is additive — the objects in the
 * tree come back, and anything opened or created since is left exactly as it is — so the
 * result is the tree *plus* those extras. Someone shown only the tree will read it as a
 * promise that their browser will end up looking like this and nothing else, which is the
 * one thing it does not promise.
 */
function RestoreCard({ plan }: { plan: RestorePlan }) {
  const { t } = useI18n();
  const { restore, reopen, create, keep, extra } = plan.effects;
  return <div className="space-y-2 rounded border border-border/50 bg-background/60 p-3 text-xs text-foreground">
    <strong>
      {plan.side === 'before'
        ? t('agent.browser.restore.headingBefore', { defaultValue: 'Restore the state before this batch' })
        : t('agent.browser.restore.headingAfter', { defaultValue: 'Restore the state after this batch' })}
    </strong>
    <div className="max-h-64 overflow-y-auto rounded bg-muted/40 p-2">
      <BrowserTree nodes={plan.tree} />
    </div>
    <p>
      {t('agent.browser.restore.counts', {
        restore, reopen, create, keep,
        defaultValue: '{{restore}} to move back · {{reopen}} to reopen · {{create}} to add back · {{keep}} already in place',
      })}
    </p>
    <p className="font-medium">
      {extra
        ? t('agent.browser.restore.extra', {
            count: extra,
            defaultValue: '{{count}} things opened or added since are kept as they are. Nothing is closed or deleted.',
          })
        : t('agent.browser.restore.additive', {
            defaultValue: 'Nothing is closed or deleted. Anything newer is kept.',
          })}
    </p>
    {/* ⚠️ The tree draws this tab inside the group the snapshot recorded it in, and that is
        the one row it is about to be wrong about. The agent never moves its own tab in or
        out of a group (§13), so the snapshot's answer for it is skipped rather than
        applied — and someone approving a picture of their browser has to be told which part
        of the picture is not a promise. */}
    {plan.hostGroupKept && (
      <p>
        {t('agent.browser.restore.hostGroup', {
          defaultValue:
            'This tab is the one running the agent, so it is never moved in or out of a tab group. Its group stays exactly as it is; the rest of the state is put back around it.',
        })}
      </p>
    )}
    <p className="text-muted-foreground">
      {t('agent.browser.restore.note', {
        defaultValue: 'A reopened page comes back at its address only — form input, scroll position and page state are not restored. A re-added bookmark is a new copy.',
      })}
    </p>
  </div>;
}

/**
 * One operation parameter's value.
 *
 * Booleans render as a mark rather than a translated yes/no. "Pinned: ✓" reads the same in
 * every language, and the alternative was fourteen new strings for two words. Group colours
 * do get translated: they arrive as Chrome's English names, and an English word in the
 * middle of a Chinese sentence is exactly the kind of thing this card is not for.
 */
function Value({ field, value }: { field: string; value: string | number | boolean }) {
  const { t } = useI18n();
  if (typeof value === 'boolean') return <>{value ? '✓' : '—'}</>;
  if (field === 'color') return <>{t(`agent.browser.color.${value}`, { defaultValue: String(value) })}</>;
  // A group with no name of its own. Reads as a value here ("Group: unnamed"), where
  // `phrase` needs the same fact as part of a sentence ("in an unnamed group").
  if (field === 'group' && value === '') return <>{t('agent.browser.preview.unnamed', { defaultValue: 'unnamed' })}</>;
  return <>{String(value)}</>;
}
