/**
 * Browser tools — the agent's tabs / groups / bookmarks vocabulary.
 *
 * Same contract as `workspace-tools.ts`: each function returns the text the AI reads next
 * and never throws, because the loop's job after a failed step is to try something else
 * rather than unwind. Failures come back as `ERROR: …`, and every string that leaves here
 * goes through `safeBrowserText` first — a background error routinely quotes the URL it
 * choked on, and that string is about to become a permanent message in the user's chat.
 *
 * ## Reads execute here; writes do not
 *
 * ⚠️ **A write is two calls with a human in between**, so it cannot live behind a single
 * `execute`. `prepare` resolves the operations against the live browser and returns the real
 * objects they would touch; the user approves *that*; only then does `commit` run. The
 * engine drives that sequence (`engine/stages/execute-tools.ts`) because the approval gate
 * is the only thing that sits between the two halves.
 *
 * The write providers therefore keep an `execute` that refuses. It is unreachable through
 * the engine, and that is the point of it being loud rather than absent: anything that finds
 * a way to call a browser write without a prepared plan has bypassed the approval, and
 * silently applying it would be the worst possible outcome.
 */

import { isBrowserWrite } from '@/shared/browser-agent/contracts';
import { browserRequest, safeBrowserText } from '../browser/browser-store';

/**
 * Run a read tool and hand back its JSON.
 *
 * JSON rather than a formatted table, unlike the workspace tools: the model's next move is
 * almost always to feed these ids straight back into an `operations` array, and prose it has
 * to re-parse is where wrong ids come from. The shapes are small and self-describing
 * (`{ total, items, next_offset }`), so the cost is low.
 */
export async function browserReadTool(
  name: string,
  params: Record<string, string>,
): Promise<string> {
  try {
    return JSON.stringify(await browserRequest({ action: 'read', tool: name, params }));
  } catch (e) {
    return `ERROR: ${safeBrowserText((e as Error)?.message ?? String(e))}`;
  }
}

/** The refusal a browser write answers with when it was not reached through the engine. */
export function browserWriteUnavailable(name: string): string {
  return (
    `ERROR: "${name}" changes the browser, so it only runs as a batch the user has ` +
    'approved. Issue the call as normal — the extension builds the preview and asks them. ' +
    'If you are seeing this, the call did not go through the agent loop; report it and stop.'
  );
}

/**
 * Bind a tool name to its executor. Reads run; writes explain themselves.
 *
 * ⚠️ No licence check on this path. Reading tabs, groups, bookmarks and the journal is free on
 * every plan — the Browser agent is paid at the point a change is applied, not at the point it
 * looks (`engine/stages/execute-tools.ts`). A read that refused would make the agent useless
 * to a free user before they had seen it do anything.
 */
export function browserExecutor(name: string): (params: Record<string, string>) => Promise<string> {
  return isBrowserWrite(name)
    ? async () => browserWriteUnavailable(name)
    : (params) => browserReadTool(name, params);
}
