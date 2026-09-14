/**
 * The wire shape of every document operation.
 *
 * Deliberately small and format-agnostic: `docx`, `xlsx`, `pptx`, `pdf` and subtitles
 * all answer the same three questions — what is in here, show me part of it, apply
 * these changes. A per-format request type would have to be mirrored in the message
 * union, the bridge, the worker and the tool layer, four times over.
 *
 * ⚠️ Everything here crosses `runtime.sendMessage`, which serialises with JSON rather
 * than structured clone. No `Uint8Array`, no `Map`, no `Date` in any of these types.
 * Bytes never appear at all — that is the point of the architecture (see
 * `.kiro/docs/document-formats.md` §4): the engine opens OPFS itself, and only the
 * projection text travels.
 */

/** Formats the engine claims to understand. Not every one supports every op. */
export type DocFormat = 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'subtitle';

/**
 * What `doc_read` was asked for.
 *
 * `outline` is the default, and that default is load-bearing: one round of tool
 * results has a hard budget of ~30k characters, and a thesis is several times that.
 * A reader whose first answer is the whole document is a reader that silently
 * truncates on its first use.
 */
export type DocReadMode = 'outline' | 'range' | 'search' | 'raw';

export interface DocReadRequest {
  kind: 'read';
  path: string;
  mode: DocReadMode;
  /**
   * Which part to return, interpreted per format: `p12-p48` for a document,
   * `Sheet1!A1:F200` for a workbook, `3-7` for pages or slides, `12-40` for cues.
   * Ignored by `outline`.
   */
  range?: string;
  /** Search text or regular expression, for `mode: 'search'`. */
  query?: string;
  /**
   * Keep Markdown emphasis, headings and table pipes in the projection.
   *
   * On by default. Off is for when the agent is only reading to decide *where* to
   * look, where the markup is pure token cost.
   */
  formatting?: boolean;
  /** Cap on returned characters. The engine truncates and says so. */
  maxChars?: number;
}

export interface DocEditRequest {
  kind: 'edit';
  path: string;
  ops: DocOp[];
  /**
   * `track` records changes as Word revisions (`w:ins`/`w:del`) so the user accepts
   * or rejects them one by one; `direct` rewrites the text outright.
   *
   * docx defaults to `track`, because nobody proofreads a thesis their AI rewrote.
   * Formats with no revision concept ignore this.
   */
  mode?: 'track' | 'direct';
  /** Author shown on revisions and comments. */
  author?: string;
  /**
   * Agent session this edit belongs to.
   *
   * Only used to decide whether a backup has already been taken for this file in this
   * task — see `storage.ts`. Absent means "back it up", which is the safe default.
   */
  sessionId?: string;
}

export interface DocOp {
  /** Format-specific verb: `replace_text`, `comment`, `set_cells`, `shift_time`… */
  op: string;
  [param: string]: unknown;
}

export type DocRequest = DocReadRequest | DocEditRequest;

// ─── Results ─────────────────────────────────────────────────────────────────

/** One entry in a document's table of contents. */
export interface OutlineNode {
  /** Stable-for-this-read address, e.g. `p12`, `Sheet1`, `slide3`, `page7`. */
  id: string;
  /** Heading text, sheet name, slide title. */
  label: string;
  /** 1 for top level. Flat formats (sheets, slides) use 1 throughout. */
  level: number;
  /** Words, rows, cues — whatever "how big is this" means for the format. */
  size?: number;
  /**
   * What `size` counts, when it is not characters.
   *
   * ⚠️ Needed the moment a second format existed. A document section is measured in
   * characters and a worksheet in rows, and one outline renderer printing "2000 chars" for a
   * 2000-row sheet is a number the agent will then use to decide how much it can read —
   * wrongly, by a factor of the row width.
   */
  unit?: string;
}

export interface DocOutlineResult {
  kind: 'outline';
  path: string;
  format: DocFormat;
  /** One line the agent can repeat to the user: what this file is, how big. */
  summary: string;
  /** `已用区域 A1:F2000`, `含 12 处已有修订` — facts that change what to do next. */
  facts: string[];
  sections: OutlineNode[];
  /**
   * Things the agent must know before editing: a scanned PDF, a workbook with
   * charts, a document that already has tracked changes from someone else.
   *
   * Surfaced above the content in the tool result, because they are the difference
   * between a useful edit and a destructive one.
   */
  warnings: string[];
}

export interface DocProjectionResult {
  kind: 'projection';
  path: string;
  format: DocFormat;
  /** The addressable text the agent reads and quotes back in `old_text`. */
  text: string;
  /** What was actually returned, e.g. `p12-p31 of 240`. */
  covered: string;
  truncated: boolean;
  /** What to pass as `range` next to continue. Absent when nothing is left. */
  nextRange?: string;
}

export interface DocEditResult {
  kind: 'edit';
  path: string;
  /** One line per applied op, for the user-facing summary. */
  applied: string[];
  /** Where the pre-edit copy went, so the answer can offer a way back. */
  backupPath?: string;
  /** Ops that were refused, with the reason. Non-empty does not mean total failure. */
  skipped: string[];
}

export type DocResult = DocOutlineResult | DocProjectionResult | DocEditResult;

/**
 * A failure the agent should read and act on, not a crash.
 *
 * Same contract as the workspace tools: the engine rejects with a message written
 * for the model ("this file has no text layer, it is a scan"), and the tool layer
 * puts it straight after `ERROR: `.
 */
export class DocumentError extends Error {}
