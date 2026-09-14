import { PDFDocument, PDFName, PDFHexString, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';
import type { FormatHandler } from '../registry';
import { DocumentError, type DocOp } from '../types';
import { pages, withPdf, pageText } from './read';

function str(op: DocOp, key: string): string {
  if (typeof op[key] !== 'string' || !(op[key] as string).trim()) throw new DocumentError(`${op.op}: ${key} must be non-empty text.`);
  return op[key] as string;
}
function number(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new DocumentError('Expected a finite number.');
  return value;
}
export async function verify(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  if (!pdf.getPageCount()) throw new DocumentError('A PDF must retain at least one page.');
}
export const edit: NonNullable<FormatHandler['edit']> = async (doc, request, context) => {
  const pdf = await PDFDocument.load(doc.bytes, { updateMetadata: false });
  if (pdf.isEncrypted) throw new DocumentError('Unlock the encrypted PDF before editing.');
  const form = pdf.getForm();
  if (form.hasXFA()) throw new DocumentError('XFA forms are not supported; use an AcroForm PDF.');
  if (form.getFields().some(field => field instanceof PDFSignature)) throw new DocumentError('Signed/signature-field PDFs must be edited in a PDF signing application.');
  const applied: string[] = [];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const characters = new Set(font.getCharacterSet());
  const checkText = (text: string) => {
    if ([...text].some(char => !characters.has(char.codePointAt(0)!))) {
      throw new DocumentError('Text contains characters unavailable in Helvetica/WinAnsi. Use Unicode comments instead, or fill this field in a PDF editor.');
    }
  };
  let structural = false;
  for (const op of request.ops) {
    const beforeCount = pdf.getPageCount();
    const selection = () => pages(op.pages ?? String(op.page ?? ''), pdf.getPageCount());
    if (['delete_pages', 'extract_pages', 'merge'].includes(op.op)) {
      // Page copying does not preserve AcroForm field trees. Refuse that lossy path.
      if (form.getFields().length) throw new DocumentError('Page removal/copy/merge on a PDF with form fields is unsupported.');
      if (op.op === 'merge') {
        if (!context) throw new DocumentError('Merge requires workspace access.');
        const source = await context.loadSource(str(op, 'source'));
        if (!/\.pdf$/i.test(source.path)) throw new DocumentError('Merge source must be a PDF.');
        const incoming = await PDFDocument.load(source.bytes, { updateMetadata: false });
        if (incoming.isEncrypted || incoming.getForm().hasXFA() || incoming.getForm().getFields().length) throw new DocumentError('Merge source must be unencrypted and have no form fields.');
        const selected = op.pages === undefined ? incoming.getPageIndices().map(i => i + 1) : pages(op.pages, incoming.getPageCount());
        const copied = await pdf.copyPages(incoming, selected.map(n => n - 1));
        copied.forEach(page => pdf.addPage(page));
        applied.push(`merge: appended ${selected.length} pages from ${source.path} (${beforeCount} → ${pdf.getPageCount()} pages)`);
      } else {
        const selected = selection();
        const remove = op.op === 'delete_pages' ? selected : pdf.getPageIndices().map(i => i + 1).filter(n => !selected.includes(n));
        if (remove.length >= beforeCount) throw new DocumentError('Cannot remove every page.');
        for (const n of remove.sort((a, b) => b - a)) pdf.removePage(n - 1);
        // Outline destinations may refer to removed pages; discard stale navigation explicitly.
        pdf.catalog.delete(PDFName.of('Outlines'));
        pdf.catalog.delete(PDFName.of('PageLabels'));
        applied.push(`${op.op}: ${beforeCount} → ${pdf.getPageCount()} pages; removed old bookmarks/page labels`);
      }
      structural = true;
    } else if (op.op === 'fill_form') {
      const field = form.getField(str(op, 'name'));
      if (field.isReadOnly()) throw new DocumentError('Cannot fill a read-only field.');
      const before = field instanceof PDFTextField ? field.getText() : field instanceof PDFCheckBox ? field.isChecked() : field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup ? field.getSelected() : undefined;
      if (field instanceof PDFTextField) {
        if (typeof op.value !== 'string') throw new DocumentError('Text field value must be a string.');
        checkText(op.value); // Reject unsupported glyphs before writing any bytes.
        field.setText(op.value);
        field.updateAppearances(font);
      } else if (field instanceof PDFCheckBox) {
        if (typeof op.value !== 'boolean') throw new DocumentError('Checkbox value must be boolean.');
        op.value ? field.check() : field.uncheck();
        field.updateAppearances();
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
        const value = str(op, 'value');
        if (!field.getOptions().includes(value)) throw new DocumentError(`Unknown field option: ${value}`);
        if (field instanceof PDFRadioGroup) {
          field.select(value);
          field.updateAppearances();
        } else {
          field.getOptions().forEach(checkText);
          field.select(value);
          field.updateAppearances(font);
        }
      } else throw new DocumentError('Unsupported form field type.');
      applied.push(`fill_form ${op.name}: ${JSON.stringify(before)} → ${JSON.stringify(op.value)}`);
    } else if (['comment', 'note', 'highlight'].includes(op.op)) {
      const pageNumber = selection();
      if (pageNumber.length !== 1) throw new DocumentError('One annotation operation must select exactly one page.');
      const page = pdf.getPage(pageNumber[0] - 1);
      let quads: number[] = [];
      if (op.op === 'highlight') {
        if (structural) throw new DocumentError('Highlight before page operations, or in a separate call after reading the new pages.');
        const quote = str(op, 'text').replace(/\s+/g, '');
        quads = await withPdf(doc.bytes, async source => {
          const { items } = await pageText(source, pageNumber[0]);
          const text = items.map(item => item.str.replace(/\s+/g, '')).join('');
          const start = text.indexOf(quote);
          if (start < 0 || text.indexOf(quote, start + 1) >= 0) throw new DocumentError('Highlight text must match exactly once on the page (ignoring whitespace).');
          let offset = 0;
          const result: number[] = [];
          for (const item of items) {
            const end = offset + item.str.replace(/\s+/g, '').length;
            if (end > start && offset < start + quote.length) {
              const [a, b, c, d, x, y] = item.transform;
              const len = Math.hypot(a, b), vlen = Math.hypot(c, d);
              if (!len || !vlen || item.dir === 'ttb') throw new DocumentError('Vertical/degenerate text requires manual highlighting.');
              const ux = a / len * item.width, uy = b / len * item.width;
              const vx = c / vlen * item.height, vy = d / vlen * item.height;
              // One quad per intersecting text item: never bridge columns or lines.
              result.push(x + vx, y + vy, x + ux + vx, y + uy + vy, x, y, x + ux, y + uy);
            }
            offset = end;
          }
          return result;
        });
      }
      const x = number(op.x, page.getCropBox().x + 24), y = number(op.y, page.getCropBox().y + 24);
      const xs = quads.filter((_, i) => i % 2 === 0), ys = quads.filter((_, i) => i % 2 === 1);
      const rect = quads.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [x, y, x + 24, y + 24];
      const annotation = pdf.context.obj({ Type: 'Annot', Subtype: op.op === 'highlight' ? 'Highlight' : 'Text', Rect: rect,
        Contents: PDFHexString.fromText(op.op === 'highlight' ? String(op.comment ?? op.text) : str(op, 'text')),
        T: PDFHexString.fromText(request.author ?? 'AI (Better Sidebar)'), C: [1, 0.85, 0], F: 4,
        ...(quads.length ? { QuadPoints: quads, CA: 0.35 } : { Name: 'Comment', Open: false }),
      });
      page.node.addAnnot(pdf.context.register(annotation));
      applied.push(`${op.op} page${pageNumber[0]}: ${String(op.text).slice(0, 240)}`);
    } else if (op.op === 'rotate_pages') {
      const angle = number(op.degrees, 90);
      if (angle % 90) throw new DocumentError('Rotation must be a multiple of 90 degrees.');
      for (const n of selection()) {
        const page = pdf.getPage(n - 1), before = page.getRotation().angle;
        page.setRotation(degrees(((before + angle) % 360 + 360) % 360));
        applied.push(`rotate page${n}: ${before} → ${page.getRotation().angle} degrees`);
      }
    } else if (op.op === 'watermark' || op.op === 'page_numbers') {
      const size = number(op.size, op.op === 'watermark' ? 36 : 11);
      const opacity = number(op.opacity, op.op === 'watermark' ? 0.2 : 1);
      if (size <= 0 || size > 300 || opacity < 0 || opacity > 1) throw new DocumentError('Invalid size/opacity.');
      for (const n of selection()) {
        const page = pdf.getPage(n - 1), box = page.getCropBox();
        const text = op.op === 'watermark' ? str(op, 'text') : String(op.template ?? '{page} / {total}').replaceAll('{page}', String(n)).replaceAll('{total}', String(pdf.getPageCount()));
        checkText(text);
        page.drawText(text, { font, size, opacity, color: rgb(0.4, 0.4, 0.4),
          x: number(op.x, box.x + (box.width - font.widthOfTextAtSize(text, size)) / 2),
          y: number(op.y, box.y + (op.op === 'watermark' ? box.height / 2 : 20)),
        });
      }
      applied.push(`${op.op} pages ${String(op.pages ?? op.page)}: ${String(op.text ?? op.template ?? '{page} / {total}')}`);
    } else throw new DocumentError(`Unsupported PDF op "${op.op}". Body text editing is not supported; activate builtin-pdf-review.`);
  }
  if (!applied.length) return { bytes: doc.bytes, applied, skipped: [] };
  return { bytes: await pdf.save({ updateFieldAppearances: false }), applied, skipped: [] };
};
