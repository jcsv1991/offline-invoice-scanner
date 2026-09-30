import { describe, expect, it } from 'vitest';
import { cleanLine, fixNumericToken, looksLikeTitleWord, parseInvoiceText } from '../src/lib/parse';

const items = (t: string) => parseInvoiceText(t).invoice.items.map(({ id: _id, ...rest }) => rest);

describe('OCR clean-up helpers', () => {
  it('repairs classic confusions only inside numeric tokens', () => {
    expect(fixNumericToken('S12.50')).toBe('12.50');
    expect(fixNumericToken('$12.50')).toBe('12.50');
    expect(fixNumericToken('1O.50')).toBe('10.50');
    expect(fixNumericToken('l2.OO')).toBe('12.00');
    expect(fixNumericToken('12,50')).toBe('12.50');
    // real words must be left alone
    expect(fixNumericToken('Oil')).toBe('Oil');
    expect(fixNumericToken('Solo')).toBe('Solo');
    expect(fixNumericToken('1,250.00')).toBe('1,250.00');
  });

  it('collapses whitespace and drops table-border noise', () => {
    expect(cleanLine('  Flour   |  6 |   28.50 ')).toBe('Flour 6 28.50');
  });

  it('recognises a mangled INVOICE title but not ordinary words', () => {
    for (const t of ['INVOICE', '[NVOICE', 'lNVOICE', 'INV0ICE', 'Invoice', 'RECEIPT']) expect(looksLikeTitleWord(t)).toBe(true);
    for (const t of ['Voice', 'Wholesale', 'Ltd.', 'Bakery', 'Inventory']) expect(looksLikeTitleWord(t)).toBe(false);
  });
});

describe('vendor', () => {
  it('takes the first sensible line', () => {
    expect(parseInvoiceText('Harvest Lane Wholesale Ltd.\n4820 Granville Avenue\nInvoice No: 123').invoice.vendor).toBe('Harvest Lane Wholesale Ltd.');
  });
  it('splits a name from a title on the same line (wide gap or pipe)', () => {
    expect(parseInvoiceText('Coastal Fresh Produce Co.        INVOICE\nInvoice # 7783').invoice.vendor).toBe('Coastal Fresh Produce Co.');
    expect(parseInvoiceText('Harvest Lane Wholesale Ltd. |[NVOICE\nx').invoice.vendor).toBe('Harvest Lane Wholesale Ltd.');
  });
  it('skips a bare title line', () => {
    expect(parseInvoiceText('TAX INVOICE\nBluebird Supplies Inc.\n').invoice.vendor).toBe('Bluebird Supplies Inc.');
  });
});

describe('invoice number', () => {
  it.each([
    ['Invoice No: HL-20418', 'HL-20418'],
    ['Invoice No: ~~ HL-20418', 'HL-20418'],
    ['INVOICE #55231', '55231'],
    ['Invoice # CF-7783', 'CF-7783'],
    ['Invoice Number 88-2210', '88-2210'],
    ['INV-1042', 'INV-1042'], // the token is itself the number
    ['Order 1042', ''], // a bare number with no invoice label is not trusted
    ['Ref No. 99123', '99123'],
  ])('%s -> %s', (line, expected) => {
    expect(parseInvoiceText(`Some Vendor Ltd\n${line}\n`).invoice.invoiceNumber).toBe(expected);
  });
  it('does not mistake the invoice date for the number', () => {
    expect(parseInvoiceText('Vendor Ltd\nInvoice Date: 2026-09-24\n').invoice.invoiceNumber).toBe('');
  });
});

describe('dates', () => {
  const d = (line: string) => {
    const r = parseInvoiceText(`Vendor Ltd\n${line}\n`);
    return [r.invoice.invoiceDate, r.dateAmbiguous] as const;
  };
  it('ISO', () => expect(d('Invoice Date: 2026-09-24')).toEqual(['2026-09-24', false]));
  it('month names', () => {
    expect(d('Date: Sep 27, 2026')).toEqual(['2026-09-27', false]);
    expect(d('Date: September 5, 2026')).toEqual(['2026-09-05', false]);
    expect(d('Date: 5 Sep 2026')).toEqual(['2026-09-05', false]);
    expect(d('Date: 1st October 2026')).toEqual(['2026-10-01', false]);
  });
  it('resolves DD/MM vs MM/DD when one side is > 12', () => {
    expect(d('Date: 25/09/2026')).toEqual(['2026-09-25', false]);
    expect(d('Date: 09/25/2026')).toEqual(['2026-09-25', false]);
  });
  it('flags a genuinely ambiguous date instead of silently guessing', () => {
    expect(d('Date: 03/04/2026')).toEqual(['2026-03-04', true]);
    expect(d('Date: 05/05/2026')).toEqual(['2026-05-05', false]);
  });
  it('prefers the invoice date over the due date', () => {
    expect(d('Due: 2026-10-24\nInvoice Date: 2026-09-24')[0]).toBe('2026-09-24');
  });
  it('rejects impossible dates', () => expect(d('Date: 2026-13-45')[0]).toBe(''));
});

