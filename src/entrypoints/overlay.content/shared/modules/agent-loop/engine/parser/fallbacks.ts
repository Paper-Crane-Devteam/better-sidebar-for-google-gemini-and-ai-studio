/**
 * Tolerance layer for the tool-call parser.
 *
 * Gemini's renderer is not a faithful pipe: it strips inner XML tags, sometimes
 * mangles JSON, and happily quotes our tool blocks inside code fences when it is
 * only *explaining* a tool call. Everything here exists to cope with that, and it
 * is expected to keep growing — which is why it lives apart from the parser's
 * main flow.
 */

import type { ParsedToolCall } from '../../types';
import { SUPPORTED_TOOLS } from './tool-schema';

/**
 * Primary format: a JSON object.
 * Returns null when the block isn't valid JSON with a `name`.
 */
export function tryParseJson(block: string): ParsedToolCall | null {
  const trimmed = block.trim();
  if (!trimmed.startsWith('{')) return null;

  const direct = buildCall(trimmed);
  if (direct) return direct;

  // Second pass on a repaired copy. Only reached when the block is already broken,
  // which is what keeps the repairs from touching correctly-escaped JSON.
  const repaired = repairJson(trimmed);
  return repaired === trimmed ? null : buildCall(repaired);
}

/** Only protocol identifiers may lose Markdown escapes, never paths or operation text. */
function repairEscapedIdentifiers(json: string): string {
  const paramsStart = json.indexOf('"params"');
  const prefix = paramsStart < 0 ? json : json.slice(0, paramsStart);
  const repaired = prefix.replace(/("name"\s*:\s*)"((?:[a-z]+\\_)+[a-z]+)"/, (whole, key: string, value: string) => {
    const plain = value.replaceAll('\\_', '_');
    return (SUPPORTED_TOOLS as readonly string[]).includes(plain) ? key + JSON.stringify(plain) : whole;
  });
  return (repaired + (paramsStart < 0 ? '' : json.slice(paramsStart)))
    .replace(/"change\\_summary"(\s*:)/g, '"change_summary"$1');
}

/** Repair protocol identifiers and arrays before inspecting the final prose field. */
function repairJson(json: string): string {
  return escapeRawControlChars(repairFinalProse(unquoteJsonArrays(repairEscapedIdentifiers(json))));
}

function buildCall(json: string): ParsedToolCall | null {
  try {
    const obj = JSON.parse(json);
    if (typeof obj.name !== 'string') return null;

    // No `params` object: the model put the params at the top level, next to `name`
    // (seen as `{"name":"complete_task","summary":"…","status":"success"}`). Nothing else
    // could be meant by those keys, so read them as the params instead of bouncing the call.
    const hasParams = typeof obj.params === 'object' && obj.params !== null;
    const rawParams: Record<string, unknown> = hasParams
      ? obj.params
      : Object.fromEntries(Object.entries(obj).filter(([k]) => k !== 'name' && k !== 'description' && k !== 'params'));

    return {
      name: obj.name.trim(),
      description: typeof obj.description === 'string' ? obj.description.trim() : undefined,
      params: Object.fromEntries(Object.entries(rawParams).map(([k, v]) => [k, asParamValue(v)])),
    };
  } catch {
    return null;
  }
}

/**
 * Params are strings by the time a tool sees them, so anything richer is serialised.
 *
 * `JSON.stringify` rather than `String`: a real array has to survive as
 * `["a","b"]`, not `a,b` — the tools that take lists parse their value as JSON.
 */
function asParamValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * Unwrap a JSON array that was wrapped in quotes without escaping its contents.
 *
 * The failure this exists for, seen with a 50-id list:
 *
 *     "params": {"conversation_ids": "["id1","id2"]"}
 *
 * A param declared as "a JSON array, as a string" asks the model to nest one quoting
 * level inside another, and that is a coin flip it loses regularly — the inner quotes
 * come through unescaped and `JSON.parse` rejects the whole block, so a 50-conversation
 * call executes nothing. The schemas now ask for a real array instead, and this catches
 * the ones still written the old way: strip the quotes around the brackets and the
 * array parses as itself.
 */
function unquoteJsonArrays(json: string): string {
  // Only unwrap a property value whose entire contents form a valid array.
  // Counting brackets outside strings handles nested arrays and "]" in comments.
  const opening = /"(?:ops|ids|conversation_ids)"\s*:\s*"(?=\[)/g;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(json))) {
    const quote = opening.lastIndex - 1;
    let depth = 0, inString = false;
    for (let i = quote + 1; i < json.length; i++) {
      const ch = json[i];
      if (inString && ch === '\\') { i++; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '[') depth++;
      if (ch !== ']') continue;
      if (--depth !== 0) continue;
      const suffix = /^\s*"(?=\s*[,}])/.exec(json.slice(i + 1));
      if (!suffix) break;
      const array = json.slice(quote + 1, i + 1);
      try { if (!Array.isArray(JSON.parse(array))) break; } catch { break; }
      json = json.slice(0, quote) + array + json.slice(i + 1 + suffix[0].length);
      opening.lastIndex = quote + array.length;
      break;
    }
  }
  return json;
}

