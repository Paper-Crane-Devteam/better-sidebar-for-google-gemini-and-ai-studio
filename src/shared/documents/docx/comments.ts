/**
 * Comments — the safest useful thing an AI can do to someone's thesis.
 *
 * ## Why this matters more than editing
 *
 * "Review my paper" does not mean "rewrite my paper". A comment changes no text, so it
 * cannot be wrong in a way that costs the user anything: they read it, agree or don't, and
 * move on. That is the shape of feedback a supervisor gives, and it is the output form
 * this whole feature is aimed at. Tracked changes are for when the user asked for the fix
 * itself.
 *
 * ## Adding a comment touches four places, and three of them are not the comment
 *
 * 1. `word/comments.xml` — the comment bodies. Often absent, so often created.
 * 2. `[Content_Types].xml` — an `Override` declaring that part's content type.
 * 3. `word/_rels/document.xml.rels` — a relationship from the body to the part.
 * 4. the body itself — `w:commentRangeStart` / `w:commentRangeEnd` around the text, plus a
 *    run holding `w:commentReference`.
 *
 * ⚠️ **Missing (2) is the classic way to produce a "Word found unreadable content" file.**
 * A part that is in the zip but undeclared is not part of the package as far as OPC is
 * concerned, and Word treats the whole document as damaged rather than ignoring it. It is
 * also invisible to any check that only looks at the XML we wrote, which is why
 * `verifyDocx` cross-checks declarations against entries in both directions.
 *
 * Missing (3) fails differently and more quietly: Word opens the file and simply shows no
 * comments, so the agent reports success on work the user cannot see.
 */

import { DocumentError } from '../types';
import type { Archive } from '../zip';
import {
  type Edit,
  type XmlPart,
  attr,
  elements,
  escapeXml,
  replaceElement,
  tokenize,
} from '../ooxml/xml-cursor';
import { type FlatParagraph, type TextHit, runXml, splitRunsAt } from '../ooxml/runs';
import { ownChild, type Block, type DocxDocument } from './model';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const COMMENTS_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';

const COMMENTS_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';

/** An empty comments part, for the common case where the document has none. */
const EMPTY_COMMENTS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
  `<w:comments xmlns:w="${W_NS}"></w:comments>`;

export interface CommentAuthor {
  name: string;
  /** Shown in the margin bubble. Derived from the name when not given. */
  initials: string;
}

/**
 * Accumulates comments across one `doc_edit` call, then writes all four places at once.
 *
 * Staged rather than written per comment because the three side parts each need exactly
 * one edit no matter how many comments there are — and because a call that turns out to
 * add no comments must leave the package byte-identical, which is what makes a read-only
 * round trip provably lossless.
 */
export interface CommentWriter {
  /** Stage a comment body and return the id to anchor in the document. */
  add(text: string): number;
  /** How many were staged. */
  count: number;
  /** Write `comments.xml`, its content type and its relationship. No-op when empty. */
  commit(): void;
}

export function openComments(
  doc: DocxDocument,
  author: CommentAuthor,
  date: string,
): CommentWriter {
  const partName = siblingPart(doc.mainName, 'comments.xml');
  const existing = doc.archive.textOrNull(partName);
  let nextId = existing ? highestCommentId(existing) + 1 : 1;

  const bodies: string[] = [];

  return {
    add(text) {
      const id = nextId++;
      bodies.push(commentXml(id, text, author, date));
      return id;
    },

    get count() {
      return bodies.length;
    },

    commit() {
      if (bodies.length === 0) return;

      doc.archive.setText(partName, appendComments(existing ?? EMPTY_COMMENTS, bodies));
      ensureContentType(doc.archive, partName, COMMENTS_CONTENT_TYPE);
      ensureRelationship(doc.archive, doc.mainName, 'comments.xml', COMMENTS_REL_TYPE);
    },
  };
}

/**
 * Two initials from a display name, for the margin bubble.
 *
 * ⚠️ A parenthesised qualifier is dropped first. The default author is
 * `AI (Better Sidebar)`, and treating the bracket as part of the name gives `AB` — the
 * initials of a person who does not exist, on every comment we write. With the bracket gone
 * the name is one word, and a single word contributes its first two letters (`AI`), which is
 * also the right answer for a mononym.
 */
export function initialsFor(name: string): string {
  const bare = name.replace(/[([{].*?[)\]}]/g, ' ');
  const words = bare.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

  if (words.length === 0) return 'AI';
  if (words.length === 1) return [...words[0]].slice(0, 2).join('').toUpperCase();

  return words
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
    .toUpperCase();
}

// ─── The comments part ───────────────────────────────────────────────────────

/**
 * One `<w:comment>`.
 *
 * The leading run with `w:annotationRef` is what Word itself writes: it renders as the
 * comment's own number inside the bubble. Skipping it leaves a comment that works but
 * looks subtly unlike every other comment in the document.
 *
 * Newlines in the comment text become separate paragraphs, because `w:t` cannot hold a
 * line break and a model writing multi-point feedback will use them.
 */
