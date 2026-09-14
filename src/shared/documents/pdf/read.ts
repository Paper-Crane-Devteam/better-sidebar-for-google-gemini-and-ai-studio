// Use the modern build, NOT `pdfjs-dist/legacy/build/pdf.mjs`. The legacy build
// inlines core-js polyfills whose `object-create` module builds a `javascript:`
// URL by string concatenation, `document.write()`s a `<script>` tag and pokes at
// `ActiveXObject("htmlfile")`. Chrome Web Store review flags that as obfuscated
// code / concealed functionality (rejection "Red Titanium", v2.10.0). Nothing in
// this extension needs those polyfills — MV3 already requires a modern Chrome.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/build/pdf.mjs';
import type { LoadedDocument } from '../storage';
import { DocumentError, type DocReadRequest, type DocProjectionResult, type DocOutlineResult } from '../types';

export function pages(range: unknown, count: number): number[] {
  if (typeof range !== 'string' || !range.trim()) throw new DocumentError('Specify pages, e.g. "1-3,5" (1-based).');
  const result: number[] = [];
  for (const part of range.split(',')) {
    const match = /^(?:page|p)?(\d+)(?:-(?:page|p)?(\d+))?$/.exec(part.trim());
    if (!match) throw new DocumentError(`Invalid page range: ${part}`);
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > count) throw new DocumentError(`Pages must be within 1-${count}.`);
    for (let page = start; page <= end; page++) if (!result.includes(page)) result.push(page);
  }
  return result;
}
export async function withPdf<T>(bytes: Uint8Array, work: (pdf: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const base = typeof browser !== 'undefined' ? browser.runtime.getURL('/pdf/') : undefined;
  if (base) GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
  const task = getDocument({ data: bytes.slice(),
    ...(base ? { cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/` } : {}),
  });
  task.onPassword = () => { void task.destroy(); };
  try { return await work(await task.promise); }
  catch (error) { throw new DocumentError(`Cannot process PDF: ${(error as Error).message}. Encrypted files must be unlocked first.`); }
  finally { await task.destroy(); }
}
export async function pageText(pdf: PDFDocumentProxy, number: number) {
  const page = await pdf.getPage(number);
  const content = await page.getTextContent();
  const items = content.items.filter((item): item is import('pdfjs-dist/types/src/display/api').TextItem => 'str' in item);
  let text = '', lastY: number | undefined;
  for (const item of items) {
    const y = item.transform[5];
    if (lastY !== undefined && Math.abs(lastY - y) > Math.max(2, item.height / 2) && !text.endsWith('\n')) text += '\n';
    text += item.str + (item.hasEOL ? '\n' : ' ');
    lastY = y;
  }
  return { text: text.trim(), items };
}
export async function outline(doc: LoadedDocument): Promise<DocOutlineResult> {
  return withPdf(doc.bytes, async pdf => {
    let chars = 0;
    for (let page = 1; page <= pdf.numPages; page++) { chars += (await pageText(pdf, page)).text.length; }
    const sections: DocOutlineResult['sections'] = [];
    const visit = async (nodes: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>, level: number) => {
      for (const node of nodes ?? []) {
        if (sections.length >= 80) return;
        const dest = typeof node.dest === 'string' ? await pdf.getDestination(node.dest) : node.dest;
        let page: number | undefined;
        if (dest?.[0] !== undefined) {
          try { page = typeof dest[0] === 'number' ? dest[0] + 1 : (await pdf.getPageIndex(dest[0])) + 1; } catch { /* External/broken bookmark. */ }
        }
        sections.push({ id: page ? `page${page}` : 'bookmark', label: node.title.slice(0, 160), level });
        await visit(node.items, level + 1);
      }
    };
    await visit(await pdf.getOutline(), 1);
    return { kind: 'outline', path: doc.path, format: 'pdf', summary: `${pdf.numPages} pages; ${chars} text characters`, sections,
      facts: ['Read pages with range="1-3"; range="annotations:1-3" for comments; range="fields" for AcroForm fields.'],
      warnings: chars / pdf.numPages < 20 ? ['Little or no text layer: likely scanned/image pages. No OCR or body-text editing.'] : ['PDF body text cannot be edited. Mixed image-only pages may have no extractable text.'] };
  });
}
export async function read(doc: LoadedDocument, request: DocReadRequest): Promise<DocProjectionResult> {
  return withPdf(doc.bytes, async pdf => {
    const cap = Math.max(500, Math.min(request.maxChars ?? 16000, 20000));
    const fieldMode = request.range?.startsWith('fields');
    const annotationMode = request.range?.startsWith('annotations');
    const offsetMatch = /@(\d+)$/.exec(request.range ?? '');
    const initialOffset = offsetMatch ? Number(offsetMatch[1]) : 0;
    if (!Number.isSafeInteger(initialOffset)) throw new DocumentError('Invalid continuation offset.');
    const range = request.range?.replace(/@\d+$/, '').replace(/^(fields|annotations):?/, '');
    const selected = pages(range || (fieldMode || annotationMode || request.mode === 'search' ? `1-${pdf.numPages}` : '1'), pdf.numPages);
    if (request.mode === 'search' && !request.query) throw new DocumentError('PDF search needs a literal query.');
    let text = '', truncated = false, nextRange: string | undefined;
    const visited: number[] = [];
    for (const [index, number] of selected.entries()) {
      visited.push(number);
      let body: string;
      if (fieldMode || annotationMode) {
        const annotations = await (await pdf.getPage(number)).getAnnotations();
        body = annotations.filter(a => fieldMode ? a.subtype === 'Widget' : a.subtype !== 'Widget').map(a => JSON.stringify({
          id: a.id, type: a.subtype, rect: a.rect, ...(fieldMode ? { name: a.fieldName, value: a.fieldValue, fieldType: a.fieldType, readOnly: a.readOnly, options: a.options } : { text: a.contentsObj?.str, author: a.titleObj?.str, quadPoints: a.quadPoints }),
        })).join('\n');
      } else {
        body = (await pageText(pdf, number)).text || '[No text layer on this page]';
        if (request.mode === 'search') body = body.split('\n').filter(line => line.toLowerCase().includes(request.query!.toLowerCase())).join('\n');
      }
      const block = `[page${number}]\n${body}\n\n`;
      const offset = index === 0 ? initialOffset : 0;
      if (offset > block.length) throw new DocumentError('Continuation is stale; re-read this page.');
      const remaining = block.slice(offset);
      if (text.length + remaining.length > cap) {
        const taken = cap - text.length;
        text += remaining.slice(0, taken);
        truncated = true;
        nextRange = `${fieldMode ? 'fields:' : annotationMode ? 'annotations:' : ''}${selected.slice(index).join(',')}@${offset + taken}`;
        break;
      }
      text += remaining;
    }
    return { kind: 'projection', path: doc.path, format: 'pdf', text, covered: `pages ${visited.join(',')}`, truncated, nextRange };
  });
}
