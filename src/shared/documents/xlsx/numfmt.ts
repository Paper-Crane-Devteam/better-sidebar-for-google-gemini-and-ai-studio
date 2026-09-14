/**
 * Number formats, and the one thing they change about reading a workbook: dates.
 *
 * ## A date in an xlsx is a number, and nothing in the cell says otherwise
 *
 * `2026-01-05` is stored as `<v>46027</v>`. Whether that is a date, a count of items or a
 * price is decided entirely by the *style* the cell points at, three parts away:
 *
 *     <c r="C2" s="3">  →  xl/styles.xml  cellXfs[3].numFmtId  →  a format code
 *
 * ⚠️ Getting this wrong is not a rendering nit. An agent asked to average a column of dates
 * would happily average five-digit serial numbers and report a plausible-looking answer,
 * which is the worst available failure: confident, wrong, and impossible to spot in the
 * output. So every numeric cell is checked against its format before it is reported.
 *
 * ## What this module deliberately does not do
 *
 * It does not *apply* formats. Reading restores dates to ISO text; writing never invents a
 * style (see `write.ts` — new values inherit the target cell's own `s`, and a value that is
 * not a plain number is written as text). Building number formats would mean editing
 * `styles.xml`'s `numFmts` and `cellXfs` and renumbering every index that follows, for a
 * feature nobody has asked for.
 */

import { attr, elements, tokenize, type XmlPart } from '../ooxml/xml-cursor';

/**
 * Built-in format ids that mean a date or a time.
 *
 * These have no entry in `styles.xml` at all — the id alone carries the meaning, and a
 * reader that only looks at `numFmts` sees nothing and treats every date as a number.
 *
 * - 14–17 dates, 18–21 times, 22 date+time
 * - 27–36 and 50–58 are the CJK date/time set (a Chinese or Japanese workbook uses these
 *   constantly, and this is where "the dates came out as numbers" usually comes from)
 * - 45–47 elapsed time, 71–81 the Thai set
 */
const BUILTIN_DATE_IDS = new Set<number>([
  14, 15, 16, 17, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
  71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81,
]);

/** Built-in ids that are time-only. Same list, split out so the output can omit the date. */
const BUILTIN_TIME_IDS = new Set<number>([18, 19, 20, 21, 45, 46, 47]);

export interface FormatInfo {
  /** The cell shows a date, a time, or both. */
  isTemporal: boolean;
  hasDate: boolean;
  hasTime: boolean;
  /** The format code, when it is a custom one. For explaining a column to the agent. */
  code: string | null;
}

const PLAIN: FormatInfo = { isTemporal: false, hasDate: false, hasTime: false, code: null };

export interface StyleTable {
  /** `cellXfs` index → `numFmtId`. Cell `s` attributes index into this. */
  numFmtByXf: number[];
  /** Custom `numFmtId` → format code. Built-ins are absent by design. */
  codes: Map<number, string>;
  /** How each `cellXfs` entry behaves, computed once. */
  formats: FormatInfo[];
}

const EMPTY_STYLES: StyleTable = { numFmtByXf: [], codes: new Map(), formats: [] };

/**
 * Read `xl/styles.xml` down to the one question this engine asks of it.
 *
 * A missing or unparseable styles part is not fatal: every cell then reads as plain, which
 * makes dates look like numbers but keeps the rest of the file usable. Refusing to open the
 * workbook over it would be a worse trade.
 */
export function readStyleTable(source: string | null): StyleTable {
  if (!source) return EMPTY_STYLES;

  let part: XmlPart;
  try {
    part = tokenize(source);
  } catch {
    return EMPTY_STYLES;
  }

  const codes = new Map<number, string>();
  for (const fmt of elements(part, 'numFmt')) {
    const id = Number(attr(part, fmt, 'numFmtId'));
    const code = attr(part, fmt, 'formatCode');
    if (Number.isFinite(id) && code !== null) codes.set(id, code);
  }

  // ⚠️ `cellXfs`, not `cellStyleXfs`. Both hold `<xf>` elements with `numFmtId` attributes and
  // they are different tables: a cell's `s` indexes `cellXfs`, while `cellStyleXfs` holds the
  // named-style definitions those entries inherit from. Reading the wrong one gives an index
  // that resolves to a real format belonging to a different cell.
  const numFmtByXf: number[] = [];
  const cellXfs = elements(part, 'cellXfs')[0];
  if (cellXfs) {
    for (const xf of elements(part, 'xf', cellXfs)) {
      const id = Number(attr(part, xf, 'numFmtId') ?? '0');
      numFmtByXf.push(Number.isFinite(id) ? id : 0);
    }
  }

  const formats = numFmtByXf.map((id) => describeFormat(id, codes.get(id) ?? null));
  return { numFmtByXf, codes, formats };
}

