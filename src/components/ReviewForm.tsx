import { useMemo, useState } from 'react';
import { formatMoney, round2, validateInvoice } from '../lib/money';
import { emptyItem } from '../lib/note';
import type { InvoiceData, LineItem } from '../lib/types';
import { PlusIcon, TrashIcon } from './Icons';
import { Button, Card, Field, inputClass, NumberField } from './ui';

export interface ReviewValues {
  invoice: InvoiceData;
  receivedBy: string;
  location: string;
  remarks: string;
}

interface Props {
  initial: InvoiceData;
  thumbnail?: string;
  dateAmbiguous: boolean;
  ocrConfidence?: number;
  defaults: { receivedBy: string; location: string };
  currency: string;
  onConfirm: (v: ReviewValues) => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ReviewForm({ initial, thumbnail, dateAmbiguous, ocrConfidence, defaults, currency, onConfirm, onCancel, busy }: Props) {
  const [invoice, setInvoice] = useState<InvoiceData>(initial);
  const [receivedBy, setReceivedBy] = useState(defaults.receivedBy);
  const [location, setLocation] = useState(defaults.location);
  const [remarks, setRemarks] = useState('');

  const issues = useMemo(() => validateInvoice(invoice), [invoice]);
  const set = <K extends keyof InvoiceData>(k: K, v: InvoiceData[K]) => setInvoice((i) => ({ ...i, [k]: v }));

  const setItem = (id: string, patch: Partial<LineItem>) =>
    setInvoice((inv) => ({
      ...inv,
      items: inv.items.map((it) => {
        if (it.id !== id) return it;
        const merged = { ...it, ...patch };
        if ('qty' in patch || 'unitPrice' in patch) merged.amount = round2(merged.qty * merged.unitPrice);
        return merged;
      }),
    }));

  const canSubmit = invoice.vendor.trim().length > 0 && invoice.items.length > 0 && !busy;
  const lowConfidence = ocrConfidence !== undefined && ocrConfidence < 70;
  const hintFor = (field: string) => issues.find((i) => i.field === field && i.fix === undefined)?.message;
  const mathIssues = issues.filter((i) => i.field === 'items' || i.field === 'subtotal' || i.field === 'total');

  return (
    <form
      data-testid="review-form"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onConfirm({ invoice, receivedBy, location, remarks });
      }}
    >
      {lowConfidence && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This one was hard to read (confidence {Math.round(ocrConfidence!)}%). Please check every field against the paper.
        </div>
      )}

      {thumbnail && (
        <details className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Show scanned paper</summary>
          <img src={thumbnail} alt="Scanned invoice" className="mx-auto mt-3 max-h-80 rounded-lg border border-slate-200" />
        </details>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-bold">Invoice details</h2>
        <Field label="Vendor" htmlFor="vendor" hint={hintFor('vendor')}>
          <input id="vendor" data-testid="field-vendor" className={inputClass} value={invoice.vendor} onChange={(e) => set('vendor', e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Invoice #" htmlFor="invoiceNumber" hint={hintFor('invoiceNumber')}>
            <input id="invoiceNumber" data-testid="field-invoice-number" className={inputClass} value={invoice.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} />
          </Field>
          <Field
            label="Invoice date"
            htmlFor="invoiceDate"
            hint={dateAmbiguous ? 'Day/month order was guessed - please check.' : hintFor('invoiceDate')}
          >
            <input id="invoiceDate" data-testid="field-date" type="date" className={inputClass} value={invoice.invoiceDate} onChange={(e) => set('invoiceDate', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Items</h2>
          <Button variant="ghost" className="min-h-9 px-3" onClick={() => set('items', [...invoice.items, emptyItem()])} data-testid="add-item">
            <PlusIcon /> Add item
          </Button>
        </div>
        {invoice.items.length === 0 && <p className="text-sm text-slate-500">No items found. Add them by hand.</p>}
        <ul className="flex flex-col gap-3">
          {invoice.items.map((it, idx) => (
            <li key={it.id} data-testid="item-row" className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-2">
                <input
                  aria-label={`Item ${idx + 1} description`}
                  className={inputClass}
                  placeholder="Description"
                  value={it.description}
                  onChange={(e) => setItem(it.id, { description: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Remove item ${idx + 1}`}
                  className="mt-1 rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                  onClick={() => set('items', invoice.items.filter((x) => x.id !== it.id))}
                >
                  <TrashIcon />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Qty</span>
                  <NumberField id={`qty-${it.id}`} label={`Item ${idx + 1} quantity`} value={it.qty} step="any" onChange={(n) => setItem(it.id, { qty: n })} />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Unit price</span>
                  <NumberField id={`unit-${it.id}`} label={`Item ${idx + 1} unit price`} decimals={2} value={it.unitPrice} onChange={(n) => setItem(it.id, { unitPrice: n })} />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Amount</span>
                  <NumberField id={`amt-${it.id}`} label={`Item ${idx + 1} amount`} decimals={2} value={it.amount} onChange={(n) => setItem(it.id, { amount: n })} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-bold">Totals</h2>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Subtotal" htmlFor="subtotal">
            <NumberField id="subtotal" label="Subtotal" decimals={2} value={invoice.subtotal} onChange={(n) => set('subtotal', n)} />
          </Field>
          <Field label="Tax" htmlFor="tax">
            <NumberField id="tax" label="Tax" decimals={2} value={invoice.tax} onChange={(n) => set('tax', n)} />
          </Field>
          <Field label="Total" htmlFor="total">
            <NumberField id="total" label="Total" decimals={2} value={invoice.total} onChange={(n) => set('total', n)} />
          </Field>
        </div>
        <p className="text-right text-sm text-slate-600">
          Total: <strong>{formatMoney(invoice.total, currency)}</strong>
        </p>
        {mathIssues.length > 0 && (
          <ul data-testid="math-issues" className="flex flex-col gap-2" aria-label="Things to check">
            {mathIssues.map((i, n) => (
              <li key={n} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                <span className="flex-1">{i.message}</span>
                {i.fix && (
                  <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" onClick={() => setInvoice((inv) => ({ ...inv, ...i.fix!.patch }))}>
                    {i.fix.label}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-bold">Delivery</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Received by" htmlFor="receivedBy">
            <input id="receivedBy" data-testid="field-received-by" className={inputClass} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
          </Field>
          <Field label="Location" htmlFor="location">
            <input id="location" className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
        </div>
        <Field label="Remarks (optional)" htmlFor="remarks">
          <textarea id="remarks" rows={2} className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Damaged box, short one bag, left at back door…" />
        </Field>
      </Card>

      <div className="sticky bottom-20 z-10 flex gap-2 rounded-2xl bg-slate-50/90 p-2 backdrop-blur">
        <Button onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <button
          type="submit"
          data-testid="generate-note"
          disabled={!canSubmit}
          className="inline-flex min-h-11 flex-[2] items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          Generate delivery note
        </button>
      </div>
      {!canSubmit && !busy && <p className="-mt-2 text-center text-xs text-slate-500">Add a vendor and at least one item to continue.</p>}
    </form>
  );
}
