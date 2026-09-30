/** Tiny pub/sub so React can re-read IndexedDB whenever a note is saved or synced. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onDataChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitDataChange(): void {
  listeners.forEach((fn) => fn());
}
