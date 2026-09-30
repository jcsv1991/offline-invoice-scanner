import { listPending, updateNote } from './db';
import { emitDataChange } from './events';
import { getSettings } from './settings';
import { createTransport, deviceIsOffline, NetworkError, ServerRejectedError } from './transports';
import type { DeliveryNote, SyncPayload } from './types';
import type { Transport } from './transports';

export interface SyncOutcome {
  attempted: number;
  synced: number;
  failed: number;
  /** True if we stopped early because the server could not be reached. */
  offline: boolean;
}

export function toPayload(note: DeliveryNote): SyncPayload {
  return {
    source: 'offline-invoice-scanner',
    version: 1,
    id: note.id,
    noteNumber: note.noteNumber,
    createdAt: note.createdAt,
    receivedBy: note.receivedBy,
    location: note.location,
    remarks: note.remarks,
    invoice: note.invoice,
  };
}

let inFlight: Promise<SyncOutcome> | null = null;
let syncing = false;
const stateListeners = new Set<() => void>();

export const isSyncing = () => syncing;
export function onSyncState(fn: () => void): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}
function setSyncing(v: boolean) {
  syncing = v;
  stateListeners.forEach((l) => l());
}

/**
 * Sends every queued note, oldest first.
 *  - network problem  -> stop, leave everything queued (we will be called again when back online)
 *  - 5xx / 429        -> keep queued, count the attempt, move on to the next note
 *  - 4xx              -> mark "failed" so a person can look at it; never auto-retried
 * Only one run happens at a time; concurrent callers share the same promise.
 */
export function syncPending(transport?: Transport): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  inFlight = run(transport ?? createTransport(getSettings(), getSettings)).finally(() => {
    inFlight = null;
    setSyncing(false);
  });
  return inFlight;
}

async function run(transport: Transport): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { attempted: 0, synced: 0, failed: 0, offline: false };
  const pending = await listPending();
  if (pending.length === 0) return outcome;

  // Fast path: don't even try when the device knows it has no connection.
  if (deviceIsOffline(getSettings())) {
    outcome.offline = true;
    return outcome;
  }

  setSyncing(true);
  for (const note of pending) {
    outcome.attempted++;
    try {
      await transport.send(toPayload(note));
      await updateNote(note.id, { status: 'synced', syncedAt: new Date().toISOString(), lastError: undefined });
      outcome.synced++;
    } catch (err) {
      if (err instanceof NetworkError) {
        await updateNote(note.id, { lastError: `Waiting for connection - ${err.message}` });
        outcome.offline = true;
        break;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      const rejected = err instanceof ServerRejectedError;
      // 4xx: a person has to look at it. 5xx / anything else: stays queued and is retried later.
      await updateNote(note.id, {
        status: rejected ? 'failed' : 'pending',
        attempts: note.attempts + 1,
        lastError: message,
      });
      outcome.failed++;
    }
  }
  emitDataChange();
  return outcome;
}

/** Puts a "failed" note back in the queue (after a person has fixed the webhook, for example). */
export async function retryNote(id: string): Promise<void> {
  await updateNote(id, { status: 'pending', lastError: undefined });
  void syncPending();
}

/**
 * Wires up the automatic triggers: app start, the browser's "online" event, the tab becoming
 * visible again, a periodic retry while something is queued, and (via requestSync) right after saving.
 */
export function startSyncRunner(intervalMs = 15000): () => void {
  const kick = () => void syncPending();
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick();
  };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(kick, intervalMs);
  kick();
  return () => {
    window.removeEventListener('online', kick);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
  };
}

export function requestSync(): void {
  void syncPending();
}