function commentXml(
  id: number,
  text: string,
  author: CommentAuthor,
  date: string,
): string {
  const lines = text.split(/\r?\n/);
  const paragraphs = lines
    .map((line, index) => {
      const prefix =
        index === 0
          ? '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>'
          : '';
      return (
        '<w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>' +
        `${prefix}${runXml(line)}</w:p>`
      );
    })
    .join('');

  return (
    `<w:comment w:id="${id}" w:author="${escapeXml(author.name)}" ` +
    `w:date="${date}" w:initials="${escapeXml(author.initials)}">` +
    `${paragraphs}</w:comment>`
  );
}

/**
 * Splice new comments in before `</w:comments>`.
 *
 * A splice rather than a rebuild, for the same reason the rest of this engine splices: the
 * existing comments may be the supervisor's review the user is responding to, and
 * re-serialising them through any model of ours risks changing them.
 */
function appendComments(source: string, bodies: string[]): string {
  const part = tokenize(source);
  const root = elements(part, 'w:comments')[0];
  if (!root) {
    throw new DocumentError(
      'word/comments.xml exists but has no <w:comments> root, so comments cannot be added ' +
        'to this document.',
    );
  }

  // A self-closing `<w:comments/>` has no content position to insert at.
  if (root.selfClosing) {
    return (
      source.slice(0, root.outerStart) +
      `<w:comments xmlns:w="${W_NS}">${bodies.join('')}</w:comments>` +
      source.slice(root.outerEnd)
    );
  }

  return source.slice(0, root.innerEnd) + bodies.join('') + source.slice(root.innerEnd);
}

/**
 * The highest `w:id` among the comments already in the part.
 *
 * ⚠️ `\b` before `w:id`, not `\s`. Requiring whitespace there cannot match `<w:comment
 * w:id="1"` — the one space is consumed by the separator after the tag name, so the pattern
 * silently found nothing and numbering restarted at 1. Two comments then shared an id, and
 * Word shows a single comment for both while the second anchor points at nothing.
 */
function highestCommentId(source: string): number {
  let highest = 0;
  const pattern = /<w:comment\b[^>]*?\bw:id\s*=\s*"(\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const value = Number(match[1]);
    if (value > highest) highest = value;
  }
  return highest;
}

// ─── Package plumbing ────────────────────────────────────────────────────────

/** `word/document.xml` + `comments.xml` → `word/comments.xml`. */
function siblingPart(mainName: string, fileName: string): string {
  const slash = mainName.lastIndexOf('/');
  return slash === -1 ? fileName : `${mainName.slice(0, slash + 1)}${fileName}`;
}

/** `word/document.xml` → `word/_rels/document.xml.rels`. */
function relsNameFor(mainName: string): string {
  const slash = mainName.lastIndexOf('/');
  const dir = slash === -1 ? '' : mainName.slice(0, slash + 1);
  const base = mainName.slice(slash + 1);
  return `${dir}_rels/${base}.rels`;
}

/**
 * Declare a part's content type, unless it already is.
 *
 * ⚠️ An `Override` is required even though `[Content_Types].xml` almost always has a
 * `Default` for the `xml` extension — the default maps to a generic XML type, and Word
 * decides what a part *is* from the override. Relying on the default gives a package that
 * opens with the comments silently absent.
 */
function ensureContentType(
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
    throw new DocumentError(
      '[Content_Types].xml has no usable <Types> root, so no part can be added.',
    );
  }

  const declaration = `<Override PartName="${target}" ContentType="${contentType}"/>`;
  archive.setText(
    '[Content_Types].xml',
    source.slice(0, root.innerEnd) + declaration + source.slice(root.innerEnd),
  );
}

/**
 * Relate the body to a part, unless it already does.
 *
 * `target` is relative to the main part's own folder, which is how every relationship in
 * `word/_rels/` is written. An absolute `/word/comments.xml` is legal OPC but is not what
 * Word writes, and some readers resolve it against the package root twice.
 */
function ensureRelationship(
  archive: Archive,
  mainName: string,
  target: string,
  relType: string,
): void {
  const relsName = relsNameFor(mainName);
  const source = archive.textOrNull(relsName);
  if (source === null) {
    throw new DocumentError(
      `The document has no "${relsName}", so a comments part cannot be attached to it.`,
    );
  }

  const part = tokenize(source);
  const used = new Set<string>();
  for (const rel of elements(part, 'Relationship')) {
    if (attr(part, rel, 'Type') === relType) return;
    const id = attr(part, rel, 'Id');
    if (id) used.add(id);
  }

  const root = elements(part, 'Relationships')[0];
  if (!root || root.selfClosing) {
    throw new DocumentError(`"${relsName}" has no usable <Relationships> root.`);
  }

  let n = used.size + 1;
  while (used.has(`rId${n}`)) n++;

  const declaration =
    `<Relationship Id="rId${n}" Type="${relType}" Target="${escapeXml(target)}"/>`;
  archive.setText(
    relsName,
    source.slice(0, root.innerEnd) + declaration + source.slice(root.innerEnd),
  );
}

