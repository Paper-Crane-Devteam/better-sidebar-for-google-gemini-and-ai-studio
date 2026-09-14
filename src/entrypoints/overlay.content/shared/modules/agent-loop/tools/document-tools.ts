/**
 * `doc_read` and `doc_edit` — the agent's way into Word, Excel, PowerPoint, PDF and
 * subtitle files.
 *
 * Same contract as the workspace tools next door: never throws, a failure is
 * `ERROR: <what to do about it>`, every parameter arrives as a string and is coerced
 * here.
 *
 * ## The result is shaped by the round budget, not by what is in the file
 *
 * All tool output in a round shares 29998 characters (`engine/stages/handoff/budget.ts`),
 * and going over is *silently truncated* — the payload leaves the composer looking
 * complete. A thesis is several times that budget on its own, and a 5000×20 worksheet is
 * thirty times it, so this tool answers with an outline first and only ever returns a slice
 * of the content. That is why `mode` defaults to `outline` rather than to "the document".
 *
 * ⚠️ The projection deliberately carries no inline Markdown. The text the agent reads
 * here is text it will later quote back to locate an edit, and a `**` inserted for
 * emphasis would make that quote fail to match the real characters in the file.
 */

import { parseOps } from '@/shared/documents/ops';
import { editDocument, readDocument } from '@/shared/documents/client';
import type {
  DocEditResult,
  DocOp,
  DocOutlineResult,
  DocProjectionResult,
  DocReadMode,
  DocResult,
} from '@/shared/documents/types';
import { resolveWorkspaceId, bindConversation } from '../workspace/workspace-binding';
import { toolCallRecorder } from '../records';

/** Modes the tool accepts, and what an unrecognised value falls back to. */
const MODES: readonly DocReadMode[] = ['outline', 'range', 'search', 'raw'];

function fail(e: unknown): string {
  return `ERROR: ${(e as Error)?.message ?? String(e)}`;
}

function num(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse a boolean the model wrote as text.
 *
 * `"true"`, `"True"`, `"1"` and `"yes"` all mean true — the same coercion
 * `workspace-tools.ts` needs, and for the same reason: treating only the exact string
 * `"true"` as true makes a parameter look like it is being ignored.
 */
function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  return /^(true|1|yes|on)$/i.test(value.trim());
}

export async function readDocumentTool(
  params: Record<string, string>,
): Promise<string> {
  const path = params.path?.trim();
  if (!path) return 'ERROR: doc_read requires a "path" parameter.';

  const requested = params.mode?.trim().toLowerCase() as DocReadMode | undefined;
  // An unknown mode falls back to `outline` rather than failing: outline is cheap, always
  // valid, and tells the agent enough to ask a better question. Refusing would cost a
  // whole round to correct a typo.
  const mode: DocReadMode =
    requested && MODES.includes(requested) ? requested : 'outline';

  try {
    const workspaceId = await resolveWorkspaceId(
      toolCallRecorder.currentConversationId,
    );

    const result = await readDocument(workspaceId, {
      path,
      mode,
      range: params.range?.trim() || undefined,
      query: params.query?.trim() || undefined,
      formatting: bool(params.formatting, true),
      maxChars: num(params.max_chars),
    });

    // Only after a call actually succeeded: the first successful document operation locks
    // the conversation to this workspace, exactly as the file tools do, so a later call in
    // the same task cannot land somewhere else.
    await lockIn(workspaceId);

    return render(result);
  } catch (e) {
    return fail(e);
  }
}

async function lockIn(workspaceId: string): Promise<void> {
  const sessionId = toolCallRecorder.currentSessionId;
  if (!sessionId) return; // a direct UI call, with nothing to attribute it to
  await bindConversation(
    sessionId,
    toolCallRecorder.currentConversationId,
    workspaceId,
  );
}

// ─── doc_edit ────────────────────────────────────────────────────────────────

/**
 * Apply changes to a document.
 *
 * ⚠️ **`mode` defaults to `track` and the tool does not second-guess that.** A user who
 * hands over their thesis is not going to re-read it to find out what changed, so the
 * default has to be the form Word can show them change by change. `direct` exists, is one
 * word away, and is reported in the result so the answer cannot quietly claim otherwise.
 *
 * The interesting failure here is a partial one: some ops apply, others are refused. That
 * is reported as such rather than collapsed into success or error, because both halves are
 * things the agent has to tell the user about.
 */
