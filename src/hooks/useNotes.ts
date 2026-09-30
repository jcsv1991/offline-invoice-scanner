import { useEffect, useState } from 'react';
import { listNotes } from '../lib/db';
import { onDataChange } from '../lib/events';
import type { DeliveryNote } from '../lib/types';

/** All notes on this device, newest first, refreshed whenever one is saved or synced. */
export function useNotes(): { notes: DeliveryNote[]; loaded: boolean } {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      listNotes()
        .then((n) => {
          if (alive) {
            setNotes(n);
            setLoaded(true);
          }
        })
        .catch(() => alive && setLoaded(true));
    void load();
    const off = onDataChange(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, []);

  return { notes, loaded };
}
