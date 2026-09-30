import type { DeliveryNote, InvoiceData, LineItem } from './types';
import { formatMoney, round2 } from './money';
import { newId } from './id';

export function emptyInvoice(): InvoiceData {
  return { vendor: '', invoiceNumber: '', invoiceDate: '', items: [], subtotal: 0, tax: 0, total: 0 };
}

export function emptyItem(): LineItem {
  return { id: newId(), description: '', qty: 1, unitPrice: 0, amount: 0 };
}

/** DN-20260929-0007: date the note was made + a per-device running counter. */
export function formatNoteNumber(when: Date, seq: number): string {
  const y = when.getFullYear();
  const m = String(when.getMonth() + 1).padStart(2, '0');
  const d = String(when.getDate()).padStart(2, '0');
  return `DN-${y}${m}${d}-${String(seq).padStart(4, '0')}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Plain-text version of the note - what "Copy" puts on the clipboard. */
export function buildNoteText(note: DeliveryNote, currency = 'CAD'): string {
  const inv = note.invoice;
  const money = (n: number) => formatMoney(n, currency);
  const lines: string[] = [];
  lines.push(`DELIVERY NOTE ${note.noteNumber}`);
  lines.push(`Received: ${formatDateTime(note.createdAt)}`);
  if (note.receivedBy) lines.push(`Received by: ${note.receivedBy}`);
  if (note.location) lines.push(`Location: ${note.location}`);
  lines.push('');
  lines.push(`Vendor: ${inv.vendor || '-'}`);
  lines.push(`Invoice #: ${inv.invoiceNumber || '-'}`);
  lines.push(`Invoice date: ${inv.invoiceDate || '-'}`);
  lines.push('');
  lines.push('Items');
  if (inv.items.length === 0) lines.push('  (none)');
  for (const it of inv.items) {
    lines.push(`  ${it.qty} x ${it.description || 'Item'} @ ${money(it.unitPrice)} = ${money(it.amount)}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${money(inv.subtotal)}`);
  lines.push(`Tax: ${money(inv.tax)}`);
  lines.push(`TOTAL: ${money(inv.total)}`);
  if (note.remarks.trim()) {
    lines.push('');
    lines.push(`Remarks: ${note.remarks.trim()}`);
  }
  return lines.join('\n');
}

/** Recompute a line's amount from qty x unit price. */
export function withComputedAmount(item: LineItem): LineItem {
  return { ...item, amount: round2(item.qty * item.unitPrice) };
}
