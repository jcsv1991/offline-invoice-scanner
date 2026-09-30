import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetDbForTests, getNote, listNotes, listPending, nextSequence, saveNote, updateNote } from '../src/lib/db';
import { _resetSettingsForTests, saveSettings } from '../src/lib/settings';
import { retryNote, syncPending, toPayload } from '../src/lib/sync';
import {
  createDemoTransport,
  createWebhookTransport,
  deviceIsOffline,
  NetworkError,
  readDemoCloud,
  RetryableServerError,
  ServerRejectedError,
  type Transport,
} from '../src/lib/transports';
import type { DeliveryNote, SyncPayload } from '../src/lib/types';

function makeNote(id: string, minute: number, over: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id,
    noteNumber: `DN-20260929-${id}`,
    createdAt: new Date(Date.UTC(2026, 8, 29, 12, minute)).toISOString(),
    receivedBy: 'Alex',
    location: 'Downtown',
    remarks: '',
    invoice: { vendor: 'Harvest Lane', invoiceNumber: id, invoiceDate: '2026-09-24', items: [], subtotal: 10, tax: 0.5, total: 10.5 },
    status: 'pending',
    attempts: 0,
    thumbnail: 'data:image/jpeg;base64,AAAA',
    ...over,
  };
}

/** A transport that records what it was sent and can be told to fail. */
function fakeTransport(behaviour: (p: SyncPayload) => void | Promise<void> = () => {}) {
  const sent: string[] = [];
  const t: Transport = {
    async send(p) {
      sent.push(p.id);
      await behaviour(p);
    },
  };
  return { t, sent };
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  localStorage.clear();
  _resetSettingsForTests();
  setNavigatorOnline(true);
});

