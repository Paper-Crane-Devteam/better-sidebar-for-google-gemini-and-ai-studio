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
 * ## ⚠️ Nothing here prints an id
 *
 * The card used to render the snapshot rows as they came, which meant a line like
 * `#66 · was at 7 · was in 1` — a bookmark named by its Chrome id, its 0-based array index,
 * and the *id* of its parent folder. Three numbers, none of which the user has ever seen or
 * can look up, on the one screen where they are being asked to authorise something. The
 * operation params were worse: `Object: 53` was the label `field.id` applied to the id of
 * the very bookmark named on the line above.
 *
 * So ids resolve in the background, where the full snapshot is (`Placement` in
 * `contracts.ts`), and this file renders names, ordinals and 1-based positions. The ids
 * still exist — they are how an approval stays bound to the objects it was granted for —
 * they are simply not a description of anything, so they are not shown.
 *
 * ⚠️ The closing warnings are chosen here, not sent by the backend. They used to be literal
 * sentences on `PlanPreview.warning`, composed in the service worker — which has no locale
 * and no business having one. `plan.undo` and `plan.tier` say *which* warning applies, and
 * the wording lives with every other string the user reads.
 */

import React from 'react';
import type { Placement, PlanPreview } from '@/shared/browser-agent/contracts';
import { useI18n } from '@/shared/hooks/useI18n';

type Translate = ReturnType<typeof useI18n>['t'];

/**
 * A place, as a `·`-joined phrase: `news.ycombinator.com/… · in this window · position 4`.
 *
 * Every part is optional and the order is fixed, so two lines of the same kind line up
 * without a table. Returning nothing is a legitimate answer — a tab group in a
 * single-window browser has no ordinal, no folder and no position — and what to say in
 * that case is the caller's to decide, because it depends on why the place was empty.
 */
function phrase(place: Placement, t: Translate): string[] {
  const parts: string[] = [];
  if (place.url) parts.push(place.url);
  if (place.folder) parts.push(t('agent.browser.preview.inFolder', { name: place.folder, defaultValue: 'in {{name}}' }));
  if (place.hostWindow) parts.push(t('agent.browser.preview.inThisWindow', { defaultValue: 'in this window' }));
  else if (place.window !== undefined) parts.push(t('agent.browser.preview.inWindow', { n: place.window, defaultValue: 'in window {{n}}' }));
  // `''` is a group the user never named — still worth saying, since it is where the tab is.
  if (place.group) parts.push(t('agent.browser.preview.inGroup', { name: place.group, defaultValue: 'in group {{name}}' }));
  else if (place.group === '') parts.push(t('agent.browser.preview.inUnnamedGroup', { defaultValue: 'in an unnamed group' }));
  if (place.position !== undefined) parts.push(t('agent.browser.preview.atPosition', { n: place.position, defaultValue: 'position {{n}}' }));
  if (place.pinned) parts.push(t('agent.browser.preview.pinned', { defaultValue: 'pinned' }));
  return parts;
}

