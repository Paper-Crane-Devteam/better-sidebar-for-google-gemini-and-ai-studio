import type { DocOp } from './types';

/**
 * Read the `ops` array out of what the model wrote.
 *
 * It arrives as a JSON string because every tool param does — the call is parsed as
 * `Record<string, string>`. A single object instead of an array is accepted: writing one op
 * without the brackets is the most common shape mistake, it has exactly one meaning, and
 * refusing it costs a round to correct nothing.
 *
 * The error message carries a worked example. "Invalid JSON" on its own tends to produce
 * the same malformed call again with the quoting changed.
 */
export function parseOps(raw: string | undefined): DocOp[] {
  const text = raw?.trim();
  if (!text) {
    throw new Error(
      'doc_edit requires an "ops" array. Example: ops=[{"op":"comment","old_text":"…",' +
        '"text":"…"}]',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      '"ops" is not valid JSON. It must be a JSON array, e.g. ' +
        '[{"op":"replace_text","old_text":"…","new_text":"…"}]. Write it as a real array, ' +
        'not as a quoted string.',
    );
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) {
    throw new Error('"ops" is empty, so there is nothing to change.');
  }

  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Every entry in "ops" must be an object with an "op" field.');
    }
    const operation = entry as Record<string, unknown>;
    if (operation.op === undefined && typeof operation.type === 'string') {
      operation.op = operation.type;
      delete operation.type;
    } else if (operation.type !== undefined && operation.type !== operation.op) {
      throw new Error('An operation has conflicting "op" and "type" fields. Use only "op".');
    }
    if (typeof operation.op !== 'string' || !operation.op.trim()) {
      // Both format's verbs, because this check runs before the path is looked at and naming
      // only one format's would send an Excel call off to fix the wrong thing.
      throw new Error(
        'An entry in "ops" has no "op" field. Each one names the change. For a .docx: ' +
          'replace_text, set_text, comment, insert_paragraph, delete_paragraph, set_style, ' +
          'insert_table, insert_row, delete_row, delete_table. For an .xlsx: set_cell, ' +
          'set_cells, add_column, clear_cells, add_sheet, rename_sheet. For a PDF: highlight, ' +
          'comment, note, fill_form, watermark, page_numbers, rotate_pages, delete_pages, extract_pages, merge.',
      );
    }
  }

  return list as DocOp[];
}