/** What a cell with this style index shows. An unknown index reads as plain. */
export function formatOf(styles: StyleTable, styleIndex: number | null): FormatInfo {
  if (styleIndex === null) return PLAIN;
  return styles.formats[styleIndex] ?? PLAIN;
}

function describeFormat(id: number, code: string | null): FormatInfo {
  if (BUILTIN_TIME_IDS.has(id)) {
    return { isTemporal: true, hasDate: false, hasTime: true, code };
  }
  if (BUILTIN_DATE_IDS.has(id)) {
    // 22 is `m/d/yy h:mm`; the rest of the built-in date set is date-only.
    return { isTemporal: true, hasDate: true, hasTime: id === 22, code };
  }
  if (code === null) return PLAIN;
  return classifyCode(code);
}

/**
 * Decide what a custom format code means by its tokens.
 *
 * ⚠️ Literal text has to come out first. A code like `0" m"` (metres) contains an `m`, and a
 * naive scan would call it a time format and then "restore" every measurement in the column
 * to a timestamp. Quoted runs, escaped characters, colour and condition brackets, and the
 * currency locale block `[$-409]` are all stripped before anything is matched.
 *
 * Only the first section is examined. A code may carry up to four (positive; negative; zero;
 * text) and Excel picks one per value — but a format whose positive section is a date and
 * whose negative section is not does not occur in practice.
 */
function classifyCode(code: string): FormatInfo {
  const first = splitFirstSection(code);

  const bare = first
    .replace(/\\./g, '') // escaped single characters: `\-`, `\m`
    .replace(/"[^"]*"/g, '') // literal text
    .replace(/\[[^\]]*\]/g, ''); // [Red], [<=100], [$-409], [h]

  // `@` is the text placeholder; a code that is only text is never a date.
  if (/[yY]/.test(bare) || /[dD]/.test(bare)) {
    return {
      isTemporal: true,
      hasDate: true,
      hasTime: /[hH]/.test(bare) || /[sS]/.test(bare),
      code,
    };
  }

  // No y and no d: a time only if it has an hour or a second. A lone `m` is the *month*
  // token in Excel and the *minute* token only next to h or s, so on its own it is neither —
  // and `0.00m` is far more likely to be a unit than a bare month.
  if (/[hH]/.test(bare) || /[sS]/.test(bare)) {
    return { isTemporal: true, hasDate: false, hasTime: true, code };
  }

  return { isTemporal: false, hasDate: false, hasTime: false, code };
}

/** The first `;`-separated section, ignoring semicolons inside quotes or brackets. */
function splitFirstSection(code: string): string {
  let quoted = false;
  let bracket = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === '[') bracket = true;
    else if (!quoted && c === ']') bracket = false;
    else if (!quoted && !bracket && c === ';') return code.slice(0, i);
  }
  return code;
}

// ─── Serial numbers ──────────────────────────────────────────────────────────

const DAY_MS = 86400000;

/**
 * Turn an Excel serial number into ISO text.
 *
 * Two epochs and one famous bug:
 *
 * - **1900 system** (the default). Serial 1 is 1900-01-01. Excel also believes 1900 was a
 *   leap year, so serial 60 is "1900-02-29" — a day that never existed. Below 60 the epoch
 *   is 1899-12-31 and above it 1899-12-30, which is how every correct implementation
 *   reproduces the off-by-one Lotus 1-2-3 shipped in 1983 and Excel kept for compatibility.
 * - **1904 system** (`workbookPr date1904="1"`, written by old Mac Excel). Serial 0 is
 *   1904-01-01. ⚠️ Reading a 1904 workbook with the 1900 epoch shifts every date by four
 *   years and a day, silently.
 *
 * Returns null when the number cannot be a date, so the caller reports the raw number rather
 * than a fabricated one.
 */
export function serialToIso(
  serial: number,
  date1904: boolean,
  format: FormatInfo,
): string | null {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2958466) return null;

  const days = Math.floor(serial);
  const fraction = serial - days;

  let epoch: number;
  if (date1904) {
    epoch = Date.UTC(1904, 0, 1);
  } else {
    if (days === 60) return null; // Excel's fictional 1900-02-29
    epoch = days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  }

  // Rounded, not truncated: a time stored as 0.5416666666666666 is 13:00:00, and flooring
  // the multiplication turns it into 12:59:59.
  const at = new Date(epoch + days * DAY_MS + Math.round(fraction * DAY_MS));
  if (Number.isNaN(at.getTime())) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
  const time = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;

  // A time-only format with a serial below 1 is a duration or a clock time; printing
  // 1899-12-31 in front of it would be noise the agent then has to reason about.
  if (format.hasTime && !format.hasDate) return time;
  if (!format.hasTime && fraction === 0) return date;
  return `${date}T${time}`;
}
