import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DeliveryNote } from './types';
import { emitDataChange } from './events';

interface Schema extends DBSchema {
  notes: {
    key: string;
    value: DeliveryNote;
    indexes: { 'by-created': string };
  };
  meta: { key: string; value: number };
}

const DB_NAME = 'invoice-scanner';
let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function getDb(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, 1, {
    upgrade(db) {
      const notes = db.createObjectStore('notes', { keyPath: 'id' });
      notes.createIndex('by-created', 'createdAt');
      db.createObjectStore('meta');
    },
  });
  return dbPromise;
}

/** Test helper: forget the cached connection so a fresh (fake) database is opened. */
export function _resetDbForTests(): void {
  dbPromise = null;
}

export async function saveNote(note: DeliveryNote): Promise<void> {
  const db = await getDb();
  await db.put('notes', note);
  emitDataChange();
}

export async function getNote(id: string): Promise<DeliveryNote | undefined> {
  return (await getDb()).get('notes', id);
}

/** Newest first. */
export async function listNotes(): Promise<DeliveryNote[]> {
  const all = await (await getDb()).getAllFromIndex('notes', 'by-created');
  return all.reverse();
}

/** Notes waiting to be sent, oldest first, so the server receives them in the order they happened. */
export async function listPending(): Promise<DeliveryNote[]> {
  const all = await (await getDb()).getAllFromIndex('notes', 'by-created');
  return all.filter((n) => n.status === 'pending');
}

export async function updateNote(id: string, patch: Partial<DeliveryNote>): Promise<DeliveryNote | undefined> {
  const db = await getDb();
  const tx = db.transaction('notes', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return undefined;
  }
  const next = { ...current, ...patch };
  await tx.store.put(next);
  await tx.done;
  emitDataChange();
  return next;
}

export async function deleteNote(id: string): Promise<void> {
  await (await getDb()).delete('notes', id);
  emitDataChange();
}

/** Per-device running counter used in note numbers (DN-20260929-0007). Atomic within one transaction. */
export async function nextSequence(): Promise<number> {
  const db = await getDb();
  const tx = db.transaction('meta', 'readwrite');
  const current = (await tx.store.get('noteSeq')) ?? 0;
  const next = current + 1;
  await tx.store.put(next, 'noteSeq');
  await tx.done;
  return next;
}
