/**
 * Offset-preserving XML cursor — the foundation everything OOXML sits on.
 *
 * ## Why not a real XML parser
 *
 * Three reasons, in order of how much they hurt:
 *
 * 1. **No `DOMParser` where this runs.** Neither a service worker nor a Web Worker has
 *    one, and the engine has to run in a worker (see `.kiro/docs/document-formats.md`
 *    §4). `@xmldom/xmldom` and `fast-xml-parser` fill that gap, but they lead to (2).
 * 2. **Any parse→serialise round trip rewrites the whole part.** Namespace prefixes,
 *    attribute order, self-closing style, `xml:space="preserve"`, entity spelling —
 *    all of it is re-emitted from the parser's own model, and anything the model does
 *    not represent is gone. In a user's thesis that means existing tracked changes,
 *    comments, field codes, charts and pivot caches. This is exactly how exceljs loses
 *    charts, and it is the failure mode we cannot ship.
 * 3. **Size.** A full object model costs 1–20 MB of bundle for the 5% we would use.
 *
 * So this module does the minimum that makes surgical editing possible: turn a part
 * into a flat list of tokens that each remember *where they came from*, and express
 * every edit as a splice into the original string. Bytes outside an edited region are
 * bit-for-bit identical afterwards, because they are literally never re-generated.
 *
 * ## What it deliberately does not do
 *
 * No entity expansion (so XML bombs are a non-issue here, and `&amp;` stays as
 * written), no DTD, no namespace resolution — OOXML uses fixed prefixes and the spec
 * pins them. No validation: a part that is already broken should fail at Word's door,
 * not silently here.
 *
 * ⚠️ Offsets are UTF-16 code-unit indices into the decoded string, not byte offsets.
 * Everything downstream must stay in that same unit, and the only conversion back to
 * bytes is a single `strToU8` at save time.
 */

export type TokenKind =
  /** `<w:p ...>` */
  | 'open'
  /** `</w:p>` */
  | 'close'
  /** `<w:br/>` */
  | 'self'
  /** Character data between tags. */
  | 'text'
  /** `<?xml ... ?>`, `<!-- -->`, `<![CDATA[...]]>`, `<!DOCTYPE ...>` */
  | 'other';

export interface Token {
  kind: TokenKind;
  /** Qualified name as written, e.g. `w:p`. Empty for `text` and `other`. */
  name: string;
  /** Inclusive start offset in the source string. */
  start: number;
  /** Exclusive end offset in the source string. */
  end: number;
  /** Depth of the element this token belongs to; root element is 0. */
  depth: number;
}

/**
 * A tokenised XML part, plus the source it came from.
 *
 * Immutable. Edits are described against it and applied by `applyEdits`, which
 * produces a new string; re-tokenising after an edit is one pass and keeps the
 * invariant that offsets always describe the string currently in hand.
 */
export interface XmlPart {
  readonly source: string;
  readonly tokens: Token[];
}

export class XmlError extends Error {}

/**
 * Tokenise an XML part.
 *
 * One linear scan, no recursion, no allocation per character. A 20 MB `document.xml`
 * tokenises in well under a second, which matters because this runs on every read.
 */
