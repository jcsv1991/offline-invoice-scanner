// @vitest-environment node
// End-to-end check of the REAL OCR engine (Tesseract.js + the bundled English model) on the two sample
// invoices, using the same settings the app uses in the browser. If someone changes the OCR settings or the
// parser and reading accuracy drops, this is the test that notices.
import { readFileSync } from 'node:fs';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseInvoiceText } from '../src/lib/parse';
import { validateInvoice } from '../src/lib/money';

let worker: Worker;

beforeAll(async () => {
  worker = await createWorker('eng', 1, { langPath: 'public/ocr', gzip: true, cacheMethod: 'none' });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
}, 120_000);

afterAll(async () => {
  await worker?.terminate();
});

async function read(file: string) {
  const { data } = await worker.recognize(readFileSync(file));
  const parsed = parseInvoiceText(data.text);
  return { ...parsed, confidence: data.confidence, items: parsed.invoice.items.map(({ id: _id, ...r }) => r) };
}

describe('real OCR on the sample invoices', () => {
  it('clean scan: every field is read correctly and the numbers cross-check', async () => {
    const r = await read('public/samples/invoice-01.png');
    expect(r.invoice).toMatchObject({
      vendor: 'Harvest Lane Wholesale Ltd.',
      invoiceNumber: 'HL-20418',
      invoiceDate: '2026-09-24',
      subtotal: 517,
      tax: 25.85,
      total: 542.85,
    });
    expect(r.items).toEqual([
      { description: 'All-purpose flour 20kg', qty: 6, unitPrice: 28.5, amount: 171 },
      { description: 'Unsalted butter 5kg', qty: 4, unitPrice: 46.75, amount: 187 },
      { description: 'Fine sea salt 10kg', qty: 2, unitPrice: 12.4, amount: 24.8 },
      { description: 'Dry yeast 500g', qty: 8, unitPrice: 9.95, amount: 79.6 },
      { description: 'Sesame seeds 2kg', qty: 3, unitPrice: 18.2, amount: 54.6 },
    ]);
    expect(validateInvoice(r.invoice)).toEqual([]);
    expect(r.confidence).toBeGreaterThan(80);
  }, 120_000);

  it('rotated, shadowed, noisy "phone photo": still reads everything and the numbers cross-check', async () => {
    const r = await read('e2e/fixtures/invoice-photo.jpg');
    expect(r.invoice).toMatchObject({
      vendor: 'Coastal Fresh Produce Co.',
      invoiceNumber: 'CF-7783',
      invoiceDate: '2026-09-27',
      subtotal: 567,
      tax: 28.35,
      total: 595.35,
    });
    expect(r.items).toEqual([
      { description: 'Romaine lettuce (case)', qty: 12, unitPrice: 18, amount: 216 },
      { description: 'Roma tomatoes 10lb', qty: 5, unitPrice: 21.5, amount: 107.5 },
      { description: 'Yellow onions 50lb', qty: 3, unitPrice: 32, amount: 96 },
      { description: 'Lemons (case)', qty: 10, unitPrice: 14.75, amount: 147.5 },
    ]);
    expect(validateInvoice(r.invoice)).toEqual([]);
  }, 120_000);
});