/** Repair quotes only in the final, display-only summary; never guess executable values. */
function repairFinalProse(json: string): string {
  const match = /("(?:change_summary|summary)"\s*:\s*)"([\s\S]*)"(\s*}\s*}\s*)$/.exec(json);
  if (!match) return json;
  // summary is display prose only on complete_task; never repair another tool's payload.
  if (match[1].startsWith('"summary"') && !/^\s*\{\s*"name"\s*:\s*"complete_task"\s*[,}]/.test(json)) return json;
  const value = match[2];
  // Do not swallow another JSON property or container into prose.
  if (/"\s*[:,}\]]/.test(value)) return json;
  let escaped = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\') { escaped += value[i] + (value[++i] ?? ''); }
    else escaped += value[i] === '"' ? '\\"' : value[i];
  }
  return json.slice(0, match.index) + match[1] + '"' + escaped + '"' + match[3];
}

/**
 * Escape raw newlines and tabs that ended up *inside* a JSON string.
 *
 * The failure this exists for arrived with `change_summary`, the one param whose value is
 * prose the model composes freely — so it is the one that reaches for bullet lists and
 * blank lines. To put those in a JSON string it has to write `\\n` escapes, and over a
 * multi-line value it regularly writes a real line break instead:
 *
 *     "params": {"query": "DELETE ...", "change_summary": "Deletes 3 folders:
 *     - Work
 *     - Study"}
 *
 * A raw control character inside a string is invalid JSON, so `JSON.parse` rejects the
 * **whole block** — meaning a write call is discarded for a formatting slip in the part
 * that was only ever meant for the user to read.
 *
 * Safe by construction: a literal newline inside a JSON string is *always* invalid, so
 * escaping one can only turn unparseable into parseable. Newlines between tokens are
 * legal and are left alone, which is why this tracks string state rather than replacing
 * globally.
 */
function escapeRawControlChars(json: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (inString && ch === '\\') {
      // Copy the escape and whatever it escapes, so `\"` can't be read as the end
      // of the string and `\n` isn't double-escaped into `\\n`.
      out += ch + (json[i + 1] ?? '');
      i++;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString) {
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
    }

    out += ch;
  }

  return out;
}

/**
 * A hint for the AI about *why* its JSON was rejected.
 *
 * The generic "re-send as valid JSON" told it nothing it didn't already believe, so
 * the observed behaviour was to re-send the identical text and burn the session's one
 * format retry. Naming the specific mistake is what makes the retry worth having.
 */
export function describeJsonFault(block: string): string | null {
  if (/"\s*\[/.test(block)) {
    return (
      'a list param was wrapped in quotes (`"ids": "[...]"`), which leaves the inner quotes ' +
      'unescaped and breaks the whole block — pass a real JSON array instead: `"ids": ["a","b"]`'
    );
  }
  // Detected by the repair itself rather than a second pattern, so the two cannot
  // disagree about what counts as this fault.
  if (escapeRawControlChars(block) !== block) {
    return (
      'a param value contained a real line break. Inside a JSON string those must be written ' +
      'as `\\n` — a literal newline is invalid JSON and discards the entire tool call. This ' +
      'usually happens in `change_summary`: write it however you like, but escape the line breaks'
    );
  }
  return null;
}

/**
 * Last resort: recover a call from unstructured text, e.g. when the JSON braces
 * were eaten and only `execute_sql 查询描述 SELECT ...` survived.
 */
export function tryParseUnstructured(block: string): ParsedToolCall | null {
  const content = block.trim();
  if (!content) return null;

  for (const tool of SUPPORTED_TOOLS) {
    if (!content.startsWith(tool)) continue;
    const rest = content.slice(tool.length).trim();

    if (tool === 'execute_sql') {
      const sqlMatch = rest.match(/(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*/i);
      if (sqlMatch) {
        const query = sqlMatch[0].trim();
        const description = rest.slice(0, sqlMatch.index).trim();
        return { name: tool, description: description || undefined, params: { query } };
      }
    }

    if (tool === 'complete_task') {
      return { name: tool, description: undefined, params: { summary: rest } };
    }

    return { name: tool, description: undefined, params: {} };
  }

  return null;
}
