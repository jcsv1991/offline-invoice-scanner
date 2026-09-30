import type { InvoiceData, LineItem } from './types';

/** Round to cents, avoiding binary-float artefacts such as 1.005 -> 1. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(n: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(round2(n));
}

export function sumItems(items: Pick<LineItem, 'amount'>[]): number {
  return round2(items.reduce((s, i) => s + (Number.isFinite(i.amount) ? i.amount : 0), 0));
}

export interface InvoiceIssue {
  field: 'items' | 'subtotal' | 'total' | 'vendor' | 'invoiceDate' | 'invoiceNumber';
  message: string;
  /** One-tap correction the person can accept instead of retyping. */
  fix?: { label: string; patch: Partial<Pick<InvoiceData, 'subtotal' | 'total'>> };
}

const TOLERANCE = 0.011;

/**
 * Cross-checks the numbers on an invoice. OCR makes small mistakes, so the point of this
 * is to tell the person WHERE to look before they confirm the note.
 */
export function validateInvoice(inv: InvoiceData): InvoiceIssue[] {
  const issues: InvoiceIssue[] = [];
  if (!inv.vendor.trim()) issues.push({ field: 'vendor', message: 'Vendor name is missing.' });
  if (!inv.invoiceNumber.trim()) issues.push({ field: 'invoiceNumber', message: 'Invoice number is missing.' });
  if (!inv.invoiceDate) issues.push({ field: 'invoiceDate', message: 'Invoice date is missing.' });
  if (inv.items.length === 0) issues.push({ field: 'items', message: 'No line items yet - add at least one.' });

  const itemsSum = sumItems(inv.items);
  if (inv.items.length > 0 && inv.subtotal > 0 && Math.abs(itemsSum - inv.subtotal) > TOLERANCE) {
    issues.push({
      field: 'subtotal',
      message: `Line items add up to ${itemsSum.toFixed(2)} but the subtotal says ${inv.subtotal.toFixed(2)}.`,
      fix: { label: `Set subtotal to ${itemsSum.toFixed(2)}`, patch: { subtotal: itemsSum } },
    });
  }
  const expectedTotal = round2((inv.subtotal || itemsSum) + inv.tax);
  if (inv.total > 0 && Math.abs(expectedTotal - inv.total) > TOLERANCE) {
    issues.push({
      field: 'total',
      message: `Subtotal + tax is ${expectedTotal.toFixed(2)} but the total says ${inv.total.toFixed(2)}.`,
      fix: { label: `Set total to ${expectedTotal.toFixed(2)}`, patch: { total: expectedTotal } },
    });
  }
  for (const it of inv.items) {
    if (it.qty > 0 && it.unitPrice > 0 && Math.abs(round2(it.qty * it.unitPrice) - it.amount) > TOLERANCE) {
      issues.push({
        field: 'items',
        message: `"${it.description || 'Item'}": ${it.qty} x ${it.unitPrice.toFixed(2)} is ${round2(it.qty * it.unitPrice).toFixed(2)}, not ${it.amount.toFixed(2)}.`,
      });
    }
  }
  return issues;
}
