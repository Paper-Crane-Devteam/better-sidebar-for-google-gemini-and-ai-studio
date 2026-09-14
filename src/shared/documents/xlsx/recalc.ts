/**
 * Making Excel recalculate, and keeping `<dimension>` honest.
 *
 * ## The bug this file exists to prevent
 *
 * A workbook stores every formula's *last calculated value* alongside the formula. Change B2
 * and the file still says C2 is 90, because C2's cached `<v>` was written the last time Excel
 * had the file open. Excel does not notice on its own: it trusts the cache and the calculation
 * chain that comes with it.
 *
 * ⚠️ So an edit that only writes B2 produces a sheet that **contradicts itself** — the input
 * says one thing, the total says another, and the user has no reason to suspect either. It is
 * the worst failure shape available here, worse than refusing the edit, because it is invisible
 * and it is in their data.
 *
 * Two things fix it together, and neither is sufficient alone:
 *
 * 1. Delete `xl/calcChain.xml`, the dependency order Excel replays instead of working it out.
 * 2. Set `fullCalcOnLoad="1"` on `<calcPr>`, which tells it to work it out.
 *
 * Recalculating in JavaScript was the alternative and is not one: `hyperformula` is GPL-3.0
 * and incompatible with a closed-source extension, and implementing Excel's function semantics
 * — array formulas, iterative calculation, volatile functions — is a negative-return project.
 * Excel is right there and it is very good at this.
 */

import { DocumentError } from '../types';
import type { Archive } from '../zip';
import {
  type XmlPart,
  attr,
  element,
  elements,
  escapeXml,
  tokenize,
} from '../ooxml/xml-cursor';
import { describeRange, type GridRange } from './refs';
import { directoryOf, relsNameFor, type Workbook } from './model';

/**
 * Force a full recalculation on next open.
 *
 * ⚠️ Removing `calcChain.xml` means removing all three of its traces: the entry, its
 * `[Content_Types].xml` override, and its relationship. A declared-but-absent part is what
 * makes Excel report the file as needing repair — and it is the exact failure `verify` checks
 * both directions for, because it opens fine in some readers and not others.
 */
export function invalidateCalculation(workbook: Workbook): void {
  const calcChain = `${directoryOf(workbook.bookName)}calcChain.xml`;

  if (workbook.archive.has(calcChain)) {
    workbook.archive.remove(calcChain);
    removeContentTypeOverride(workbook.archive, calcChain);
    removeRelationshipTo(workbook.archive, workbook.bookName, 'calcChain.xml');
  }

  setFullCalcOnLoad(workbook);
}

/**
 * `<calcPr fullCalcOnLoad="1"/>` in `xl/workbook.xml`.
 *
 * ⚠️ Position matters. `CT_Workbook` is a *sequence*, so `<calcPr>` has to come after
 * `<definedNames>` and before `<oleSize>`; a schema-valid element in the wrong slot is
 * rejected by Excel as unreadable content. Inserting after `</definedNames>` when there is one
 * and after `</sheets>` otherwise satisfies that without modelling the whole sequence.
 */
function setFullCalcOnLoad(workbook: Workbook): void {
  const source = workbook.archive.text(workbook.bookName);
  const part = tokenize(source);

  const existing = element(part, 'calcPr');
  if (existing) {
    const tag = source.slice(existing.outerStart, existing.outerEnd);
    if (/\bfullCalcOnLoad\s*=/.test(tag)) return; // already asked for
    const patched = tag.replace(/(\/?>)\s*$/, ' fullCalcOnLoad="1"$1');
    workbook.archive.setText(
      workbook.bookName,
      source.slice(0, existing.outerStart) + patched + source.slice(existing.outerEnd),
    );
    return;
  }

  const anchor = element(part, 'definedNames') ?? element(part, 'sheets');
  if (!anchor) {
    // No `<sheets>` at all should have been caught at open time; refusing here rather than
    // guessing a position keeps a malformed workbook from being written back worse.
    throw new DocumentError(
      'This workbook has no <sheets> element, so it cannot be told to recalculate.',
    );
  }

  const at = anchor.outerEnd;
  workbook.archive.setText(
    workbook.bookName,
    `${source.slice(0, at)}<calcPr calcId="0" fullCalcOnLoad="1"/>${source.slice(at)}`,
  );
}

// ─── Dimension ───────────────────────────────────────────────────────────────

/**
 * Grow `<dimension ref="…">` to cover what was written.
 *
 * The used range is what the outline reports and what an open-ended range like `A:C` is
 * resolved against, so a stale dimension makes a newly added column invisible to the next read
 * — the value is in the file and the tool says it is not there.
 *
 * Only ever grows. Shrinking would mean proving no cell outside the new box has content, which
 * is a whole-sheet scan for a value nothing depends on.
 */
