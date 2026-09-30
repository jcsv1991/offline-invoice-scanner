import { useEffect, useState, type ReactNode } from 'react';
import { CameraIcon, CheckIcon, CloudOffIcon, CogIcon, ListIcon, SpinnerIcon } from './components/Icons';
import { NotesList } from './components/NotesList';
import { ScanFlow } from './components/ScanFlow';
import { SettingsPanel } from './components/SettingsPanel';
import { useConnectivity, useIsSyncing } from './hooks/useConnectivity';
import { useNotes } from './hooks/useNotes';
import { useOfflineReadiness } from './lib/offlineReady';
import { startSyncRunner } from './lib/sync';

type Tab = 'scan' | 'notes' | 'settings';

function StatusBar({ waiting }: { waiting: number }) {
  const connectivity = useConnectivity();
  const readiness = useOfflineReadiness();
  const syncing = useIsSyncing();

  const online = connectivity === 'online';
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      <span
        data-testid="connection-badge"
        data-state={connectivity}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${online ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-800 text-white'}`}
      >
        {online ? <CheckIcon width={14} height={14} /> : <CloudOffIcon width={14} height={14} />}
        {connectivity === 'online' ? 'Online' : connectivity === 'offline' ? 'Offline' : 'Offline (simulated)'}
      </span>

      <span
        data-testid="offline-ready"
        data-state={readiness}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
          readiness === 'ready' ? 'bg-teal-100 text-teal-900' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {readiness === 'ready' && <><CheckIcon width={14} height={14} /> Works offline</>}
        {readiness === 'preparing' && <><SpinnerIcon width={14} height={14} /> Preparing offline mode…</>}
        {readiness === 'checking' && 'Checking…'}
        {readiness === 'unsupported' && 'Offline caching off (dev)'}
      </span>

      {(waiting > 0 || syncing) && (
        <span data-testid="pending-count" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
          {syncing && <SpinnerIcon width={14} height={14} />}
          {syncing ? 'Syncing…' : `${waiting} waiting to sync`}
        </span>
      )}
    </div>
  );
}

function NavButton({ active, onClick, label, icon, badge, testId }: { active: boolean; onClick: () => void; label: string; icon: ReactNode; badge?: number; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold ${active ? 'text-teal-800' : 'text-slate-500'}`}
    >
      <span className={`rounded-full px-4 py-1 ${active ? 'bg-teal-100' : ''}`}>{icon}</span>
      {label}
      {badge ? (
        <span className="absolute right-[calc(50%-1.9rem)] top-1 min-w-5 rounded-full bg-amber-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white">{badge}</span>
      ) : null}
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('scan');
  const { notes, loaded } = useNotes();
  const waiting = notes.filter((n) => n.status !== 'synced').length;

  useEffect(() => startSyncRunner(), []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="safe-top sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-extrabold tracking-tight text-teal-800">Offline Invoice Scanner</h1>
        <div className="mt-1.5">
          <StatusBar waiting={waiting} />
        </div>
      </header>

      <main className="flex-1 px-4 pb-32 pt-4">
        {/* Panels stay mounted (just hidden) so a half-finished scan survives a trip to the Notes tab. */}
        <div hidden={tab !== 'scan'}>
          <ScanFlow notes={notes} />
        </div>
        <div hidden={tab !== 'notes'}>
          <NotesList notes={notes} loaded={loaded} />
        </div>
        <div hidden={tab !== 'settings'}>
          <SettingsPanel />
        </div>
      </main>

      <nav
        aria-label="Main"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-2xl border-t border-slate-200 bg-white/95 backdrop-blur"
      >
        <NavButton testId="nav-scan" active={tab === 'scan'} onClick={() => setTab('scan')} label="Scan" icon={<CameraIcon />} />
        <NavButton testId="nav-notes" active={tab === 'notes'} onClick={() => setTab('notes')} label="Notes" icon={<ListIcon />} badge={waiting} />
        <NavButton testId="nav-settings" active={tab === 'settings'} onClick={() => setTab('settings')} label="Settings" icon={<CogIcon />} />
      </nav>
    </div>
  );
}
