/**
 * The xlsx handler.
 *
 * Reads (workbook outline with column types, cell ranges, cross-sheet search) and writes
 * (cells, formulas, new columns, new sheets). Pure bytes → bytes; the engine loads, `storage.ts`
 * backs up and writes atomically.
 *
 * `verify` is written to be paranoid for the same reason the docx one is: what comes out of here
 * is the user's data, and a broken xlsx does not open at all. It runs twice per save — once in
 * memory before the original is touched, once on what was actually read back.
 */

import { registerHandler, type FormatHandler } from '../registry';
import { DocumentError } from '../types';
import { openArchive } from '../zip';
import { attr, element, elements, tokenize } from '../ooxml/xml-cursor';
import { openWorkbook, directoryOf } from './model';
import { xlsxOutline } from './outline';
import { xlsxRead } from './read';
import { xlsxEdit } from './edit';

/**
 * Structural check on bytes we produced.
 *
 * In the order a broken edit is most likely to break things:
 *
 * 1. The archive opens and `[Content_Types].xml` is there with a `<Types>` root.
 * 2. Every part the content types *declare* is actually present. ⚠️ This is the check that
 *    catches a mistake unique to this handler: forcing recalculation removes
 *    `xl/calcChain.xml`, and leaving its override behind gives a workbook that Excel offers to
 *    repair. It also catches the reverse for a part we added.
 * 3. The workbook part is reachable, has a `<sheets>` element, and every sheet's part exists and
 *    still tokenises. `openWorkbook` re-runs the same path a read takes, so bytes a read would
 *    choke on can never be saved.
 * 4. No two sheets share a name — Excel discards one of them, silently.
 * 5. Every sheet part parses far enough to prove its `<sheetData>` is balanced.
 */
function verifyXlsx(bytes: Uint8Array): void {
  const archive = openArchive(bytes);

  if (!archive.has('[Content_Types].xml')) {
    throw new DocumentError('[Content_Types].xml is missing');
  }

  const contentTypes = tokenize(archive.text('[Content_Types].xml'));
  if (!element(contentTypes, 'Types')) {
    throw new DocumentError('[Content_Types].xml has no <Types> root');
  }

  const declared = new Set<string>();
  for (const override of elements(contentTypes, 'Override')) {
    const partName = (attr(contentTypes, override, 'PartName') ?? '').replace(/^\/+/, '');
    if (partName === '') continue;
    declared.add(partName);
    if (!archive.has(partName)) {
      throw new DocumentError(
        `[Content_Types].xml declares "${partName}", which is not in the file`,
      );
    }
  }

  // The reverse direction, for the one part this handler removes. An orphaned calcChain that is
  // present but undeclared is the mirror-image failure and just as invisible to Excel's own
  // error message.
  const workbook = openWorkbook(bytes);
  const calcChain = `${directoryOf(workbook.bookName)}calcChain.xml`;
  if (archive.has(calcChain) && !declared.has(calcChain)) {
    throw new DocumentError(
      `"${calcChain}" is in the file but not declared in [Content_Types].xml`,
    );
  }

  if (workbook.sheets.length === 0) {
    throw new DocumentError('the workbook came out with no worksheets');
  }

  const seen = new Set<string>();
  for (const info of workbook.sheets) {
    const key = info.name.toLowerCase();
    if (seen.has(key)) {
      throw new DocumentError(`two sheets are both called "${info.name}"`);
    }
    seen.add(key);

    const source = archive.textOrNull(info.partName);
    if (source === null) {
      throw new DocumentError(`sheet "${info.name}" lost its part "${info.partName}"`);
    }

    // ⚠️ Tokenised strictly here rather than relying on the reader. `parseSheet` is tolerant by
    // design so one odd sheet cannot make a whole workbook unreadable — which is right for
    // reading and catastrophic for writing, because a sheet we had just corrupted would be
    // skipped on the verification read and the save reported as a success.
    let part;
    try {
      part = tokenize(source);
    } catch (e) {
      throw new DocumentError(
        `sheet "${info.name}" no longer parses: ${(e as Error).message}`,
      );
    }

    const root = element(part, 'worksheet');
    if (!root) {
      throw new DocumentError(`sheet "${info.name}" lost its <worksheet> root`);
    }
    // Walking to `sheetData`'s close proves the tree is balanced through the cells, which is
    // where every edit in this handler lands.
    element(part, 'sheetData', root);
  }
}

export const xlsxHandler: FormatHandler = {
  format: 'xlsx',
  // `.xlsm` is the same package with a macro part we never touch; `.xltx` is the template form.
  // Refusing either would only make the user rename the file.
  extensions: ['xlsx', 'xlsm', 'xltx'],
  outline: xlsxOutline,
  read: xlsxRead,
  edit: xlsxEdit,
  verify: verifyXlsx,
};

registerHandler(xlsxHandler);