// ─── Anchoring in the body ───────────────────────────────────────────────────

/**
 * The run that carries the comment's marker.
 *
 * `w:commentReference` is what makes the comment appear at all — the range markers only
 * define the highlight. A comment with a range and no reference is invisible in Word.
 */
function referenceRun(id: number): string {
  return (
    '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>' +
    `<w:commentReference w:id="${id}"/></w:r>`
  );
}

/**
 * Attach a comment to an exact stretch of text inside a paragraph.
 *
 * Runs are split at the range's boundaries so the highlight covers the quoted sentence and
 * nothing else. Anchoring on whole runs instead would be a few lines shorter and would
 * routinely highlight the entire paragraph — Word stores an unformatted paragraph as one
 * run, so "comment on this sentence" would mark all six of them.
 */
export function commentOnTextEdits(
  flat: FlatParagraph,
  hit: TextHit,
  id: number,
  label?: string,
): Edit[] {
  const splits = splitRunsAt(flat, hit);
  const last = splits.length - 1;

  return splits.map((split, index) => {
    const rPr = split.slice.rPr;
    let xml = runXml(split.before, rPr);
    if (index === 0) xml += `<w:commentRangeStart w:id="${id}"/>`;
    xml += runXml(split.inside, rPr);
    if (index === last) {
      xml += `<w:commentRangeEnd w:id="${id}"/>${referenceRun(id)}`;
    }
    xml += runXml(split.after, rPr);
    return replaceElement(split.slice.run, xml, label);
  });
}

/**
 * Attach a comment to a whole paragraph.
 *
 * ⚠️ `w:commentRangeStart` goes **after** `w:pPr`, not at the paragraph's content start:
 * `w:pPr` must be the first child of `w:p`, and putting anything before it is the schema
 * violation Word reports as unreadable content.
 *
 * No run surgery here at all, which makes this the reliable path — it works on a paragraph
 * whose text spans images or field codes, where an exact-range comment has to be refused.
 */
export function commentOnParagraphEdits(
  block: Block,
  id: number,
  label?: string,
): Edit[] {
  const markers = `<w:commentRangeStart w:id="${id}"/><w:commentRangeEnd w:id="${id}"/>${referenceRun(id)}`;

  // ⚠️ An empty paragraph is written `<w:p/>`, and a self-closing element has no inside:
  // `innerStart` and `innerEnd` both sit *after* the `/>`. Inserting there would put the
  // markers between two paragraphs rather than in one. The tag has to be expanded instead.
  if (block.el.selfClosing) {
    return [replaceElement(block.el, `<w:p>${markers}</w:p>`, label)];
  }

  const pPr = ownChild(block.part, block.el, 'w:pPr');
  const start = pPr ? pPr.outerEnd : block.el.innerStart;

  return [
    { start, end: start, text: `<w:commentRangeStart w:id="${id}"/>`, label },
    {
      start: block.el.innerEnd,
      end: block.el.innerEnd,
      text: `<w:commentRangeEnd w:id="${id}"/>${referenceRun(id)}`,
      label,
    },
  ];
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export interface ExistingComment {
  id: string;
  author: string;
  date: string;
  text: string;
}

/**
 * The comments already in the document.
 *
 * Read before suggesting anything: on a thesis, existing comments usually *are* the review
 * the user is asking to have addressed, and answering feedback the agent never read is the
 * most expensive way to be unhelpful here.
 */
export function readComments(doc: DocxDocument): ExistingComment[] {
  const source = doc.archive.textOrNull(siblingPart(doc.mainName, 'comments.xml'));
  if (!source) return [];

  let part: XmlPart;
  try {
    part = tokenize(source);
  } catch {
    return [];
  }

  return elements(part, 'w:comment').map((el) => ({
    id: attr(part, el, 'w:id') ?? '?',
    author: attr(part, el, 'w:author') ?? 'unknown',
    date: (attr(part, el, 'w:date') ?? '').slice(0, 10),
    // Every `w:t` under the comment, paragraphs joined by a space: a comment is one remark,
    // and its internal line breaks are not information the agent needs to preserve.
    text: elements(part, 'w:t', el)
      .map((t) => part.source.slice(t.innerStart, t.innerEnd))
      .join('')
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

/** Which paragraph each comment is anchored in, by `w:commentRangeStart` position. */
export function commentAnchors(doc: DocxDocument): Map<string, string> {
  const anchors = new Map<string, string>();

  // Body only: `w:commentRangeStart` offsets index the main part's source, and comparing
  // them against a block from a header would match on offsets from a different string.
  for (const marker of elements(doc.main, 'w:commentRangeStart')) {
    const id = attr(doc.main, marker, 'w:id');
    if (!id || anchors.has(id)) continue;
    const block = doc.bodyBlocks.find(
      (b) =>
        b.kind === 'paragraph' &&
        b.el.outerStart <= marker.outerStart &&
        b.el.outerEnd >= marker.outerEnd,
    );
    if (block) anchors.set(id, block.id);
  }

  return anchors;
}
