/**
 * Which paragraph styles mean "heading", and at what level.
 *
 * The outline is the whole reason a document can be read at all inside a 30k-character
 * round budget, and the outline is only as good as this lookup.
 *
 * ⚠️ **Style ids are not reliable.** `Heading1` is what English Word writes, but a
 * document authored in Chinese Word carries `w:styleId="1"`, WPS writes `a3`, LaTeX
 * converters invent their own, and a template can rename anything. So the id is the
 * *last* thing consulted:
 *
 * 1. `w:pPr/w:outlineLvl` on the paragraph — the most direct statement of intent, and
 *    the one Word's own navigation pane uses.
 * 2. The style's `w:name`, which is localised but follows a pattern (`heading 1`,
 *    `标题 1`, `Überschrift 1`).
 * 3. The style's own `outlineLvl`.
 * 4. The id, matched loosely.
 *
 * Getting this wrong is not cosmetic: a thesis whose headings are not recognised
 * projects as 300 undifferentiated paragraphs, and the agent has nothing to navigate by.
 */

import {
  type ElementRange,
  type XmlPart,
  attr,
  element,
  elements,
  tokenize,
} from '../ooxml/xml-cursor';

export interface StyleInfo {
  id: string;
  /** As written in `w:name`, lowercased. */
  name: string;
  /** 1–9 when this style is a heading, otherwise null. */
  headingLevel: number | null;
}

export type StyleMap = Map<string, StyleInfo>;

/** Heading names across the locales that actually appear in the wild. */
const HEADING_NAME = /^(?:heading|标题|標題|überschrift|titre|título|заголовок|見出し|제목)\s*([1-9])/i;

/**
 * Build the style lookup from `word/styles.xml`.
 *
 * A missing or unreadable styles part is not fatal — headings can still be detected
 * from `outlineLvl` on the paragraphs themselves, and a document with no styles at all
 * is a document with no headings, which the outline handles by falling back to leading
 * paragraphs.
 */
export function readStyles(stylesXml: string | null): StyleMap {
  const map: StyleMap = new Map();
  if (!stylesXml) return map;

  let part: XmlPart;
  try {
    part = tokenize(stylesXml);
  } catch {
    return map;
  }

  for (const style of elements(part, 'w:style')) {
    const id = attr(part, style, 'w:styleId');
    if (!id) continue;

    const nameEl = element(part, 'w:name', style);
    const name = (nameEl ? attr(part, nameEl, 'w:val') ?? '' : '').toLowerCase();

    map.set(id, {
      id,
      name,
      headingLevel: levelFromName(name) ?? levelFromOutline(part, style) ?? levelFromId(id),
    });
  }

  return map;
}

function levelFromName(name: string): number | null {
  const match = HEADING_NAME.exec(name);
  return match ? Number(match[1]) : null;
}

/** `<w:outlineLvl w:val="0"/>` inside the style means level 1. */
function levelFromOutline(part: XmlPart, style: ElementRange): number | null {
  const el = element(part, 'w:outlineLvl', style);
  if (!el) return null;
  const value = Number(attr(part, el, 'w:val'));
  return Number.isInteger(value) && value >= 0 && value <= 8 ? value + 1 : null;
}

/**
 * Last resort: the id itself.
 *
 * `Heading2`, `heading-2`, and the bare `2` that localised Word writes. The bare digit
 * is accepted only because it is what a large share of real Chinese documents use; it
 * is checked last precisely because `2` is also a plausible id for something else.
 */
function levelFromId(id: string): number | null {
  const named = /^heading[-_ ]?([1-9])$/i.exec(id);
  if (named) return Number(named[1]);
  const bare = /^([1-9])$/.exec(id);
  return bare ? Number(bare[1]) : null;
}

/**
 * The heading level of one paragraph, or null when it is body text.
 *
 * `pPr` is read from the paragraph directly so a paragraph that overrides its style's
 * outline level wins — that override is how someone demotes a single heading without
 * making a new style, and it is common in documents that have been through review.
 */
export function headingLevelOf(
  part: XmlPart,
  paragraphPPr: ElementRange | null,
  styles: StyleMap,
): number | null {
  if (!paragraphPPr) return null;

  const outline = element(part, 'w:outlineLvl', paragraphPPr);
  if (outline) {
    const value = Number(attr(part, outline, 'w:val'));
    // `9` is Word's "body text" sentinel; anything outside 0–8 is not a heading.
    if (Number.isInteger(value) && value >= 0 && value <= 8) return value + 1;
    return null;
  }

  const pStyle = element(part, 'w:pStyle', paragraphPPr);
  if (!pStyle) return null;
  const id = attr(part, pStyle, 'w:val');
  if (!id) return null;

  return styles.get(id)?.headingLevel ?? null;
}

/** The style id on a paragraph, for reporting and for style-based edits later. */
export function styleIdOf(
  part: XmlPart,
  paragraphPPr: ElementRange | null,
): string | null {
  if (!paragraphPPr) return null;
  const pStyle = element(part, 'w:pStyle', paragraphPPr);
  return pStyle ? attr(part, pStyle, 'w:val') : null;
}
