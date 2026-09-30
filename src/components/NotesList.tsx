import { deleteNote } from '../lib/db';
import { formatMoney } from '../lib/money';
import { formatDateTime } from '../lib/note';
import { requestSync } from '../lib/sync';
import { useSettings } from '../lib/settings';
import type { DeliveryNote } from '../lib/types';
import { useIsSyncing } from '../hooks/useConnectivity';
import { SpinnerIcon } from './Icons';
import { NoteView } from './NoteView';
import { Button, Card, StatusPill } from './ui';
import { useState } from 'react';

interface Props {
  notes: DeliveryNote[];
  loaded: boolean;
}

export function NotesList({ notes, loaded }: Props) {
  const settings = useSettings();
  const syncing = useIsSyncing();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = notes.find((n) => n.id === openId);

  if (open) {
    return <NoteView note={open} currency={settings.currency} onBack={() => setOpenId(null)} backLabel="Back to all notes" />;
  }

  const queued = notes.filter((n) => n.status !== 'synced').length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Delivery notes</h2>
        <Button className="min-h-9 px-3" onClick={requestSync} disabled={queued === 0 || syncing} data-testid="sync-now">
          {syncing ? <SpinnerIcon /> : null} Sync now
        </Button>
      </div>

      {loaded && notes.length === 0 && (
        <Card className="text-center text-sm text-slate-600">
          No notes yet. Scan an invoice and it will show up here, even before it reaches the server.
        </Card>
      )}

      <ul className="flex flex-col gap-2">
        {notes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              data-testid="note-row"
              onClick={() => setOpenId(n.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-teal-300"
            >
              {n.thumbnail ? (
                <img src={n.thumbnail} alt="" className="h-14 w-11 shrink-0 rounded border border-slate-200 object-cover object-top" />
              ) : (
                <div className="h-14 w-11 shrink-0 rounded border border-dashed border-slate-300" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{n.invoice.vendor || 'Unknown vendor'}</div>
                <div className="truncate font-mono text-xs text-slate-500">{n.noteNumber}</div>
                <div className="text-sm tabular-nums text-slate-700">
                  {formatMoney(n.invoice.total, settings.currency)}
                  <span className="text-xs text-slate-500"> · {formatDateTime(n.createdAt)}</span>
                </div>
              </div>
              <StatusPill status={n.status} />
            </button>
            {n.status === 'synced' && (
              <div className="mt-1 text-right">
                <button
                  type="button"
                  className="text-xs text-slate-500 underline hover:text-red-700"
                  onClick={() => void deleteNote(n.id)}
                >
                  Remove from this device
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
