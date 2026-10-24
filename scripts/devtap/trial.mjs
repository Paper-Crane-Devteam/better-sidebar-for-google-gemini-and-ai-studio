/**
 * devtap trial — put the dev profile into any Power Pack trial state.
 *
 * The local trial is just a start time in storage.local (see
 * src/shared/lib/trial-store.ts), and every extension context rehydrates when it
 * changes, so rewriting that one key is enough to see the popup, the paywall
 * gates and the "trial ended" dialog as a new user would. No reinstall needed.
 *
 *   trial [status]          what is stored now, and what the popup should show
 *   trial start             just installed: full trial from now
 *   trial left <dur>        trial with this much time left (30s, 5h, 2d)
 *   trial end               trial already over, "ended" prompt not yet shown
 *   trial reset             no trial yet; the next Gemini / AI Studio load starts one
 *   trial license off|on    stash / restore your own license, so a paid Power Pack
 *                           dev profile can see what a free user sees
 *
 * Reopen the popup after a change. Tabs pick it up live, except the "trial
 * ended" dialog, which only checks on page load: reload the tab for that one.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { attach, evaluate } from './cdp.mjs';
import { CTX, discover } from './contexts.mjs';
import { emit, parseDuration } from './args.mjs';
import { inAnyExtensionWorld } from './probe.mjs';

const TRIAL_KEY = 'better-sidebar-trial';
const LICENSE_KEY = 'better-sidebar-license';
const STASH_KEY = 'devtap-stashed-license';

/** Read the trial length from the source so this never drifts from the app. */
function trialMs() {
  const src = readFileSync(resolve('src/shared/lib/trial-store.ts'), 'utf8');
  const days = Number(/LOCAL_TRIAL_DAYS\s*=\s*(\d+(?:\.\d+)?)/.exec(src)?.[1] ?? 3);
  return days * 86_400_000;
}

/**
 * Runs in the extension (background, or a content script world when the worker
 * is asleep). Uses `chrome.*`: `browser` is only a global in the background.
 */
function storageProgram(op) {
  return `(async () => {
    const op = ${JSON.stringify(op)};
    const s = chrome.storage.local;
    const TK = ${JSON.stringify(TRIAL_KEY)}, LK = ${JSON.stringify(LICENSE_KEY)}, SK = ${JSON.stringify(STASH_KEY)};
    const writeTrial = (startedAt) => s.set({ [TK]: JSON.stringify({
      state: { localTrialStartedAt: startedAt, endPromptsShown: [] }, version: 1 }) });

    if (op.kind === 'trial') {
      if (op.startedAt === null) await s.remove(TK); else await writeTrial(op.startedAt);
    }
    if (op.kind === 'license-off') {
      const cur = (await s.get(LK))[LK];
      if (cur) { await s.set({ [SK]: cur }); await s.remove(LK); }
    }
    if (op.kind === 'license-on') {
      const stashed = (await s.get(SK))[SK];
      if (stashed) { await s.set({ [LK]: stashed }); await s.remove(SK); }
    }

    const all = await s.get([TK, LK, SK]);
    const parse = (v) => { try { return JSON.parse(v).state ?? null; } catch { return null; } };
    return JSON.stringify({ trial: parse(all[TK]), license: parse(all[LK]), stashed: !!all[SK] });
  })()`;
}

/** Background if it is awake, otherwise any tab's content script world. */
async function runInExtension(flags, expression) {
  const { extId, roots } = await discover(flags.port);
  const bg = roots.find((r) => r.ctx === CTX.BG);
  if (bg) {
    const session = await attach(bg.target);
    try {
      return await evaluate(session, expression);
    } finally {
      session.close();
    }
  }
  const pages = roots.filter((r) => r.ctx === CTX.PAGE);
  if (!pages.length) {
    throw new Error('Background is asleep and no Gemini / AI Studio tab is open. Open one and retry.');
  }
  return inAnyExtensionWorld(pages, extId, (session, contextId) =>
    evaluate(session, expression, { contextId }),
  );
}

function fmtLeft(ms) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, !d && !h && !m && `${s}s`].filter(Boolean).join(' ');
}

function describe({ trial, license, stashed }, total) {
  const now = Date.now();
  const lines = [];

  const start = trial?.localTrialStartedAt ?? null;
  const end = start ? start + total : null;
  if (!start) lines.push('local trial   not started (starts on the next Gemini / AI Studio page load)');
  else if (now < end) lines.push(`local trial   active, ${fmtLeft(end - now)} left (ends ${new Date(end).toLocaleString()})`);
  else lines.push(`local trial   ended ${fmtLeft(now - end)} ago`);
  if (trial?.endPromptsShown?.length) lines.push(`ended prompts shown: ${trial.endPromptsShown.join(', ')}`);

  const paidPower =
    license?.isActivated && ['power_pack', 'pro'].includes(license.tier) && !license.endsAt;
  if (!license?.isActivated) lines.push('license       none');
  else {
    const ends = license.endsAt ? `, time-limited until ${new Date(license.endsAt).toLocaleString()}` : '';
    lines.push(`license       ${license.tier}${ends}`);
  }
  if (stashed) lines.push('              (your own license is stashed: `trial license on` restores it)');

  const trialActive = (end && now < end) || (license?.endsAt && now < license.endsAt);
  const popup = paidPower
    ? 'Power Member (paid Power Pack hides the trial; try `trial license off`)'
    : trialActive
      ? 'Power Pack Trial + days left'
      : license?.tier === 'support_pack'
        ? 'Supporter'
        : 'plain header';
  lines.push('', `popup should show: ${popup}`);
  return lines.join('\n');
}

export async function cmdTrial(flags) {
  const [, sub = 'status', arg] = flags._;
  const total = trialMs();
  const now = Date.now();

  let op = { kind: 'read' };
  if (sub === 'start') op = { kind: 'trial', startedAt: now };
  else if (sub === 'left') {
    const left = parseDuration(arg);
    if (left == null) throw new Error('Usage: devtap trial left <duration>, e.g. 30s, 5h, 2d');
    op = { kind: 'trial', startedAt: now - total + left };
  } else if (sub === 'end') op = { kind: 'trial', startedAt: now - total - 60_000 };
  else if (sub === 'reset') op = { kind: 'trial', startedAt: null };
  else if (sub === 'license' && (arg === 'off' || arg === 'on')) op = { kind: `license-${arg}` };
  else if (sub !== 'status') {
    throw new Error('Usage: devtap trial [status | start | left <dur> | end | reset | license off|on]');
  }

  const raw = await runInExtension(flags, storageProgram(op));
  const out = describe(JSON.parse(raw), total);
  const hint =
    sub === 'end' ? '\n\nReload a Gemini / AI Studio tab to get the "trial ended" dialog.' : '';
  emit(out + hint, { out: flags.out, quiet: flags.quiet, label: 'trial' });
}
