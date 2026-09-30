import { useEffect, useState } from 'react';
import { ocrAssetUrls } from './ocr';

export type OfflineReadiness = 'checking' | 'preparing' | 'ready' | 'unsupported';

/** True once the service worker has stored everything OCR needs (worker, WASM core, language data). */
export async function isOfflineReady(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const u = ocrAssetUrls();
  const hits = await Promise.all([u.worker, u.core, u.lang].map((url) => caches.match(url, { ignoreSearch: true })));
  return hits.every(Boolean);
}

export function useOfflineReadiness(): OfflineReadiness {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !import.meta.env.DEV;
  const [state, setState] = useState<OfflineReadiness>(supported ? 'checking' : 'unsupported');

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    let timer: number | undefined;
    const started = Date.now();

    const check = async () => {
      const ok = await isOfflineReady().catch(() => false);
      if (cancelled) return;
      if (ok) {
        setState('ready');
        return;
      }
      setState('preparing');
      if (Date.now() - started < 5 * 60_000) timer = window.setTimeout(check, 1500);
    };
    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [supported]);

  return state;
}
