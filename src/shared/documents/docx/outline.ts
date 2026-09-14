/**
 * What is in this document — the answer that has to fit in a few hundred tokens.
 *
 * This is the first thing the agent sees for any `.docx`, and for a long document it may
 * be the only thing it sees before deciding where to read. So it carries three kinds of
 * information and nothing else:
 *
 * - **A summary line** the agent can repeat to the user verbatim.
 * - **Facts** that change what to do next: how many paragraphs, how big, how many tables.
 * - **Warnings** about things that make editing risky — someone else's tracked changes,
 *   existing comments, field codes, a protected document. Discovering those *after*
 *   writing is how an edit becomes damage.
 *
 * The outline never contains body text beyond heading labels, except in the one case
 * where there are no headings at all.
 */

import type { DocOutlineResult, OutlineNode } from '../types';
import type { LoadedDocument } from '../storage';
import { elements } from '../ooxml/xml-cursor';
import { openDocx, paragraphText, type DocxDocument } from './model';

/** Headings listed at most. A 600-heading book does not need all of them up front. */
const MAX_SECTIONS = 200;

/** When there are no headings, this many leading paragraphs stand in for them. */
const FALLBACK_SECTIONS = 25;

/** Characters of a paragraph used as a fallback section label. */
const LABEL_CHARS = 60;

export function docxOutline(loaded: LoadedDocument): DocOutlineResult {
  const doc = openDocx(loaded.bytes);

  // Body only for the outline proper: the headings, counts and section sizes are about the
  // document the user is reading. Other parts get their own fact line below, which is all
  // that "there is a footer, and here is how to name it" needs.
  const paragraphs = doc.bodyBlocks.filter((b) => b.kind === 'paragraph');
  const tables = doc.bodyBlocks.filter((b) => b.kind === 'table');

  // One pass for the text, because every count below wants it and flattening a
  // paragraph is the expensive part of reading a document.
  const texts = paragraphs.map((block) => paragraphText(block));
  const characters = texts.reduce((sum, text) => sum + text.length, 0);

  const headings = paragraphs
    .map((block, index) => ({ block, index, text: texts[index] }))
    .filter((entry) => entry.block.headingLevel !== null && entry.text.trim() !== '');

  const sections: OutlineNode[] =
    headings.length > 0
      ? buildSections(headings, texts)
      : buildFallbackSections(paragraphs, texts);

  const facts = [
    `${paragraphs.length} paragraphs, ${characters} characters`,
    `${tables.length} table${tables.length === 1 ? '' : 's'}`,
  ];

  const images = elements(doc.main, 'w:drawing').length + elements(doc.main, 'w:pict').length;
  if (images > 0) facts.push(`${images} images or charts`);

  // Counted from the references in the body, not from `footnotes.xml`: that part always
  // carries two boilerplate separator entries, so its element count is always two too
  // many, and the number the user cares about is how many are actually cited.
  const footnotes = elements(doc.main, 'w:footnoteReference').length;
  if (footnotes > 0) facts.push(`${footnotes} footnotes`);

  // ⚠️ The one fact that has to be here rather than discovered later. A page header is text
  // the user can see, so "change the date in the header" is a normal request — and while the
  // outline said nothing about headers, the honest-looking answer was "this document does not
  // contain that date". Naming the parts up front is what makes the request answerable.
  const sideParts = doc.parts
    .filter(
      (part) =>
        part.kind !== 'body' &&
        doc.blocks.some(
          (b) => b.part === part && b.kind === 'paragraph' && paragraphText(b).trim() !== '',
        ),
    )
    .map((part) => `${part.id} = ${part.label}`);
  if (sideParts.length > 0) {
    facts.push(`text outside the body: ${sideParts.join(', ')} (read with range="hd1")`);
  }

  const cells = doc.cells.size;
  if (cells > 0) {
    const empty = [...doc.cells.values()].filter(
      (cell) =>
        cell.paragraphIds.length > 0 &&
        cell.paragraphIds.every((id) => {
          const block = doc.byId.get(id);
          return !block || paragraphText(block).trim() === '';
        }),
    ).length;
    facts.push(
      `${cells} table cells, addressed as t1r1c1` +
        (empty > 0 ? `; ${empty} are empty — fill one with set_text` : ''),
    );
  }

  return {
    kind: 'outline',
    path: loaded.path,
    format: 'docx',
    summary: summarise(loaded.path, paragraphs.length, tables.length, characters, headings.length),
    facts,
    sections: sections.slice(0, MAX_SECTIONS),
    warnings: collectWarnings(doc, {
      headings: headings.length,
      sectionsShown: Math.min(sections.length, MAX_SECTIONS),
      sectionsTotal: sections.length,
    }),
  };
}

