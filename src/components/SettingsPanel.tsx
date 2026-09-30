import { useEffect, useState } from 'react';
import { emitDataChange, onDataChange } from '../lib/events';
import { saveSettings, useSettings } from '../lib/settings';
import { requestSync } from '../lib/sync';
import { clearDemoCloud, readDemoCloud, type DemoCloudRecord } from '../lib/transports';
import type { Settings } from '../lib/types';
import { formatMoney } from '../lib/money';
import { formatDateTime } from '../lib/note';
import { Button, Card, Field, inputClass } from './ui';

export function SettingsPanel() {
  const s = useSettings();
  const [cloud, setCloud] = useState<DemoCloudRecord[]>(() => readDemoCloud());

  useEffect(() => onDataChange(() => setCloud(readDemoCloud())), []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold">Settings</h2>

      <Card className="flex flex-col gap-3">
        <h3 className="text-base font-bold">Defaults</h3>
        <Field label="Received by (default)" htmlFor="s-receivedBy">
          <input id="s-receivedBy" className={inputClass} value={s.receivedBy} onChange={(e) => saveSettings({ receivedBy: e.target.value })} />
        </Field>
        <Field label="Location (default)" htmlFor="s-location">
          <input id="s-location" className={inputClass} value={s.location} onChange={(e) => saveSettings({ location: e.target.value })} />
        </Field>
        <Field label="Currency" htmlFor="s-currency">
          <select id="s-currency" className={inputClass} value={s.currency} onChange={(e) => saveSettings({ currency: e.target.value as Settings['currency'] })}>
            {['CAD', 'USD', 'EUR', 'GBP'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="text-base font-bold">Where notes are sent</h3>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Sync target</legend>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input type="radio" name="syncMode" checked={s.syncMode === 'demo'} onChange={() => saveSettings({ syncMode: 'demo' })} className="mt-1" />
            <span>
              <span className="block font-semibold">Demo cloud (built in)</span>
              <span className="block text-sm text-slate-600">A stand-in server inside this browser, so the demo works with no backend.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input type="radio" name="syncMode" checked={s.syncMode === 'webhook'} onChange={() => saveSettings({ syncMode: 'webhook' })} className="mt-1" />
            <span className="flex-1">
              <span className="block font-semibold">Your webhook</span>
              <span className="block text-sm text-slate-600">POSTs each note as JSON. Works with n8n, Make, Zapier or your own API (CORS must be enabled).</span>
            </span>
          </label>
        </fieldset>
        {s.syncMode === 'webhook' && (
          <Field label="Webhook URL" htmlFor="s-webhook">
            <input
              id="s-webhook"
              type="url"
              inputMode="url"
              placeholder="https://example.com/webhook/invoices"
              className={inputClass}
              value={s.webhookUrl}
              onChange={(e) => saveSettings({ webhookUrl: e.target.value })}
            />
          </Field>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="text-base font-bold">Demo tools</h3>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            data-testid="simulate-offline"
            checked={s.simulateOffline}
            onChange={(e) => {
              saveSettings({ simulateOffline: e.target.checked });
              if (!e.target.checked) requestSync();
            }}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-semibold">Simulate being offline</span>
            <span className="block text-sm text-slate-600">
              Pretends the network is down so you can see notes queue up. Untick it and they sync by themselves.
            </span>
          </span>
        </label>
      </Card>

      {s.syncMode === 'demo' && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold">Demo cloud inbox</h3>
            <Button
              className="min-h-9 px-3"
              variant="danger"
              disabled={cloud.length === 0}
              onClick={() => {
                clearDemoCloud();
                emitDataChange();
              }}
            >
              Clear
            </Button>
          </div>
          <p className="text-sm text-slate-600">What the “server” has received so far ({cloud.length}).</p>
          <ul data-testid="cloud-inbox" className="flex flex-col gap-2">
            {cloud.map((r) => (
              <li key={r.payload.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-semibold">
                  {r.payload.noteNumber} · {r.payload.invoice.vendor || 'Unknown vendor'}
                </div>
                <div className="text-xs text-slate-500">
                  {formatMoney(r.payload.invoice.total, s.currency)} · received {formatDateTime(r.receivedAt)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-center text-xs text-slate-400">Offline Invoice Scanner · v1.0.0 · runs entirely in your browser</p>
    </div>
  );
}