export function BrowserPlanPreview({ plan }: { plan: PlanPreview }) {
  const { t } = useI18n();
  const untitled = t('agent.browser.preview.untitled', { defaultValue: 'Untitled' });
  return <div className="space-y-2 rounded border border-border/50 bg-background/60 p-3 text-xs text-foreground">
    <strong>{t('agent.browser.preview.scope', { count: plan.count, defaultValue: '{{count}} operations · this approval covers only the batch below' })}</strong>
    <div className="max-h-64 space-y-2 overflow-y-auto">
      {plan.items.map((item, index) => <div key={index} className="rounded bg-muted/40 p-2">
        <div className="font-medium">
          {index + 1}. {item.undo ? t('agent.browser.preview.undoPrefix', { defaultValue: 'Undo: ' }) : ''}
          {t(`agent.browser.op.${item.type}`, { defaultValue: item.type })}
        </div>
        {!!item.targetCount && <div>
          {t('agent.browser.preview.objects', { count: item.targetCount, defaultValue: '{{count}} objects affected' })}
          {item.targetCount > 100 ? t('agent.browser.preview.firstHundred', { defaultValue: ' (first 100 shown)' }) : ''}
        </div>}
        {item.targets.map((target, i) => <div key={i} className="break-all text-muted-foreground">
          {[target.title || untitled, ...phrase(target, t)].join(' · ')}
        </div>)}
        {Object.entries(item.details).map(([key, value]) => <div key={key} className="break-all">
          {t(`agent.browser.field.${key}`, { defaultValue: key })}: <Value field={key} value={value} />
        </div>)}
        {item.changes?.map((change, i) => <div key={i} className="mt-2 break-all border-t border-border/40 pt-1">
          <div>{change.title || untitled}</div>
          <div>{t('agent.browser.preview.current', { defaultValue: 'Now' })}: <Placed place={change.from} /></div>
          <div>{t('agent.browser.preview.restoreTo', { defaultValue: 'Restore to' })}: <Placed place={change.to} /></div>
        </div>)}
      </div>)}
    </div>
    {/* The tier, said plainly and at the top of the closing note: it is the only thing
        on this card that decides whether anything can be got back. */}
    {plan.tier === 'lossy' && <p className="font-medium text-destructive">
      {t('agent.browser.preview.lossy', { defaultValue: 'This batch removes objects. It is approved on its own, every time.' })}
    </p>}
    <p className="text-muted-foreground">
      {plan.undo
        ? t('agent.browser.preview.undoWarning', { defaultValue: 'Undo needs approval too, and stops as soon as it finds an external change.' })
        : t('agent.browser.preview.warning', { defaultValue: 'This approval covers only the operations above.' })}
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

/**
 * A resolved place.
 *
 * ⚠️ Absent and featureless are two different answers. No `place` at all means the object
 * is not there — the state an undo is restoring *from* when it is reopening a closed tab,
 * and the one sentence on this card that must not be softened. A `place` that resolved to
 * nothing sayable is a different thing entirely: a tab group in a browser with one window
 * has no ordinal, no folder and no position, and reporting that as "does not exist" would
 * be a lie about an object sitting right there.
 */
function Placed({ place }: { place?: Placement }) {
  const { t } = useI18n();
  if (!place) return <>{t('agent.browser.preview.absent', { defaultValue: 'does not exist' })}</>;
  const parts = phrase(place, t);
  if (!parts.length) return <>{t('agent.browser.preview.unchangedPlace', { defaultValue: 'no details to show' })}</>;
  return <>{parts.join(' · ')}</>;
}

/**
 * One raw snapshot row, for the journal panel — the same output as `Placed`, from data the
 * background never resolved.
 *
 * ⚠️ The journal reads its change rows through `browser_query_changes`, the agent's own
 * tool, so that the panel obeys the same read permissions the AI does. That payload keeps
 * its ids, because the AI needs them to act — and it arrives without the surrounding
 * snapshot, so a folder id cannot be turned into a folder name here.
 *
 * What that means for this component: the id-bearing fields are dropped rather than
 * printed, and `other` (the row's counterpart on the other side of the change) is compared
 * so that a move between two windows still *says* it moved. Otherwise before and after
 * would render identically and the change would look like nothing at all.
 */
export function BrowserState({ value, other }: { value?: unknown; other?: unknown }) {
  const { t } = useI18n();
  const row = value as Record<string, unknown> | undefined;
  if (!row) return <>{t('agent.browser.preview.absent', { defaultValue: 'does not exist' })}</>;
  const peer = other as Record<string, unknown> | undefined;
  const parts = phrase({
    ...(typeof row.url === 'string' ? { url: row.url } : {}),
    ...(typeof row.index === 'number' ? { position: row.index + 1 } : {}),
    ...(row.pinned === true ? { pinned: true } : {}),
  }, t);
  // Named containers we cannot name. Said only when it actually differs, and only ever as
  // "another one" — the alternative is printing the id, which is what this is replacing.
  const moved: Array<[string, string, string]> = [
    ['windowId', 'agent.browser.preview.otherWindow', 'in another window'],
    ['parentId', 'agent.browser.preview.otherFolder', 'in another folder'],
    ['groupId', 'agent.browser.preview.otherGroup', 'in another group'],
  ];
  for (const [key, id, fallback] of moved) {
    if (peer && row[key] !== undefined && peer[key] !== undefined && row[key] !== peer[key]) {
      parts.push(t(id, { defaultValue: fallback }));
    }
  }
  if (row.collapsed === true) parts.push(t('agent.browser.preview.collapsed', { defaultValue: 'collapsed' }));
  if (typeof row.color === 'string') parts.push(t(`agent.browser.color.${row.color}`, { defaultValue: row.color }));
  if (!parts.length) return <>{t('agent.browser.preview.unchangedPlace', { defaultValue: 'no details to show' })}</>;
  return <>{parts.join(' · ')}</>;
}
