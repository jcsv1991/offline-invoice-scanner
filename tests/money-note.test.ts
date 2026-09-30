import { describe, expect, it } from 'vitest';
import { formatMoney, round2, sumItems, validateInvoice } from '../src/lib/money';
import { buildNoteText, formatNoteNumber } from '../src/lib/note';
import type { DeliveryNote, InvoiceData } from '../src/lib/types';

const inv = (over: Partial<InvoiceData> = {}): InvoiceData => ({
  vendor: 'Harvest Lane Wholesale Ltd.',
  invoiceNumber: 'HL-20418',
  invoiceDate: '2026-09-24',
  items: [
    { id: 'a', description: 'Flour', qty: 6, unitPrice: 28.5, amount: 171 },
    { id: 'b', description: 'Butter', qty: 4, unitPrice: 46.75, amount: 187 },
  ],
  subtotal: 358,
  tax: 17.9,
  total: 375.9,
  ...over,
});

describe('money', () => {
  it('rounds to cents without float artefacts', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(NaN)).toBe(0);
  });
  it('sums items', () => expect(sumItems(inv().items)).toBe(358));
  it('formats currency', () => expect(formatMoney(1234.5, 'CAD')).toMatch(/1,234\.50/));
});

describe('validateInvoice', () => {
  it('passes a consistent invoice', () => expect(validateInvoice(inv())).toEqual([]));

  it('flags line items that do not add up to the subtotal, and offers a one-tap fix', () => {
    const issues = validateInvoice(inv({ subtotal: 400, total: 417.9 }));
    const sub = issues.find((i) => i.field === 'subtotal');
    expect(sub?.message).toMatch(/358\.00/);
    expect(sub?.fix?.patch).toEqual({ subtotal: 358 });
  });

  it('flags subtotal + tax != total', () => {
    const t = validateInvoice(inv({ total: 999 })).find((i) => i.field === 'total');
    expect(t?.fix?.patch).toEqual({ total: 375.9 });
  });

  it('flags qty x unit price != amount on a line', () => {
    const bad = inv({ items: [{ id: 'a', description: 'Flour', qty: 6, unitPrice: 28.5, amount: 170 }], subtotal: 170, total: 187 });
    expect(validateInvoice(bad).some((i) => i.field === 'items' && /Flour/.test(i.message))).toBe(true);
  });

  it('reports missing fields', () => {
    const fields = validateInvoice(inv({ vendor: '', invoiceNumber: '', invoiceDate: '', items: [] })).map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(['vendor', 'invoiceNumber', 'invoiceDate', 'items']));
  });

  it('tolerates a one-cent rounding difference', () => {
    expect(validateInvoice(inv({ tax: 17.91 }))).toEqual([]);
  });
});

describe('note', () => {
  it('formats the note number from the date and a per-device counter', () => {
    expect(formatNoteNumber(new Date(2026, 8, 29, 14, 5), 7)).toBe('DN-20260929-0007');
    expect(formatNoteNumber(new Date(2026, 0, 2), 12345)).toBe('DN-20260102-12345');
  });

  it('renders a readable plain-text note', () => {
    const note: DeliveryNote = {
      id: 'x',
      noteNumber: 'DN-20260929-0001',
      createdAt: new Date(2026, 8, 29, 14, 32).toISOString(),
      receivedBy: 'Alex',
      location: 'Downtown',
      remarks: 'One bag torn',
      invoice: inv(),
      status: 'pending',
      attempts: 0,
    };
    const text = buildNoteText(note, 'CAD');
    expect(text).toContain('DELIVERY NOTE DN-20260929-0001');
    expect(text).toContain('Received: 2026-09-29 14:32');
    expect(text).toContain('Received by: Alex');
    expect(text).toContain('Vendor: Harvest Lane Wholesale Ltd.');
    expect(text).toContain('Invoice #: HL-20418');
    expect(text).toMatch(/6 x Flour @ \$28\.50 = \$171\.00/);
    expect(text).toMatch(/TOTAL: \$375\.90/);
    expect(text).toContain('Remarks: One bag torn');
  });
});
