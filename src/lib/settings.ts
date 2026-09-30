import { useSyncExternalStore } from 'react';
import type { Settings } from './types';

const KEY = 'invoice-scanner:settings:v1';

export const DEFAULT_SETTINGS: Settings = {
  receivedBy: '',
  location: '',
  currency: 'CAD',
  syncMode: 'demo',
  webhookUrl: '',
  simulateOffline: false,
};

let cache: Settings | null = null;
const listeners = new Set<() => void>();

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable or corrupt - fall back to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function getSettings(): Settings {
  cache ??= read();
  return cache;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* keep the in-memory copy even if persisting fails */
  }
  listeners.forEach((l) => l());
  return cache;
}

export function _resetSettingsForTests(): void {
  cache = null;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
