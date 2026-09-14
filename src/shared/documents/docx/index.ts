/**
 * The docx handler.
 *
 * Reads (outline, paragraph ranges, search) and edits (tracked changes, comments,
 * paragraph insert/delete, styles). Everything with a side effect is elsewhere: the engine
 * loads the bytes, `storage.ts` takes the backup and does the atomic write, and this object
 * is pure bytes → bytes.
 *
 * `verify` is the reason the write path can be trusted, so it is written to be paranoid
 * rather than fast: it runs twice per save, on a file we are about to hand back to the
 * user as their thesis.
 */

import { registerHandler, type FormatHandler } from '../registry';
import { DocumentError } from '../types';
import { openArchive } from '../zip';
import { tokenize, element, elements } from '../ooxml/xml-cursor';
import { docxOutline } from './outline';
import { docxRead } from './project';
import { docxEdit } from './edit';
import { openDocx } from './model';

/**
 * Structural check on bytes we produced.
 *
 * Four things, in the order that a broken edit is most likely to break them:
 *
 * 1. The archive still opens and still has `[Content_Types].xml`. ⚠️ A missing or
 *    incomplete content-types part is the single most common way a hand-edited docx
 *    turns into "Word found unreadable content" — and it is what happens when a new part
 *    (like `comments.xml`) is added without declaring it.
 * 2. The main part is still reachable through the relationships.
 * 3. The main part still tokenises, and every element in it still closes. `tokenize`
 *    itself catches an unterminated tag; `element('w:body')` walking to a close proves
 *    the tree is balanced through the body.
 * 4. The body still has content. An edit that emptied the document would otherwise pass
 *    every structural test.
 * 5. A comments part, if there is one, is both declared and related. See `verifyComments`.
 */
function verifyDocx(bytes: Uint8Array): void {
  const archive = openArchive(bytes);

  if (!archive.has('[Content_Types].xml')) {
    throw new DocumentError('[Content_Types].xml is missing');
  }

  const contentTypes = tokenize(archive.text('[Content_Types].xml'));
  if (!element(contentTypes, 'Types')) {
    throw new DocumentError('[Content_Types].xml has no <Types> root');
  }

  // Re-runs relationship lookup, tokenising and the body check. Deliberately the same
  // code path a read takes: if a read of these bytes would fail, the save must fail too.
  const doc = openDocx(bytes);

  // ⚠️ `bodyBlocks`, not `blocks`. Once headers and footnotes are part of the model, a
  // `blocks` check passes on a file whose body was emptied but whose footer survived — which
  // is the exact damage this line exists to catch.
  if (doc.bodyBlocks.length === 0) {
    throw new DocumentError('the document body came out empty');
  }

  verifySideParts(doc, archive);

  // Every part the content types declare by name must actually be in the archive.
  // A dangling override is how a removed part (calcChain, comments) leaves a file that
  // opens in Word but not in Pages or WPS.
  const declared = new Set<string>();
  for (const override of contentTypes.tokens) {
    if (override.kind !== 'self' && override.kind !== 'open') continue;
    if (override.name !== 'Override') continue;
    const tag = contentTypes.source.slice(override.start, override.end);
    const match = /PartName\s*=\s*"([^"]+)"/.exec(tag);
    if (!match) continue;
    const partName = match[1].replace(/^\/+/, '');
    declared.add(partName);
    if (!archive.has(partName)) {
      throw new DocumentError(
        `[Content_Types].xml declares "${partName}", which is not in the file`,
      );
    }
  }

  verifyComments(doc, archive, declared);
}

/**
 * Every header, footer and note part still parses and still has its root.
 *
 * ⚠️ This check has to be here rather than left to `openDocx`, and the reason is a trap in
 * the reader's own error handling: `openParts` skips a part it cannot tokenise, because one
 * damaged footer is not a reason to refuse to open somebody's thesis. That tolerance is right
 * for reading and catastrophic for writing — a header this handler had just corrupted would
 * be *skipped* on the verification read, and the save would be reported as a success.
 *
 * So verification re-opens them strictly: anything the archive has, and that Word will
 * therefore load, must parse here.
 */
function verifySideParts(
  doc: ReturnType<typeof openDocx>,
  archive: ReturnType<typeof openArchive>,
): void {
  const roots: Record<string, string> = {
    header: 'w:hdr',
    footer: 'w:ftr',
    footnotes: 'w:footnotes',
    endnotes: 'w:endnotes',
  };

  for (const part of doc.parts) {
    if (part.kind === 'body') continue;
    const source = archive.textOrNull(part.name);
    if (source === null) {
      throw new DocumentError(`"${part.name}" disappeared from the package`);
    }
    let root;
    try {
      root = element(tokenize(source), roots[part.kind]);
    } catch (e) {
      throw new DocumentError(`"${part.name}" no longer parses: ${(e as Error).message}`);
    }
    if (!root) {
      throw new DocumentError(`"${part.name}" lost its <${roots[part.kind]}> root`);
    }
  }
}

/**
 * The other direction: a part we *added* must be declared and related.
 *
 * Only `comments.xml`, because it is the only part this handler creates — and because both
 * ways of getting it wrong are silent to every other check here. An undeclared part makes
 * Word report the whole document as damaged; an unrelated one makes Word open the file
 * happily and show none of the comments, so the agent reports success on work that is not
 * there.
 */
function verifyComments(
  doc: ReturnType<typeof openDocx>,
  archive: ReturnType<typeof openArchive>,
  declared: Set<string>,
): void {
  const slash = doc.mainName.lastIndexOf('/');
  const dir = slash === -1 ? '' : doc.mainName.slice(0, slash + 1);
  const commentsName = `${dir}comments.xml`;

  const referenced = elements(doc.main, 'w:commentReference').length > 0;
  if (!archive.has(commentsName)) {
    if (referenced) {
      throw new DocumentError(
        'the body references comments but there is no comments part',
      );
    }
    return;
  }

  if (!declared.has(commentsName)) {
    throw new DocumentError(
      `"${commentsName}" is in the file but not declared in [Content_Types].xml, ` +
        'which Word reports as unreadable content',
    );
  }

  const base = doc.mainName.slice(slash + 1);
  const rels = archive.textOrNull(`${dir}_rels/${base}.rels`);
  if (!rels || !/relationships\/comments"/.test(rels)) {
    throw new DocumentError(
      'the comments part is not related from the document body, so Word would show no ' +
        'comments at all',
    );
  }
}

export const docxHandler: FormatHandler = {
  format: 'docx',
  // `.docm` is the same package with macros. Reading it is identical; the macros live in
  // a part we never touch, and refusing the extension would only make the user rename it.
  extensions: ['docx', 'docm'],
  outline: docxOutline,
  read: docxRead,
  edit: docxEdit,
  verify: verifyDocx,
};

registerHandler(docxHandler);