export function extendDimension(
  archive: Archive,
  partName: string,
  written: GridRange,
): void {
  const source = archive.textOrNull(partName);
  if (source === null) return;

  const part = tokenize(source);
  const el = element(part, 'dimension');

  if (!el) {
    // A sheet with no `<dimension>` is legal — Excel recomputes it. Adding one would mean
    // finding the right slot in another sequence for no gain, so this is left alone.
    return;
  }

  const current = attr(part, el, 'ref');
  const merged = current ? union(current, written) : describeRange(written);
  if (merged === current) return;

  archive.setText(
    partName,
    `${source.slice(0, el.outerStart)}<dimension ref="${merged}"/>${source.slice(el.outerEnd)}`,
  );
}

function union(currentRef: string, written: GridRange): string {
  // Parsed loosely: a dimension we cannot read is replaced by the written range rather than
  // treated as an error, since the attribute is a cache and not the data.
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/.exec(
    currentRef.trim(),
  );
  if (!match) return describeRange(written);

  const toColumn = (name: string) => {
    let n = 0;
    for (let i = 0; i < name.length; i++) n = n * 26 + ((name.charCodeAt(i) & ~32) - 64);
    return n;
  };

  const left = toColumn(match[1]);
  const top = Number(match[2]);
  const right = match[3] ? toColumn(match[3]) : left;
  const bottom = match[4] ? Number(match[4]) : top;

  return describeRange({
    top: Math.min(top, written.top),
    left: Math.min(left, written.left),
    bottom: Math.max(bottom, written.bottom),
    right: Math.max(right, written.right),
  });
}

// ─── Content types and relationships ─────────────────────────────────────────

/** Declare a part's content type, unless it already is declared. */
export function ensureContentType(
  archive: Archive,
  partName: string,
  contentType: string,
): void {
  const source = archive.text('[Content_Types].xml');
  const target = `/${partName}`;
  const part = tokenize(source);

  for (const override of elements(part, 'Override')) {
    if (attr(part, override, 'PartName') === target) return;
  }

  const root = elements(part, 'Types')[0];
  if (!root || root.selfClosing) {
    throw new DocumentError('[Content_Types].xml has no usable <Types> root.');
  }

  archive.setText(
    '[Content_Types].xml',
    source.slice(0, root.innerEnd) +
      `<Override PartName="${target}" ContentType="${contentType}"/>` +
      source.slice(root.innerEnd),
  );
}

function removeContentTypeOverride(archive: Archive, partName: string): void {
  const source = archive.text('[Content_Types].xml');
  const part = tokenize(source);
  const target = `/${partName}`;

  for (const override of elements(part, 'Override')) {
    if (attr(part, override, 'PartName') !== target) continue;
    archive.setText(
      '[Content_Types].xml',
      source.slice(0, override.outerStart) + source.slice(override.outerEnd),
    );
    return;
  }
}

/**
 * Add a relationship from the workbook to a part, returning its id.
 *
 * The id is the caller's whole reason for asking: `<sheet r:id="rId7">` is how a worksheet is
 * attached, so the number has to come back out.
 */
export function addRelationship(
  archive: Archive,
  bookName: string,
  target: string,
  relType: string,
): string {
  const relsName = relsNameFor(bookName);
  const source = archive.textOrNull(relsName);
  if (source === null) {
    throw new DocumentError(
      `The workbook has no "${relsName}", so nothing can be attached to it.`,
    );
  }

  const part = tokenize(source);
  const used = new Set<string>();
  for (const rel of elements(part, 'Relationship')) {
    const id = attr(part, rel, 'Id');
    if (id) used.add(id);
  }

  const root = elements(part, 'Relationships')[0];
  if (!root || root.selfClosing) {
    throw new DocumentError(`"${relsName}" has no usable <Relationships> root.`);
  }

  // ⚠️ Scanning for a free id rather than counting: relationship ids are not dense. A file
  // that has had a sheet deleted has gaps, and `rId${count + 1}` lands on one that is in use —
  // two relationships with one id, and Excel resolves whichever it reads last.
  let n = used.size + 1;
  while (used.has(`rId${n}`)) n++;
  const id = `rId${n}`;

  archive.setText(
    relsName,
    source.slice(0, root.innerEnd) +
      `<Relationship Id="${id}" Type="${relType}" Target="${escapeXml(target)}"/>` +
      source.slice(root.innerEnd),
  );

  return id;
}

function removeRelationshipTo(archive: Archive, bookName: string, target: string): void {
  const relsName = relsNameFor(bookName);
  const source = archive.textOrNull(relsName);
  if (source === null) return;

  const part: XmlPart = tokenize(source);
  for (const rel of elements(part, 'Relationship')) {
    const value = attr(part, rel, 'Target') ?? '';
    if (value !== target && value !== `/${directoryOf(bookName)}${target}`) continue;
    archive.setText(
      relsName,
      source.slice(0, rel.outerStart) + source.slice(rel.outerEnd),
    );
    return;
  }
}