function summarise(
  path: string,
  paragraphs: number,
  tables: number,
  characters: number,
  headings: number,
): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const parts = [
    `${name} is a Word document`,
    `${characters} characters in ${paragraphs} paragraphs`,
  ];
  if (tables > 0) parts.push(`${tables} tables`);
  parts.push(
    headings > 0
      ? `${headings} headings (listed below)`
      : 'no heading styles, so the outline below is the opening paragraphs instead',
  );
  return `${parts.join('; ')}.`;
}

/**
 * Heading nodes, with each section's size.
 *
 * Size is the characters from this heading up to the next heading at the same level or
 * shallower — i.e. the section's own content, not its subsections' as well. That is the
 * number that answers "can I read this section in one call".
 */
function buildSections(
  headings: Array<{ block: { id: string; headingLevel: number | null }; index: number; text: string }>,
  texts: string[],
): OutlineNode[] {
  return headings.map((entry, i) => {
    const level = entry.block.headingLevel ?? 1;
    let end = texts.length;

    for (let j = i + 1; j < headings.length; j++) {
      if ((headings[j].block.headingLevel ?? 1) <= level) {
        end = headings[j].index;
        break;
      }
    }

    let size = 0;
    for (let k = entry.index; k < end; k++) size += texts[k].length;

    return { id: entry.block.id, label: trimLabel(entry.text), level, size };
  });
}

/**
 * Stand-ins for a document with no heading styles.
 *
 * More common than it should be: theses formatted with direct bold-and-bigger text, and
 * anything produced by a LaTeX or Markdown converter that did not map headings. Without
 * this the outline of a 300-paragraph document is empty, which reads as "the file is
 * broken" and gives the agent nothing to aim at.
 */
function buildFallbackSections(
  paragraphs: Array<{ id: string }>,
  texts: string[],
): OutlineNode[] {
  const nodes: OutlineNode[] = [];
  for (let i = 0; i < paragraphs.length && nodes.length < FALLBACK_SECTIONS; i++) {
    const text = texts[i].trim();
    if (text === '') continue;
    nodes.push({ id: paragraphs[i].id, label: trimLabel(text), level: 1, size: text.length });
  }
  return nodes;
}

function trimLabel(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > LABEL_CHARS ? `${flat.slice(0, LABEL_CHARS)}…` : flat;
}

/**
 * Everything that should change the agent's plan before it edits.
 *
 * Each entry is phrased as a consequence, not an observation: "there are already 12
 * tracked changes" is a fact the model will ignore, "…so your edits will be mixed in
 * with someone else's" is one it will act on.
 */
function collectWarnings(
  doc: DocxDocument,
  counts: { headings: number; sectionsShown: number; sectionsTotal: number },
): string[] {
  const warnings: string[] = [];

  const insertions = elements(doc.main, 'w:ins').length;
  const deletions = elements(doc.main, 'w:del').length;
  if (insertions + deletions > 0) {
    warnings.push(
      `This document already contains ${insertions + deletions} tracked changes from ` +
        'someone else, so any edit you make will be mixed in with theirs. Say so when ' +
        'you report back.',
    );
  }

  if (doc.archive.has('word/comments.xml')) {
    warnings.push(
      'This document already has comments. Read them before suggesting changes — they ' +
        'may be the review you are being asked to respond to.',
    );
  }

  if (elements(doc.main, 'w:fldSimple').length > 0 || elements(doc.main, 'w:instrText').length > 0) {
    warnings.push(
      'Parts of this document are field codes (table of contents, cross-references, ' +
        'citations). Their visible text is generated and must not be edited directly — ' +
        'it will be overwritten the next time Word refreshes them.',
    );
  }

  if (elements(doc.main, 'w:txbxContent').length > 0) {
    warnings.push(
      'Some text is inside text boxes or shapes. It is readable and editable, but it is ' +
        'not part of the main paragraph flow, so it appears between the surrounding ' +
        'paragraph numbers rather than where it sits on the page. Word keeps a second ' +
        'legacy copy of that text for Word 2007, which is not updated until the user saves ' +
        'in Word — mention that if you edit a text box.',
    );
  }

  if (doc.archive.has('word/settings.xml')) {
    const settings = doc.archive.text('word/settings.xml');
    if (settings.includes('w:documentProtection')) {
      warnings.push(
        'This document has editing protection turned on. Changes written here will ' +
          'still apply, but Word may refuse to show them as editable.',
      );
    }
  }

  if (counts.headings === 0) {
    warnings.push(
      'No heading styles were found, so there is no real table of contents. Use ' +
        'doc_read with a paragraph range to move through the document.',
    );
  }

  if (counts.sectionsTotal > counts.sectionsShown) {
    warnings.push(
      `Only the first ${counts.sectionsShown} of ${counts.sectionsTotal} headings are ` +
        'listed here.',
    );
  }

  return warnings;
}
