import { useEffect, useState, useSyncExternalStore } from 'react';
import { isSyncing, onSyncState } from '../lib/sync';
import { useSettings } from '../lib/settings';

export type Connectivity = 'online' | 'offline' | 'simulated-offline';

export function useConnectivity(): Connectivity {
  const settings = useSettings();
  const [navOnline, setNavOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const up = () => setNavOnline(true);
    const down = () => setNavOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (!navOnline) return 'offline';
  return settings.simulateOffline ? 'simulated-offline' : 'online';
}

export function useIsSyncing(): boolean {
  return useSyncExternalStore(onSyncState, isSyncing, isSyncing);
}
