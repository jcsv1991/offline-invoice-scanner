import type { Settings, SyncPayload } from './types';

/** The device could not reach the server (offline, DNS, CORS, timeout). Note stays queued. */
export class NetworkError extends Error {
  override name = 'NetworkError';
}
/** Server answered 5xx / 408 / 429 - worth retrying later. */
export class RetryableServerError extends Error {
  override name = 'RetryableServerError';
  constructor(public status: number, message: string) {
    super(message);
  }
}
/** Server answered 4xx - retrying the same payload will not help until a person looks at it. */
export class ServerRejectedError extends Error {
  override name = 'ServerRejectedError';
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Transport {
  send(payload: SyncPayload): Promise<void>;
}

/* ---------------------------------------------------------------- demo cloud */

const CLOUD_KEY = 'invoice-scanner:demo-cloud:v1';

export interface DemoCloudRecord {
  receivedAt: string;
  payload: SyncPayload;
}

export function readDemoCloud(): DemoCloudRecord[] {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_KEY) ?? '[]') as DemoCloudRecord[];
  } catch {
    return [];
  }
}

export function clearDemoCloud(): void {
  try {
    localStorage.removeItem(CLOUD_KEY);
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A stand-in "server" that lives in the browser so the portfolio demo works with no backend.
 * It behaves like a real one: it is unreachable while the device is offline, takes a moment to
 * answer, and de-duplicates by note id (so a retried request never creates a second record).
 */
export function createDemoTransport(isOffline: () => boolean, latencyMs = 500): Transport {
  return {
    async send(payload) {
      await sleep(latencyMs);
      if (isOffline()) throw new NetworkError('Cloud unreachable (offline)');
      const records = readDemoCloud();
      if (!records.some((r) => r.payload.id === payload.id)) {
        records.push({ receivedAt: new Date().toISOString(), payload });
        localStorage.setItem(CLOUD_KEY, JSON.stringify(records));
      }
    },
  };
}

/* ------------------------------------------------------------------- webhook */

export function createWebhookTransport(url: string, timeoutMs = 15000): Transport {
  return {
    async send(payload) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': payload.id },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
      } catch (e) {
        throw new NetworkError(e instanceof Error ? e.message : 'Network error');
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) return;
      if (res.status >= 500 || res.status === 408 || res.status === 429) {
        throw new RetryableServerError(res.status, `Server error (HTTP ${res.status})`);
      }
      throw new ServerRejectedError(res.status, `Server rejected the note (HTTP ${res.status})`);
    },
  };
}

export function deviceIsOffline(settings: Pick<Settings, 'simulateOffline'>): boolean {
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || settings.simulateOffline;
}

export function createTransport(settings: Settings, readSettings: () => Settings): Transport {
  if (settings.syncMode === 'webhook' && settings.webhookUrl.trim()) {
    return createWebhookTransport(settings.webhookUrl.trim());
  }
  return createDemoTransport(() => deviceIsOffline(readSettings()));
}