export function tokenize(source: string): XmlPart {
  const tokens: Token[] = [];
  const length = source.length;
  let i = 0;
  let depth = -1;

  while (i < length) {
    const lt = source.indexOf('<', i);

    // Trailing character data after the last tag (usually just a newline).
    if (lt === -1) {
      if (i < length) {
        tokens.push({ kind: 'text', name: '', start: i, end: length, depth });
      }
      break;
    }

    if (lt > i) {
      tokens.push({ kind: 'text', name: '', start: i, end: lt, depth });
    }

    // Declarations, comments and CDATA are passed through untouched. They need their
    // own end markers because a `>` inside a comment does not close anything.
    if (source.startsWith('<!--', lt)) {
      const end = advancePast(source, lt, '-->');
      tokens.push({ kind: 'other', name: '', start: lt, end, depth });
      i = end;
      continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = advancePast(source, lt, ']]>');
      tokens.push({ kind: 'other', name: '', start: lt, end, depth });
      i = end;
      continue;
    }
    if (source.startsWith('<?', lt)) {
      const end = advancePast(source, lt, '?>');
      tokens.push({ kind: 'other', name: '', start: lt, end, depth });
      i = end;
      continue;
    }
    if (source.startsWith('<!', lt)) {
      const end = advancePast(source, lt, '>');
      tokens.push({ kind: 'other', name: '', start: lt, end, depth });
      i = end;
      continue;
    }

    const gt = findTagEnd(source, lt);
    if (gt === -1) {
      throw new XmlError(`Unterminated tag at offset ${lt}`);
    }

    const isClose = source.charCodeAt(lt + 1) === 47; // '/'
    const isSelf = source.charCodeAt(gt - 1) === 47;
    const nameStart = lt + (isClose ? 2 : 1);
    const name = readName(source, nameStart, gt);

    if (isClose) {
      tokens.push({ kind: 'close', name, start: lt, end: gt + 1, depth });
      depth--;
    } else if (isSelf) {
      tokens.push({ kind: 'self', name, start: lt, end: gt + 1, depth: depth + 1 });
    } else {
      depth++;
      tokens.push({ kind: 'open', name, start: lt, end: gt + 1, depth });
    }

    i = gt + 1;
  }

  return { source, tokens };
}

/**
 * End of a tag, skipping `>` that appear inside attribute values.
 *
 * `w:val="a > b"` is legal-ish in the wild (it should be `&gt;`, but Word has emitted
 * worse), and a naive `indexOf('>')` would cut the tag in half and corrupt the file
 * during repack. Cheap insurance for a linear scan.
 */
function findTagEnd(source: string, from: number): number {
  let quote = 0;
  for (let i = from + 1; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (quote !== 0) {
      if (c === quote) quote = 0;
      continue;
    }
    if (c === 34 || c === 39) {
      quote = c;
      continue;
    }
    if (c === 62) return i; // '>'
  }
  return -1;
}

function advancePast(source: string, from: number, marker: string): number {
  const at = source.indexOf(marker, from);
  return at === -1 ? source.length : at + marker.length;
}

function readName(source: string, from: number, limit: number): string {
  let i = from;
  while (i < limit) {
    const c = source.charCodeAt(i);
    // Name ends at whitespace, at `/` of a self-closing tag, or at `>`.
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 47 || c === 62) break;
    i++;
  }
  return source.slice(from, i);
}

// ─── Navigation ──────────────────────────────────────────────────────────────

/**
 * One element, located in the source.
 *
 * `inner` is what sits between the tags; `outer` includes them. Both are needed and
 * they are not interchangeable: replacing a paragraph's text is an inner edit,
 * deleting the paragraph is an outer one.
 */
export interface ElementRange {
  name: string;
  /** Index into `part.tokens` of the opening (or self-closing) token. */
  openIndex: number;
  /** Index of the closing token; equals `openIndex` when self-closing. */
  closeIndex: number;
  /** Start of `<name`. */
  outerStart: number;
  /** End of `</name>` (exclusive). */
  outerEnd: number;
  /**
   * Start of the content. Equals `outerEnd` when self-closing.
   *
   * ⚠️ **Check `selfClosing` before inserting here.** For `<w:p/>` this offset is *past* the
   * `/>`, so an insertion "at the start of the content" actually lands after the element —
   * `<w:p/><w:pPr>…</w:pPr>` instead of `<w:p><w:pPr>…</w:pPr></w:p>`. That output still
   * tokenises and still balances, so no structural check catches it; Word rejects it as
   * unreadable content. Expand the tag with `replaceElement` instead. `appendChild` refuses
   * outright for the same reason.
   */
  innerStart: number;
  /** End of the content (exclusive). Equals `innerStart` when self-closing. */
  innerEnd: number;
  depth: number;
  selfClosing: boolean;
}

/**
 * Every element with this qualified name, in document order.
 *
 * ⚠️ Matching is on the literal qualified name (`w:p`, not `p`). OOXML pins its
 * prefixes in the spec and every producer follows, so resolving namespaces would be
 * ceremony with no payoff — but it does mean a caller must pass the prefix.
 *
 * `within` restricts the search to one element's content, which is how a paragraph
 * scope is expressed: find the `w:p`, then find `w:r` within it.
 */
