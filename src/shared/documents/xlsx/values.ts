/**
 * What a cell means, once the type attribute, the shared string table and the number format
 * have all had their say.
 *
 * A `<c>` on its own tells you almost nothing. `<c r="C2" s="3"><v>46027</v></c>` is a date,
 * a quantity or an id depending on a style three parts away; `<c r="B2" t="s"><v>7</v></c>`
 * is the seventh entry of a table in a fourth part. Every consumer needs the resolved answer
 * and none of them should have to know that, so it happens here, once.
 *
 * ⚠️ **A formula cell has two values and they are both true.** `<f>B2*C2</f><v>90</v>` is the
 * formula the user wrote and the number Excel last calculated. Reporting only the cached
 * number hides the structure of the sheet — an agent that cannot see that a column is
 * computed will happily overwrite it with literals. Reporting only the formula hides the
 * data. So `CellValue` carries both, and the projection shows the value in the grid and the
 * formulas in their own block.
 */

import { unescapeXml } from '../ooxml/xml-cursor';
import { formatOf, serialToIso } from './numfmt';
import type { Workbook } from './model';
import type { SheetCell } from './sheet';

export type CellKind = 'empty' | 'number' | 'date' | 'text' | 'bool' | 'error';

export interface CellValue {
  kind: CellKind;
  /** What to print: the number, the ISO date, the string, `TRUE`, `#DIV/0!`. */
  text: string;
  /** Set for `number` and for a `date` that is still usable as a number. */
  number?: number;
  /**
   * Whether the cell is calculated.
   *
   * ⚠️ Separate from `formula`, and it has to be. A cell that follows a shared formula carries
   * `<f t="shared" si="0"/>` — an element with **no text in it** — so its formula string is
   * empty while the cell is very much computed. Deciding "is this column calculated" from the
   * formula string alone made a column of shared formulas report as a column of plain numbers,
   * which is an invitation to overwrite it.
   */
  computed?: boolean;
  /** The formula without its `=`. Absent on a shared follower, which stores none. */
  formula?: string;
  /** This cell holds the formula the rest of its shared range depends on. */
  sharedHost?: boolean;
  /** This cell borrows its formula from a host elsewhere in the range. */
  sharedFollower?: boolean;
}

const EMPTY: CellValue = { kind: 'empty', text: '' };

export function cellValue(workbook: Workbook, cell: SheetCell): CellValue {
  const base = resolve(workbook, cell);
  if (cell.formula === null) return base;

  const formula = unescapeXml(cell.formula);
  return {
    ...base,
    computed: true,
    ...(formula === '' ? {} : { formula }),
    ...(cell.shared?.isHost ? { sharedHost: true } : {}),
    ...(cell.shared && !cell.shared.isHost ? { sharedFollower: true } : {}),
  };
}

function resolve(workbook: Workbook, cell: SheetCell): CellValue {
  switch (cell.type) {
    case 's': {
      // A shared-string cell whose `<v>` is missing or not a number is corrupt rather than
      // empty, but an empty string is the harmless reading and keeps the sheet usable.
      const index = Number(cell.value);
      if (!Number.isFinite(index)) return EMPTY;
      const text = workbook.sharedString(index);
      return text === '' ? EMPTY : { kind: 'text', text };
    }

    case 'inlineStr': {
      const text = unescapeXml(cell.inline ?? '');
      return text === '' ? EMPTY : { kind: 'text', text };
    }

    // `str` is a formula whose result is text. The `<v>` holds the result directly.
    case 'str': {
      const text = unescapeXml(cell.value ?? '');
      return text === '' ? EMPTY : { kind: 'text', text };
    }

    case 'b':
      return { kind: 'bool', text: cell.value === '1' ? 'TRUE' : 'FALSE' };

    case 'e':
      return { kind: 'error', text: unescapeXml(cell.value ?? '#N/A') };

    default:
      return numeric(workbook, cell);
  }
}

