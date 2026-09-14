import type { LoadedDocument } from '../storage';
import { DocumentError, type DocReadRequest, type DocProjectionResult, type DocOutlineResult } from '../types';
import { drawingPart, notesBody, notesName, openDeck, shapes, type Deck, type Slide } from './model';

function content(d: Deck, slide: Slide, includeNotes = true) {
  const list = shapes(drawingPart(d.archive.text(slide.name), 'p:sld'));
  const title = list.find(s => ['title', 'ctrTitle'].includes(s.placeholder))?.text || list.find(s => s.text)?.text || '(untitled)';
  const note = includeNotes ? notesName(d, slide) : undefined;
  const notes = note ? notesBody(drawingPart(d.archive.text(note), 'p:notes')).map(s => s.text).join('\n') : '';
  return { list, title, notes };
}
export function outline(doc: LoadedDocument): DocOutlineResult {
  const d = openDeck(doc.bytes), limit = 60;
  return { kind: 'outline', path: doc.path, format: 'pptx', summary: `${d.slides.length} slides`,
    facts: ['Read range="1-3" for text, speaker notes and shape IDs. Slide numbers follow presentation order.'],
    sections: d.slides.slice(0, limit).map((s, i) => ({ id: `slide${i + 1}`, level: 1, label: content(d, s, false).title.slice(0, 100) })),
    warnings: ['Text extraction does not render slides or read text inside images, charts or SmartArt.',
      ...(d.slides.length > limit ? [`Outline lists first ${limit} slides; read numbered ranges for the rest.`] : [])] };
}
export function read(doc: LoadedDocument, request: DocReadRequest): DocProjectionResult {
  const d = openDeck(doc.bytes);
  const match = /^(?:slide)?(\d+)(?:-(?:slide)?(\d+))?(?:@(\d+))?$/.exec(request.range || `1-${d.slides.length}`);
  if (!match) throw new DocumentError('PPTX range must be "1", "slide2", or "1-3"; pass nextRange unchanged.');
  const start = Number(match[1]), end = Number(match[2] || match[1]), offset = Number(match[3] || 0);
  if (start < 1 || end < start || end > d.slides.length) throw new DocumentError('Slide range is outside this presentation.');
  if (request.mode === 'search' && !request.query) throw new DocumentError('search requires a literal query.');
  const cap = Math.min(16000, Math.max(1, Math.floor(request.maxChars ?? 12000)));
  if (!Number.isFinite(cap)) throw new DocumentError('maxChars must be finite.');
  let text = '', nextRange: string | undefined;
  for (let i = start; i <= end; i++) {
    const c = content(d, d.slides[i - 1]);
    let block = `## slide${i}: ${c.title}\n` + c.list.map(s => `[shape ${s.id}] ${s.kind} ${s.name}${s.placeholder ? ` (${s.placeholder})` : ''}\n${s.text}`).join('\n') + `\n[notes]\n${c.notes}\n\n`;
    if (request.mode === 'search') {
      const q = request.query!.toLocaleLowerCase();
      block = block.split('\n').filter(line => line.toLocaleLowerCase().includes(q)).map(line => `[slide${i}] ${line}`).join('\n');
      if (block) block += '\n';
    }
    const consumed = i === start ? offset : 0;
    if (consumed > block.length) throw new DocumentError('Continuation offset is outside the slide projection.');
    const rest = block.slice(consumed), available = cap - text.length;
    text += rest.slice(0, available);
    if (rest.length > available) { nextRange = `${i}-${end}@${consumed + available}`; break; }
    if (text.length === cap && i < end) { nextRange = `${i + 1}-${end}`; break; }
  }
  return { kind: 'projection', path: doc.path, format: 'pptx', text, covered: `${start}-${end} of ${d.slides.length}`, truncated: !!nextRange, nextRange };
}