export function elements(
  part: XmlPart,
  name: string,
  within?: ElementRange,
): ElementRange[] {
  const from = within ? within.openIndex + 1 : 0;
  const to = within ? within.closeIndex : part.tokens.length;
  const found: ElementRange[] = [];

  for (let i = from; i < to; i++) {
    const token = part.tokens[i];
    if (token.name !== name) continue;

    if (token.kind === 'self') {
      found.push({
        name,
        openIndex: i,
        closeIndex: i,
        outerStart: token.start,
        outerEnd: token.end,
        innerStart: token.end,
        innerEnd: token.end,
        depth: token.depth,
        selfClosing: true,
      });
      continue;
    }

    if (token.kind !== 'open') continue;

    const closeIndex = findClose(part, i);
    const close = part.tokens[closeIndex];
    found.push({
      name,
      openIndex: i,
      closeIndex,
      outerStart: token.start,
      outerEnd: close.end,
      innerStart: token.end,
      innerEnd: close.start,
      depth: token.depth,
      selfClosing: false,
    });
  }

  return found;
}

/** The first element with this name, or null. */
export function element(
  part: XmlPart,
  name: string,
  within?: ElementRange,
): ElementRange | null {
  const from = within ? within.openIndex + 1 : 0;
  const to = within ? within.closeIndex : part.tokens.length;

  for (let i = from; i < to; i++) {
    const token = part.tokens[i];
    if (token.name !== name) continue;
    if (token.kind !== 'open' && token.kind !== 'self') continue;
    return elementAt(part, i);
  }
  return null;
}

/** Build a range from a token index known to be an `open` or `self` token. */
export function elementAt(part: XmlPart, index: number): ElementRange {
  const token = part.tokens[index];
  if (token.kind === 'self') {
    return {
      name: token.name,
      openIndex: index,
      closeIndex: index,
      outerStart: token.start,
      outerEnd: token.end,
      innerStart: token.end,
      innerEnd: token.end,
      depth: token.depth,
      selfClosing: true,
    };
  }
  if (token.kind !== 'open') {
    throw new XmlError(`Token ${index} is a ${token.kind}, not an element start`);
  }
  const closeIndex = findClose(part, index);
  return {
    name: token.name,
    openIndex: index,
    closeIndex,
    outerStart: token.start,
    outerEnd: part.tokens[closeIndex].end,
    innerStart: token.end,
    innerEnd: part.tokens[closeIndex].start,
    depth: token.depth,
    selfClosing: false,
  };
}

/**
 * Index of the token closing the element opened at `openIndex`.
 *
 * Matches by depth rather than by counting names, so nested elements of the same name
 * — `w:tbl` inside `w:tbl`, which real documents contain — resolve correctly.
 */
function findClose(part: XmlPart, openIndex: number): number {
  const open = part.tokens[openIndex];
  for (let i = openIndex + 1; i < part.tokens.length; i++) {
    const token = part.tokens[i];
    if (token.kind === 'close' && token.depth === open.depth && token.name === open.name) {
      return i;
    }
  }
  throw new XmlError(`<${open.name}> at offset ${open.start} is never closed`);
}

/** Direct children of an element, optionally filtered by name. */
export function childElements(
  part: XmlPart,
  parent: ElementRange,
  name?: string,
): ElementRange[] {
  const found: ElementRange[] = [];
  const wanted = parent.depth + 1;

  for (let i = parent.openIndex + 1; i < parent.closeIndex; i++) {
    const token = part.tokens[i];
    if (token.kind !== 'open' && token.kind !== 'self') continue;
    if (token.depth !== wanted) continue;
    if (name && token.name !== name) continue;
    found.push(elementAt(part, i));
  }

  return found;
}

// ─── Attributes ──────────────────────────────────────────────────────────────

/**
 * Read an attribute off an element's start tag.
 *
 * Scans the tag text rather than pre-parsing every attribute of every element: the
 * documents we open have hundreds of thousands of elements and we ask about attributes
 * on a handful of them.
 */