describe('local queue (IndexedDB)', () => {
  it('keeps notes newest-first for display and oldest-first for sending', async () => {
    await saveNote(makeNote('b', 2));
    await saveNote(makeNote('a', 1));
    await saveNote(makeNote('c', 3));
    expect((await listNotes()).map((n) => n.id)).toEqual(['c', 'b', 'a']);
    expect((await listPending()).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not list synced notes as pending', async () => {
    await saveNote(makeNote('a', 1, { status: 'synced' }));
    await saveNote(makeNote('b', 2));
    expect((await listPending()).map((n) => n.id)).toEqual(['b']);
  });

  it('hands out unique, gap-free note numbers even when requested at the same time', async () => {
    const seqs = await Promise.all([1, 2, 3, 4, 5].map(() => nextSequence()));
    expect([...seqs].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(await nextSequence()).toBe(6);
  });

  it('updateNote patches in place and ignores unknown ids', async () => {
    await saveNote(makeNote('a', 1));
    await updateNote('a', { remarks: 'hi' });
    expect((await getNote('a'))?.remarks).toBe('hi');
    expect(await updateNote('missing', { remarks: 'x' })).toBeUndefined();
  });

  it('the payload sent to the server has no local-only fields', () => {
    const p = toPayload(makeNote('a', 1));
    expect(p).not.toHaveProperty('status');
    expect(p).not.toHaveProperty('thumbnail');
    expect(p).not.toHaveProperty('attempts');
    expect(p).toMatchObject({ id: 'a', source: 'offline-invoice-scanner', version: 1 });
  });
});

describe('sync engine', () => {
  it('sends queued notes oldest-first and marks them synced', async () => {
    await saveNote(makeNote('b', 2));
    await saveNote(makeNote('a', 1));
    const { t, sent } = fakeTransport();
    const out = await syncPending(t);
    expect(sent).toEqual(['a', 'b']);
    expect(out).toEqual({ attempted: 2, synced: 2, failed: 0, offline: false });
    const notes = await listNotes();
    expect(notes.every((n) => n.status === 'synced' && n.syncedAt)).toBe(true);
  });

  it('a lost connection stops the run and leaves every remaining note queued', async () => {
    await saveNote(makeNote('a', 1));
    await saveNote(makeNote('b', 2));
    await saveNote(makeNote('c', 3));
    const { t, sent } = fakeTransport((p) => {
      if (p.id === 'b') throw new NetworkError('boom');
    });
    const out = await syncPending(t);
    expect(sent).toEqual(['a', 'b']); // never even tried c
    expect(out).toMatchObject({ synced: 1, offline: true });
    const byId = Object.fromEntries((await listNotes()).map((n) => [n.id, n]));
    expect(byId.a.status).toBe('synced');
    expect(byId.b.status).toBe('pending');
    expect(byId.b.attempts).toBe(0); // no server answer, so it is not counted as an attempt
    expect(byId.b.lastError).toMatch(/waiting for connection/i);
    expect(byId.c.status).toBe('pending');
  });

  it('nothing is lost: after the connection returns, the same notes go through', async () => {
    await saveNote(makeNote('a', 1));
    await saveNote(makeNote('b', 2));
    let up = false;
    const { t } = fakeTransport(() => {
      if (!up) throw new NetworkError('down');
    });
    expect((await syncPending(t)).offline).toBe(true);
    up = true;
    const out = await syncPending(t);
    expect(out.synced).toBe(2);
    expect((await listPending()).length).toBe(0);
  });

  it('a 5xx keeps the note queued, counts the attempt and carries on with the next one', async () => {
    await saveNote(makeNote('a', 1));
    await saveNote(makeNote('b', 2));
    const { t, sent } = fakeTransport((p) => {
      if (p.id === 'a') throw new RetryableServerError(503, 'Server error (HTTP 503)');
    });
    const out = await syncPending(t);
    expect(sent).toEqual(['a', 'b']);
    expect(out).toMatchObject({ synced: 1, failed: 1, offline: false });
    const a = await getNote('a');
    expect(a).toMatchObject({ status: 'pending', attempts: 1, lastError: 'Server error (HTTP 503)' });
  });

  it('a 4xx marks the note "failed" and it is not retried automatically', async () => {
    await saveNote(makeNote('a', 1));
    const rejecting = fakeTransport(() => {
      throw new ServerRejectedError(422, 'Server rejected the note (HTTP 422)');
    });
    await syncPending(rejecting.t);
    expect((await getNote('a'))?.status).toBe('failed');

    const second = fakeTransport();
    const out = await syncPending(second.t);
    expect(second.sent).toEqual([]); // failed notes are left for a person to look at
    expect(out.attempted).toBe(0);
  });

  it('retryNote puts a failed note back in the queue and it then syncs', async () => {
    await saveNote(makeNote('a', 1, { status: 'failed', lastError: 'nope', attempts: 1 }));
    await retryNote('a');
    expect((await getNote('a'))?.lastError).toBeUndefined();
    await syncPending(); // awaits the run retryNote started (demo transport)
    expect((await getNote('a'))?.status).toBe('synced');
  });

  it('runs one sync at a time - overlapping triggers share the same run', async () => {
    await saveNote(makeNote('a', 1));
    await saveNote(makeNote('b', 2));
    const { t, sent } = fakeTransport(() => new Promise((r) => setTimeout(r, 20)));
    const [x, y] = await Promise.all([syncPending(t), syncPending(t), syncPending(t)]);
    expect(sent).toEqual(['a', 'b']); // each note sent exactly once
    expect(x).toBe(y);
  });

  it('does not even try while the device reports it is offline', async () => {
    await saveNote(makeNote('a', 1));
    setNavigatorOnline(false);
    const { t, sent } = fakeTransport();
    const out = await syncPending(t);
    expect(sent).toEqual([]);
    expect(out.offline).toBe(true);
    expect((await getNote('a'))?.status).toBe('pending');
  });

  it('honours the "simulate offline" demo switch', async () => {
    await saveNote(makeNote('a', 1));
    saveSettings({ simulateOffline: true });
    const { t, sent } = fakeTransport();
    expect((await syncPending(t)).offline).toBe(true);
    expect(sent).toEqual([]);
    saveSettings({ simulateOffline: false });
    expect((await syncPending(t)).synced).toBe(1);
  });
});

describe('demo cloud transport', () => {
  const payload = () => toPayload(makeNote('a', 1));

  it('is unreachable while offline and receives once back online', async () => {
    saveSettings({ simulateOffline: true });
    const t = createDemoTransport(() => deviceIsOffline({ simulateOffline: true }), 0);
    await expect(t.send(payload())).rejects.toBeInstanceOf(NetworkError);
    expect(readDemoCloud()).toHaveLength(0);
    const online = createDemoTransport(() => false, 0);
    await online.send(payload());
    expect(readDemoCloud()).toHaveLength(1);
  });

  it('is idempotent: a retried request never creates a duplicate record', async () => {
    const t = createDemoTransport(() => false, 0);
    await t.send(payload());
    await t.send(payload());
    await t.send(payload());
    expect(readDemoCloud()).toHaveLength(1);
  });
});

describe('webhook transport', () => {
  const stubFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(impl));
  const p = () => toPayload(makeNote('a', 1));

  it('POSTs JSON with an Idempotency-Key header', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    stubFetch(async (url, init) => {
      seen = { url, init };
      return new Response('ok', { status: 200 });
    });
    await createWebhookTransport('https://hooks.example.com/invoices').send(p());
    expect(seen?.url).toBe('https://hooks.example.com/invoices');
    expect(seen?.init.method).toBe('POST');
    expect((seen?.init.headers as Record<string, string>)['Idempotency-Key']).toBe('a');
    expect(JSON.parse(seen?.init.body as string)).toMatchObject({ id: 'a', noteNumber: 'DN-20260929-a' });
  });

  it.each([500, 502, 503, 408, 429])('HTTP %i is retryable', async (status) => {
    stubFetch(async () => new Response('', { status }));
    await expect(createWebhookTransport('https://x.test').send(p())).rejects.toBeInstanceOf(RetryableServerError);
  });

  it.each([400, 401, 404, 422])('HTTP %i is a rejection', async (status) => {
    stubFetch(async () => new Response('', { status }));
    await expect(createWebhookTransport('https://x.test').send(p())).rejects.toBeInstanceOf(ServerRejectedError);
  });

  it('a failed fetch (offline, DNS, CORS) is a NetworkError', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(createWebhookTransport('https://x.test').send(p())).rejects.toBeInstanceOf(NetworkError);
  });
});
