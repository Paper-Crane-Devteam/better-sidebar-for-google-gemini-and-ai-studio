/**
 * Workspace file tools — the agent's read/write/search vocabulary.
 *
 * Each function returns the text the AI reads next, and never throws: a failure is
 * `ERROR: <what to do about it>`, because the loop's job after a failed step is to try
 * something else, not to unwind. This mirrors `execute-sql.ts`.
 *
 * The parser hands every param over as a string — `limit` arrives as `"50"`, not `50` —
 * so coercion happens here rather than in the client or the background.
 *
 * ## The workspace is resolved per call, and locks on first use
 *
 * Every tool goes through `openWorkspace()`, which asks for this conversation's binding
 * and falls back to the switcher's selection. The first call that actually succeeds
 * writes that binding, so the rest of the conversation — including sessions started
 * later — stays in the same workspace. The agent is never told which one it is in, which
 * is what makes the lock necessary rather than merely tidy.
 */

import { forWorkspace, type WorkspaceClient } from '@/shared/workspace/client';
import { fileBudget } from '@/shared/workspace/limits';
import { resolveWorkspaceId, bindConversation } from '../workspace/workspace-binding';
import { toolCallRecorder } from '../records';
import { paywallResult } from './paywall-signal';

/** Parse a param the model wrote as text. Returns undefined for absent/garbage. */
function num(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse a boolean param.
 *
 * The model writes `"true"`, `"True"`, `"1"` and `"yes"` interchangeably. Treating only
 * `"true"` as true made `replace_all` silently ineffective — the edit then failed on the
 * ambiguous-match check, which reads as the tool ignoring its own parameter.
 */
function bool(value: string | undefined): boolean {
  if (value == null) return false;
  return /^(true|1|yes|on)$/i.test(value.trim());
}

function fail(e: unknown): string {
  return `ERROR: ${(e as Error)?.message ?? String(e)}`;
}

/** The client for whichever workspace this conversation belongs in. */
async function openWorkspace(): Promise<WorkspaceClient> {
  const id = await resolveWorkspaceId(toolCallRecorder.currentConversationId);
  return forWorkspace(id);
}

/**
 * Lock the conversation to the workspace a call just used.
 *
 * Called only after a successful operation. Awaited rather than fired off: the next tool
 * call in the same round resolves its workspace from this binding, and a race there
 * would let two calls in one response disagree about where they are.
 */
async function lockIn(ws: WorkspaceClient): Promise<void> {
  const sessionId = toolCallRecorder.currentSessionId;
  if (!sessionId) return; // nothing to attribute it to (e.g. a direct UI call)
  await bindConversation(
    sessionId,
    toolCallRecorder.currentConversationId,
    ws.workspaceId,
  );
}

// ─── read_file ───────────────────────────────────────────────────────────────

export async function readFileTool(params: Record<string, string>): Promise<string> {
  const path = params.path?.trim();
  if (!path) return 'ERROR: read_file requires a "path" parameter.';

  try {
    const ws = await openWorkspace();
    const result = await ws.read(path, num(params.offset), num(params.limit));
    await lockIn(ws);

    if (result.content === '' && result.totalLines <= 1) {
      return `${result.path} is empty.`;
    }

    // Line numbers are prefixed, not just reported in a header. The agent needs them to
    // pass an `offset` back, and to quote a location to the user; asking it to count
    // lines in a blob is how off-by-one edits happen.
    const lines = result.content.split('\n');
    const width = String(result.startLine + lines.length - 1).length;
    const numbered = lines
      .map((line, i) => `${String(result.startLine + i).padStart(width)}\t${line}`)
      .join('\n');

    const shown = `${result.startLine}-${result.startLine + lines.length - 1}`;
    const header = result.truncated
      ? `${result.path} (lines ${shown} of ${result.totalLines})`
      : `${result.path} (${result.totalLines} lines)`;

    return `${header}\n${numbered}`;
  } catch (e) {
    return fail(e);
  }
}

// ─── write_file ──────────────────────────────────────────────────────────────

export async function writeFileTool(params: Record<string, string>): Promise<string> {
  const path = params.path?.trim();
  if (!path) return 'ERROR: write_file requires a "path" parameter.';
  // An absent `content` means "create an empty file", which is legitimate; only a
  // missing key is worth reporting, and `?? ''` covers both without a branch.
  const content = params.content ?? '';

  try {
    const ws = await openWorkspace();
    const existed = (await ws.stat(path)) !== null;

    /**
     * The free tier's file cap, checked only for a *new* file.
     *
     * Overwriting is always allowed: it does not change the count, and a cap that stopped
     * the agent from correcting a file it had already written would break iteration
     * halfway through a task rather than at its start. `write_file` is also the only tool
     * that can add a file — `edit_file` needs one to exist, `move` conserves the count,
     * and `mkdir` makes a directory, which is not counted.
     */
    if (!existed) {
      const budget = await fileBudget(ws.workspaceId);
      if (budget.remaining <= 0) {
        return paywallResult(
          `The workspace is at its free limit of ${budget.max} files, so ${path} was not ` +
            'created. The user has been shown an upgrade prompt. Do not try another path — ' +
            'the limit is on the workspace, not this file. Report what you still had to ' +
            'write, or continue by editing a file that already exists.',
        );
      }
    }

    const { bytes } = await ws.write(path, content);
    await lockIn(ws);
    const lines = content === '' ? 0 : content.split('\n').length;
    return `${existed ? 'Overwrote' : 'Created'} ${path} (${lines} lines, ${bytes} bytes).`;
  } catch (e) {
    return fail(e);
  }
}

// ─── edit_file ───────────────────────────────────────────────────────────────

export async function editFileTool(params: Record<string, string>): Promise<string> {
  const path = params.path?.trim();
  if (!path) return 'ERROR: edit_file requires a "path" parameter.';
  if (params.old_string == null) {
    return 'ERROR: edit_file requires an "old_string" parameter.';
  }

  try {
    const ws = await openWorkspace();
    const { replacements } = await ws.edit(
      path,
      params.old_string,
      params.new_string ?? '',
      bool(params.replace_all),
    );
    await lockIn(ws);
    return `Edited ${path} (${replacements} replacement${replacements === 1 ? '' : 's'}).`;
  } catch (e) {
    return fail(e);
  }
}

// ─── list_files ──────────────────────────────────────────────────────────────

export async function listFilesTool(params: Record<string, string>): Promise<string> {
  const path = params.path?.trim() ?? '';

  try {
    const ws = await openWorkspace();
    const { entries, truncated } = await ws.list(path, bool(params.recursive));
    await lockIn(ws);

    if (entries.length === 0) {
      return path ? `${path} is empty.` : 'The workspace is empty.';
    }

    const body = entries
      .map((e) => (e.kind === 'directory' ? `${e.path}/` : `${e.path}\t${e.size ?? 0}b`))
      .join('\n');

    const label = path || 'workspace root';
    const note = truncated ? ' (truncated)' : '';
    return `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} in ${label}${note}\n${body}`;
  } catch (e) {
    return fail(e);
  }
}

// ─── glob_files ──────────────────────────────────────────────────────────────

export async function globFilesTool(params: Record<string, string>): Promise<string> {
  const pattern = params.pattern?.trim();
  if (!pattern) return 'ERROR: glob_files requires a "pattern" parameter.';

  try {
    const ws = await openWorkspace();
    const { paths, truncated } = await ws.glob(pattern, params.path?.trim());
    await lockIn(ws);
    if (paths.length === 0) return `No files match "${pattern}".`;
    const note = truncated ? ' (truncated)' : '';
    return `${paths.length} file(s) matching "${pattern}"${note}\n${paths.join('\n')}`;
  } catch (e) {
    return fail(e);
  }
}

// ─── grep_files ──────────────────────────────────────────────────────────────

export async function grepFilesTool(params: Record<string, string>): Promise<string> {
  const pattern = params.pattern?.trim();
  if (!pattern) return 'ERROR: grep_files requires a "pattern" parameter.';

  try {
    const ws = await openWorkspace();
    const { matches, truncated, filesSearched } = await ws.grep(pattern, {
      path: params.path?.trim(),
      include: params.include?.trim(),
      caseSensitive: bool(params.case_sensitive),
    });
    await lockIn(ws);

    if (matches.length === 0) {
      return `No matches for /${pattern}/ (searched ${filesSearched} file(s)).`;
    }

    // Grouped by file, because the agent's next move is almost always to read one of
    // them — a flat list makes it re-scan the output to work out which files exist.
    const byFile = new Map<string, typeof matches>();
    for (const m of matches) {
      const list = byFile.get(m.path) ?? [];
      list.push(m);
      byFile.set(m.path, list);
    }

    const body = [...byFile.entries()]
      .map(
        ([path, list]) =>
          `${path}\n${list.map((m) => `  ${m.line}\t${m.text}`).join('\n')}`,
      )
      .join('\n\n');

    const note = truncated ? ` (truncated at ${matches.length})` : '';
    return `${matches.length} match(es) in ${byFile.size} file(s)${note}\n\n${body}`;
  } catch (e) {
    return fail(e);
  }
}

// ─── manage_files ────────────────────────────────────────────────────────────

/**
 * Delete, move and mkdir behind one tool.
 *
 * Three separate tools would each need their own schema paragraph in every prompt, for
 * operations the agent uses far less than read/write/search. One `action` param keeps
 * the prompt short; the approval gate still sees the distinct fingerprints.
 */
export async function manageFilesTool(params: Record<string, string>): Promise<string> {
  const action = params.action?.trim().toLowerCase();

  try {
    const ws = await openWorkspace();

    switch (action) {
      case 'delete': {
        const path = params.path?.trim();
        if (!path) return 'ERROR: delete requires a "path" parameter.';
        await ws.delete(path, bool(params.recursive));
        await lockIn(ws);
        return `Deleted ${path}.`;
      }
      case 'mkdir': {
        const path = params.path?.trim();
        if (!path) return 'ERROR: mkdir requires a "path" parameter.';
        await ws.mkdir(path);
        await lockIn(ws);
        return `Created directory ${path}.`;
      }
      case 'move':
      case 'rename': {
        const from = params.from?.trim();
        const to = params.to?.trim();
        if (!from || !to) {
          return 'ERROR: move requires both "from" and "to" parameters.';
        }
        await ws.move(from, to);
        await lockIn(ws);
        return `Moved ${from} to ${to}.`;
      }
      default:
        return `ERROR: manage_files "action" must be delete, mkdir or move (got "${params.action ?? ''}").`;
    }
  } catch (e) {
    return fail(e);
  }
}