/**
 * A cell with no type attribute, or `t="n"` — a number, unless its format says otherwise.
 *
 * ⚠️ The empty check comes first and matters: a styled but valueless cell (`<c r="C2" s="3"/>`)
 * is how Excel records "this cell is formatted and blank", and there are thousands of them in
 * any real workbook. Treating one as the number 0 would put zeros through the middle of a
 * statistics run.
 */
function numeric(workbook: Workbook, cell: SheetCell): CellValue {
  if (cell.value === null || cell.value === '') {
    // A formula cell with no cached value is not empty — it is uncalculated. Saying so is
    // better than saying nothing, because the answer to "why is this column blank" is
    // "open it in Excel once". It is also what our own writes leave behind on purpose.
    return cell.formula !== null ? { kind: 'text', text: '(not yet calculated)' } : EMPTY;
  }

  const number = Number(cell.value);
  if (!Number.isFinite(number)) {
    return { kind: 'text', text: unescapeXml(cell.value) };
  }

  const format = formatOf(workbook.styles, cell.styleIndex);
  if (format.isTemporal) {
    const iso = serialToIso(number, workbook.date1904, format);
    // A serial that cannot be a date falls back to the raw number rather than to a guess.
    if (iso) return { kind: 'date', text: iso, number };
  }

  return { kind: 'number', text: trimNumber(number), number };
}

/**
 * Print a number the way the sheet reads, not the way JavaScript stringifies it.
 *
 * ⚠️ `0.1 + 0.2` territory: Excel stores `2.4000000000000004` for a value the user entered as
 * `2.4`, because that is what the arithmetic produced. Printing all seventeen digits makes a
 * column of prices unreadable and invites the agent to quote a spurious precision back to the
 * user. Excel itself displays 15 significant digits, so matching that is both faithful and
 * tidy — and it never changes a value that was exact to begin with.
 */
function trimNumber(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  const short = value.toPrecision(15);
  // `toPrecision` pads with zeros and may go exponential; `Number` normalises both, and the
  // round trip is safe because we only ever narrow.
  return String(Number(short));
}

/** A cell's value as one line of a search result or a TSV row. Tabs and newlines flattened. */
export function flatText(value: CellValue): string {
  return value.text.replace(/[\t\r\n]+/g, ' ');
}

// ─── Column types ────────────────────────────────────────────────────────────

export type ColumnType = 'number' | 'date' | 'text' | 'bool' | 'formula' | 'mixed' | 'empty';

/**
 * Guess what a column holds from a sample of it.
 *
 * This is the single cheapest thing that changes what an agent does next. "Column D is
 * numbers, column C is dates" is a few dozen characters and it is everything needed to plan a
 * statistic; without it the only way to find out is to read rows, which costs a hundred times
 * as much and is what the round budget cannot afford.
 *
 * `formula` wins over the value type when most of the sampled cells are computed, because a
 * computed column is a *structural* fact — it tells the agent not to overwrite it, which no
 * value type does.
 */
export function inferColumnType(values: CellValue[]): ColumnType {
  let numbers = 0;
  let dates = 0;
  let texts = 0;
  let bools = 0;
  let formulas = 0;
  let filled = 0;

  for (const value of values) {
    if (value.kind === 'empty' && !value.computed) continue;
    filled++;
    if (value.computed) formulas++;
    switch (value.kind) {
      case 'number':
        numbers++;
        break;
      case 'date':
        dates++;
        break;
      case 'bool':
        bools++;
        break;
      case 'text':
        texts++;
        break;
      default:
        break;
    }
  }

  if (filled === 0) return 'empty';
  if (formulas >= filled * 0.6) return 'formula';

  const [top, count] = ([
    ['number', numbers],
    ['date', dates],
    ['text', texts],
    ['bool', bools],
  ] as Array<[ColumnType, number]>).reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  );

  // A column that is 80% one type is that type; anything less is genuinely mixed, and saying
  // "mixed" is more useful than picking the winner of a three-way split — it is the signal
  // that a header row got left in the data, or that a numeric column has "N/A" in it.
  return count >= filled * 0.8 ? top : 'mixed';
}