export function attr(
  part: XmlPart,
  el: ElementRange,
  name: string,
): string | null {
  const token = part.tokens[el.openIndex];
  const tag = part.source.slice(token.start, token.end);
  // `[\s/>]` after the name stops `w:val` from matching `w:valX`, and the value may be
  // single- or double-quoted (Word uses double, other producers do not always).
  const match = new RegExp(
    `[\\s]${escapeRegex(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`,
  ).exec(tag);
  if (!match) return null;
  return unescapeXml(match[2] ?? match[3] ?? '');
}

/** All text content under an element, unescaped and concatenated. */
export function textOf(part: XmlPart, el: ElementRange): string {
  let out = '';
  for (let i = el.openIndex + 1; i < el.closeIndex; i++) {
    const token = part.tokens[i];
    if (token.kind === 'text') out += part.source.slice(token.start, token.end);
  }
  return unescapeXml(out);
}

// ─── Editing ─────────────────────────────────────────────────────────────────

/** A replacement of `[start, end)` with `text`. An insertion has `start === end`. */
export interface Edit {
  start: number;
  end: number;
  text: string;
  /** For error messages when two edits collide. */
  label?: string;
}

/**
 * Apply edits to the source, right to left.
 *
 * Right to left so earlier offsets stay valid as we go — the alternative is tracking a
 * running delta, which is the same thing with more chances to be wrong.
 *
 * ⚠️ Overlapping edits are refused, not merged. Two ops that touch the same run mean
 * the caller's model of the document disagreed with itself; applying both in some
 * order would produce a file that matches neither intent, and the user would only find
 * out when Word refused to open it.
 */
export function applyEdits(source: string, edits: Edit[]): string {
  if (edits.length === 0) return source;

  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    // Touching is fine (`end === start`); overlapping is not. Two pure insertions at
    // the same offset are also fine — they append in the order given.
    if (current.start < previous.end) {
      throw new XmlError(
        `Two changes overlap in the same part (${previous.label ?? 'edit'} and ` +
          `${current.label ?? 'edit'}). Apply them in separate calls.`,
      );
    }
  }

  let out = source;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const edit = sorted[i];
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

/** Replace an element and everything in it. */
export function replaceElement(el: ElementRange, xml: string, label?: string): Edit {
  return { start: el.outerStart, end: el.outerEnd, text: xml, label };
}

/** Remove an element and everything in it. */
export function removeElement(el: ElementRange, label?: string): Edit {
  return { start: el.outerStart, end: el.outerEnd, text: '', label };
}

/** Insert XML immediately after an element's closing tag. */
export function insertAfter(el: ElementRange, xml: string, label?: string): Edit {
  return { start: el.outerEnd, end: el.outerEnd, text: xml, label };
}

/** Insert XML immediately before an element's opening tag. */
export function insertBefore(el: ElementRange, xml: string, label?: string): Edit {
  return { start: el.outerStart, end: el.outerStart, text: xml, label };
}

/** Insert XML as the last child of an element. Refuses a self-closing parent. */
export function appendChild(el: ElementRange, xml: string, label?: string): Edit {
  if (el.selfClosing) {
    throw new XmlError(
      `<${el.name}/> is self-closing; expand it before appending a child`,
    );
  }
  return { start: el.innerEnd, end: el.innerEnd, text: xml, label };
}

// ─── Escaping ────────────────────────────────────────────────────────────────

/**
 * Escape text for XML character data or an attribute value.
 *
 * All five predefined entities, always — `'` and `"` matter in attributes and cost
 * nothing in content. Control characters are stripped rather than escaped: XML 1.0
 * forbids most of them outright, and a stray one from a model-generated string would
 * make the part unparseable for Word (which reports it as "the file is corrupt").
 */
export function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Reverse of `escapeXml`, plus numeric references.
 *
 * `&amp;` is unescaped last so `&amp;lt;` comes back as the literal text `&lt;` rather
 * than as `<`. Getting that order wrong is how a document containing escaped markup
 * turns into a document containing markup.
 */
export function unescapeXml(text: string): string {
  if (text.indexOf('&') === -1) return text;
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