describe('line items', () => {
  it('desc qty unit amount', () => {
    expect(items('Vendor\nDESCRIPTION QTY UNIT PRICE AMOUNT\nAll-purpose flour 20kg   6   28.50   171.00\nSubtotal 171.00')).toEqual([
      { description: 'All-purpose flour 20kg', qty: 6, unitPrice: 28.5, amount: 171 },
    ]);
  });
  it('qty desc unit amount', () => {
    expect(items('Vendor\nQTY ITEM PRICE TOTAL\n12   Romaine lettuce (case)   18.00   216.00\nTotal 216.00')).toEqual([
      { description: 'Romaine lettuce (case)', qty: 12, unitPrice: 18, amount: 216 },
    ]);
  });
  it('desc qty amount derives the unit price', () => {
    expect(items('Vendor\nItem Qty Total\nEggs 10 45.00\nTotal 45.00')[0]).toMatchObject({ description: 'Eggs', qty: 10, unitPrice: 4.5, amount: 45 });
  });
  it('desc + amount only -> qty 1', () => {
    expect(items('Vendor\nDescription Amount\nDelivery fee   15.00\nTotal 15.00')[0]).toMatchObject({ description: 'Delivery fee', qty: 1, amount: 15 });
  });
  it('understands thousands separators and $ signs', () => {
    expect(items('Vendor\nDescription Qty Price Amount\nCommercial oven 1 $1,250.00 $1,250.00\nTotal $1,250.00')[0]).toMatchObject({ qty: 1, unitPrice: 1250, amount: 1250 });
  });
  it('survives OCR noise in numbers', () => {
    expect(items('Vendor\nDescription Qty Price Amount\nSea salt 2 l2.4O 24.8O\nTotal 24.80')[0]).toMatchObject({ qty: 2, unitPrice: 12.4, amount: 24.8 });
  });
  it('repairs "Ib" for "lb" after a number', () => {
    expect(items('Vendor\nDescription Qty Price Amount\nYellow onions 50Ib 3 32.00 96.00\nTotal 96.00')[0].description).toBe('Yellow onions 50lb');
  });
  it('ignores address, phone and meta lines even without a table header', () => {
    const r = items('Acme Foods Ltd\n4820 Granville Avenue\nTel (604) 555-0142\nInvoice Date: 2026-09-24\nWidgets 2 5.00 10.00\nTotal 10.00');
    expect(r).toHaveLength(1);
    expect(r[0].description).toBe('Widgets');
  });
  it('does not treat totals, tax or balance lines as items', () => {
    const r = items('Vendor\nDescription Qty Price Amount\nWidget 1 5.00 5.00\nSubtotal 5.00\nGST 0.25\nTotal 5.25\nBalance Due 5.25');
    expect(r).toHaveLength(1);
  });
});

describe('totals', () => {
  it('reads subtotal, tax and total', () => {
    const { invoice } = parseInvoiceText('Vendor\nDescription Qty Price Amount\nWidget 1 10.00 10.00\nSubtotal 10.00\nGST (5%) 0.50\nTotal 10.50');
    expect(invoice).toMatchObject({ subtotal: 10, tax: 0.5, total: 10.5 });
  });
  it('adds several tax lines together', () => {
    const { invoice } = parseInvoiceText('Vendor\nWidget 1 100.00 100.00\nSubtotal 100.00\nGST 5.00\nPST 7.00\nTotal 112.00');
    expect(invoice.tax).toBe(12);
  });
  it('accepts "Amount Due" / "Balance Due" / "Grand Total" as the total', () => {
    for (const label of ['Amount Due', 'Balance Due', 'Grand Total', 'TOTAL DUE']) {
      expect(parseInvoiceText(`Vendor\nWidget 1 10.00 10.00\n${label} 10.00`).invoice.total).toBe(10);
    }
  });
  it('the "Total" column header is not a total', () => {
    expect(parseInvoiceText('Vendor\nQTY ITEM PRICE TOTAL\nWidget 1 10.00 10.00').invoice.total).toBe(10);
  });
  it('fills gaps: subtotal from items, total from subtotal + tax', () => {
    const { invoice } = parseInvoiceText('Vendor\nDescription Qty Price Amount\nWidget 2 10.00 20.00\nGadget 1 5.00 5.00\nGST 1.25');
    expect(invoice).toMatchObject({ subtotal: 25, tax: 1.25, total: 26.25 });
  });
  it('derives subtotal from total - tax when the subtotal line is missing', () => {
    expect(parseInvoiceText('Vendor\nWidget 1 10.00 10.00\nGST 0.50\nTotal 10.50').invoice.subtotal).toBe(10);
  });
});

describe('degenerate input', () => {
  it('never throws on empty or junk text', () => {
    for (const t of ['', '   \n \n', '@@@ ### $$$', '12345', 'a'.repeat(5000)]) {
      const { invoice } = parseInvoiceText(t);
      expect(invoice.items).toEqual([]);
      expect(invoice.total).toBe(0);
    }
  });
});