export async function editDocumentTool(
  params: Record<string, string>,
): Promise<string> {
  const path = params.path?.trim();
  if (!path) return 'ERROR: doc_edit requires a "path" parameter.';

  let ops: DocOp[];
  try {
    ops = parseOps(params.ops);
  } catch (e) {
    return fail(e);
  }

  // Anything other than the literal `direct` means tracked. Silently defaulting rather
  // than validating: a typo'd mode falling back to the *safer* behaviour is the right way
  // for this particular parameter to fail.
  const mode = params.mode?.trim().toLowerCase() === 'direct' ? 'direct' : 'track';

  try {
    const workspaceId = await resolveWorkspaceId(
      toolCallRecorder.currentConversationId,
    );

    const result = await editDocument(workspaceId, {
      path,
      ops,
      mode,
      // Scopes the once-per-task backup. Without it every write takes its own copy, and
      // `.history/` ends up holding twelve versions of one edit session instead of the
      // state the file was in before the agent started.
      sessionId: toolCallRecorder.currentSessionId ?? undefined,
    });

    await lockIn(workspaceId);
    return render(result);
  } catch (e) {
    return fail(e);
  }
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function render(result: DocResult): string {
  if (result.kind === 'outline') return renderOutline(result);
  if (result.kind === 'projection') return renderProjection(result);
  return renderEdit(result);
}

/**
 * The outline, as the agent's first look at a document.
 *
 * Warnings come *before* the outline, not after. They are the things that change what the
 * agent should do next — a document that already carries someone else's tracked changes,
 * text that is generated by a field code — and a warning read after the content is a
 * warning read too late.
 */
function renderOutline(result: DocOutlineResult): string {
  const lines: string[] = [result.summary];

  if (result.facts.length > 0) {
    lines.push(result.facts.join(' · '));
    }

  for (const warning of result.warnings) {
    lines.push(`⚠️ ${warning}`);
  }

  if (result.sections.length === 0) {
    lines.push('No headings or sections were found.');
  } else {
    lines.push('', 'Outline (use the id as doc_read range):');
    for (const section of result.sections) {
      const indent = '  '.repeat(Math.max(0, section.level - 1));
      const size =
        section.size != null ? `  (${section.size} ${section.unit ?? 'chars'})` : '';
      lines.push(`${section.id}\t${indent}${section.label}${size}`);
    }
  }

  return lines.join('\n');
}

function renderProjection(result: DocProjectionResult): string {
  const header = `${result.path} — ${result.covered}`;
  const body = result.text === '' ? '(no text in this range)' : result.text;

  if (!result.truncated) return `${header}\n${body}`;

  // Say what is missing and how to get it, and rule out the retry the model is most
  // likely to reach for — the same reasoning as `budget.ts`'s `buildNotice()`. Re-running
  // the identical call would truncate in the identical place and burn a round.
  const next = result.nextRange
    ? `Continue with doc_read path="${result.path}" mode="range" range="${result.nextRange}".`
    : 'Narrow the range to see more.';
  return `${header}\n${body}\n\n[Output stops here — this is not the end of the document. ${next}]`;
}

/**
 * The outcome of an edit, written so the agent can repeat it to the user.
 *
 * Three things it is careful about:
 *
 * - **Nothing applied is not an error.** No `ERROR:` prefix, because the file is intact and
 *   the tool worked. What failed is the agent's aim, and the reasons are right there to act
 *   on — prefixing it would send the loop down the "the tool is broken" path instead.
 * - **Skipped ops are listed after the applied ones**, so a partial success reads as what it
 *   is rather than as a failure.
 * - **The backup path is stated.** It is the answer to the next question the user asks, and
 *   the agent cannot offer it if it never sees it.
 */
function renderEdit(result: DocEditResult): string {
  const lines: string[] = [];

  if (result.applied.length === 0) {
    lines.push(`No changes were made to ${result.path}.`);
    for (const reason of result.skipped) lines.push(`- ${reason}`);
    lines.push(
      'The file is unchanged. Re-read the range with doc_read and copy the exact text ' +
        'before trying again.',
    );
    return lines.join('\n');
  }

  lines.push(`${result.path} — ${result.applied.length} change(s) applied:`);
  for (const change of result.applied) lines.push(`- ${change}`);

  if (result.skipped.length > 0) {
    lines.push('', 'Not applied:');
    for (const reason of result.skipped) lines.push(`- ${reason}`);
  }

  if (result.backupPath) {
    lines.push(
      '',
      `The version from before this task is kept at ${result.backupPath}.`,
    );
  }

  return lines.join('\n');
}
