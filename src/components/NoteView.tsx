import { useState } from 'react';
import { buildNoteText, formatDateTime } from '../lib/note';
import { formatMoney } from '../lib/money';
import { retryNote, requestSync } from '../lib/sync';
import type { DeliveryNote } from '../lib/types';
import { CheckIcon, CloudIcon, CloudOffIcon } from './Icons';
import { Button, StatusPill } from './ui';

interface Props {
  note: DeliveryNote;
  currency: string;
  onBack?: () => void;
  backLabel?: string;
  onNew?: () => void;
}

export function NoteView({ note, currency, onBack, backLabel = 'Back', onNew }: Props) {
  const [copyMsg, setCopyMsg] = useState('');
  const money = (n: number) => formatMoney(n, currency);
  const inv = note.invoice;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildNoteText(note, currency));
      setCopyMsg('Copied to clipboard');
    } catch {
      setCopyMsg("Couldn't copy - use Print / Save PDF instead");
    }
    setTimeout(() => setCopyMsg(''), 2500);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="sync-banner"
        role="status"
        className={`flex items-start gap-3 rounded-2xl border p-3 text-sm ${
          note.status === 'synced'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : note.status === 'failed'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}
      >
        <span className="mt-0.5">{note.status === 'synced' ? <CheckIcon /> : note.status === 'failed' ? <CloudOffIcon /> : <CloudIcon />}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 font-semibold">
            Saved on this device <StatusPill status={note.status} />
          </div>
          <p className="mt-0.5">
            {note.status === 'synced' && `Sent to the server ${note.syncedAt ? formatDateTime(note.syncedAt) : ''}.`}
            {note.status === 'pending' && (note.lastError ?? 'Waiting to sync. This happens automatically when a connection is available.')}
            {note.status === 'failed' && (note.lastError ?? 'The server rejected this note.')}
          </p>
        </div>
        {note.status === 'failed' && (
          <Button className="min-h-9 px-3 py-1 text-xs" onClick={() => void retryNote(note.id)}>
            Retry
          </Button>
        )}
        {note.status === 'pending' && (
          <Button className="min-h-9 px-3 py-1 text-xs" onClick={requestSync}>
            Sync now
          </Button>
        )}
      </div>

      <article id="note-print" data-testid="note-card" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-slate-800 pb-3">
          <h2 className="text-xl font-extrabold tracking-tight">DELIVERY NOTE</h2>
          <span data-testid="note-number" className="font-mono text-sm font-semibold">
            {note.noteNumber}
          </span>
        </header>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase text-slate-500">Received</dt>
            <dd>{formatDateTime(note.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Received by</dt>
            <dd>{note.receivedBy || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Vendor</dt>
            <dd className="font-semibold">{inv.vendor || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Location</dt>
            <dd>{note.location || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Invoice #</dt>
            <dd className="font-mono">{inv.invoiceNumber || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Invoice date</dt>
            <dd>{inv.invoiceDate || '-'}</dd>
          </div>
        </dl>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
              <th className="py-1 pr-2 font-semibold">Item</th>
              <th className="px-2 py-1 text-right font-semibold">Qty</th>
              <th className="px-2 py-1 text-right font-semibold">Unit</th>
              <th className="py-1 pl-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it) => (
              <tr key={it.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-2">{it.description || 'Item'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{it.qty}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(it.unitPrice)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-3 ml-auto w-56 text-sm">
          <div className="flex justify-between py-0.5">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{money(inv.subtotal)}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt>Tax</dt>
            <dd className="tabular-nums">{money(inv.tax)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t-2 border-slate-800 pt-1 text-base font-bold">
            <dt>Total</dt>
            <dd data-testid="note-total" className="tabular-nums">
              {money(inv.total)}
            </dd>
          </div>
        </dl>

        {note.remarks.trim() && (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="font-semibold">Remarks: </span>
            {note.remarks}
          </p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-slate-500">
          <div className="border-t border-slate-400 pt-1">Received by (signature)</div>
          <div className="border-t border-slate-400 pt-1">Driver / vendor (signature)</div>
        </div>
      </article>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={copy}>Copy text</Button>
        <Button onClick={() => window.print()}>Print / Save PDF</Button>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            {backLabel}
          </Button>
        )}
        {onNew && (
          <Button variant="primary" className="ml-auto" onClick={onNew} data-testid="scan-another">
            Scan another invoice
          </Button>
        )}
      </div>
      {copyMsg && (
        <p role="status" className="text-sm text-slate-600">
          {copyMsg}
        </p>
      )}
    </div>
  );
}
