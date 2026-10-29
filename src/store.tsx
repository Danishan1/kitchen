import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData } from './domain/types';
import { createSeedData } from './data/seed';
import { LocalProvider } from './storage/localProvider';
import { StorageError, type StorageStatus } from './storage/types';
import { DriveError, GoogleDriveProvider, type SyncState } from './storage/googleDrive';
import { nowISO } from './domain/util';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
}

export interface DriveStatus {
  connected: boolean;
  syncing: boolean;
  error?: string;
  needsReconnect?: boolean;
  conflict?: { remote: AppData; fileVersion: string; remoteModified: string };
  lastResult?: string;
}

interface Ctx {
  data: AppData;
  update: (fn: (draft: AppData) => void, message?: string) => void;
  replaceData: (d: AppData, opts?: { snapshotLabel?: string; message?: string }) => Promise<void>;
  saveState: SaveState;
  storage: StorageStatus;
  toast: (message: string, kind?: Toast['kind'], action?: Toast['action']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  local: LocalProvider;
  drive: DriveStatus;
  driveState: SyncState;
  setDriveConfig: (patch: Partial<SyncState>) => Promise<void>;
  connectDrive: () => Promise<void>;
  disconnectDrive: () => Promise<void>;
  syncNow: (silent?: boolean) => Promise<void>;
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
  undoSnapshot: (label: string) => Promise<boolean>;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp must be used inside <AppProvider>');
  return c;
}

/** Convenience hook: only the data. */
export const useData = () => useApp().data;

const ENV_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

type Boot = { phase: 'loading' } | { phase: 'ready'; data: AppData } | { phase: 'error'; error: StorageError };

export function AppProvider({ children }: { children: ReactNode }) {
  const localRef = useRef<LocalProvider>(new LocalProvider());
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });

  const load = useCallback(async () => {
    const local = localRef.current;
    await local.init();
    try {
      const existing = await local.loadData();
      if (existing) setBoot({ phase: 'ready', data: existing });
      else {
        const seed = createSeedData();
        await local.saveData(seed).catch(() => undefined);
        setBoot({ phase: 'ready', data: seed });
      }
    } catch (e) {
      setBoot({ phase: 'error', error: e instanceof StorageError ? e : new StorageError((e as Error).message) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (boot.phase === 'loading') {
    return (
      <div className="boot">
        <div className="boot-spinner" aria-hidden />
        <p>Opening your kitchen…</p>
      </div>
    );
  }
  if (boot.phase === 'error') {
    return <StorageRecovery error={boot.error} local={localRef.current} onReady={(d) => setBoot({ phase: 'ready', data: d })} />;
  }
  return (
    <ReadyProvider initial={boot.data} local={localRef.current}>
      {children}
    </ReadyProvider>
  );
}

function StorageRecovery({ error, local, onReady }: { error: StorageError; local: LocalProvider; onReady: (d: AppData) => void }) {
  const [msg, setMsg] = useState('');
  const onFile = async (f: File) => {
    try {
      const d = local.importData(await f.text());
      await local.saveData(d);
      onReady(d);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="boot recovery">
      <h1>We couldn’t open your saved data</h1>
      <p>{error.message}</p>
      <div className="row gap wrap center">
        <label className="btn primary">
          Restore from JSON backup
          <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {error.raw && (
          <button
            className="btn"
            onClick={() => {
              const blob = new Blob([error.raw!], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'kitchen-os-unreadable-data.json';
              a.click();
            }}
          >
            Download the unreadable data
          </button>
        )}
        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm('Start fresh with sample data? Your unreadable data stays stored separately as a "corrupt" copy.')) return;
            const d = createSeedData();
            await local.saveData(d).catch(() => undefined);
            onReady(d);
          }}
        >
          Start fresh
        </button>
      </div>
      {msg && <p className="error-text">{msg}</p>}
    </div>
  );
}

function ReadyProvider({ initial, local, children }: { initial: AppData; local: LocalProvider; children: ReactNode }) {
  const [data, setData] = useState<AppData>(initial);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [storage, setStorage] = useState<StorageStatus>(local.getStorageStatus());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);
  const saveTimer = useRef<number | undefined>(undefined);
  const syncTimer = useRef<number | undefined>(undefined);

  const toast = useCallback((message: string, kind: Toast['kind'] = 'info', action?: Toast['action']) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, message, kind, action }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : action ? 7000 : 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  /* ---------------- Google Drive ---------------- */
  const [driveState, setDriveState] = useState<SyncState>({ autoSync: true, clientId: ENV_CLIENT_ID });
  const driveStateRef = useRef(driveState);
  driveStateRef.current = driveState;
  const driveRef = useRef<GoogleDriveProvider | null>(null);
  const [drive, setDrive] = useState<DriveStatus>({ connected: false, syncing: false });

  useEffect(() => {
    local.getMeta<SyncState>('drive').then((s) => {
      if (s) setDriveState({ ...s, autoSync: s.autoSync ?? true, clientId: s.clientId || ENV_CLIENT_ID });
    });
  }, [local]);

  const persistDriveState = useCallback(
    async (s: SyncState) => {
      setDriveState(s);
      driveStateRef.current = s;
      await local.setMeta('drive', s);
    },
    [local],
  );

  const setDriveConfig = useCallback(
    async (patch: Partial<SyncState>) => {
      const next = { ...driveStateRef.current, ...patch };
      if (patch.clientId !== undefined && driveRef.current && driveRef.current.clientId !== patch.clientId) {
        driveRef.current.disconnect();
        driveRef.current = null;
        setDrive({ connected: false, syncing: false });
      }
      await persistDriveState(next);
    },
    [persistDriveState],
  );

  const writeLocal = useCallback(
    async (d: AppData) => {
      setSaveState('saving');
      try {
        await local.saveData(d);
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        toast((e as Error).message, 'error');
      }
      setStorage(local.getStorageStatus());
    },
    [local, toast],
  );

  const syncNow = useCallback(
    async (silent = false) => {
      const p = driveRef.current;
      if (!p) {
        if (!silent) toast('Connect Google Drive first.', 'info');
        return;
      }
      if (!p.hasValidToken) {
        setDrive((s) => ({ ...s, connected: false, needsReconnect: true, error: 'Session expired — reconnect to sync.' }));
        return;
      }
      setDrive((s) => ({ ...s, syncing: true, error: undefined }));
      try {
        const local = dataRef.current;
        const res = await p.sync(local, driveStateRef.current);
        const base = { ...driveStateRef.current, lastSyncAt: nowISO(), everConnected: true };
        if (res.kind === 'noop') {
          await persistDriveState(base);
          setDrive((s) => ({ ...s, syncing: false, lastResult: 'Up to date' }));
        } else if (res.kind === 'pushed' || res.kind === 'created') {
          await persistDriveState({ ...base, fileId: res.file.id, remoteVersion: res.file.version, remoteModifiedTime: res.file.modifiedTime, syncedLocalUpdatedAt: local.meta.updatedAt });
          setDrive((s) => ({ ...s, syncing: false, lastResult: res.kind === 'created' ? 'Created Drive file' : 'Uploaded changes' }));
          if (!silent) toast(res.kind === 'created' ? 'Created your data file in Google Drive.' : 'Synced to Google Drive.', 'success');
        } else if (res.kind === 'pulled') {
          setData(res.data);
          dataRef.current = res.data;
          await writeLocal(res.data);
          await persistDriveState({ ...base, fileId: res.file.id, remoteVersion: res.file.version, remoteModifiedTime: res.file.modifiedTime, syncedLocalUpdatedAt: res.data.meta.updatedAt });
          setDrive((s) => ({ ...s, syncing: false, lastResult: 'Downloaded newer data' }));
          toast('Loaded newer data from Google Drive.', 'success');
        } else {
          await persistDriveState({ ...driveStateRef.current, fileId: res.file.id });
          setDrive((s) => ({ ...s, syncing: false, conflict: { remote: res.remote, fileVersion: res.file.version, remoteModified: res.file.modifiedTime } }));
        }
      } catch (e) {
        const err = e as DriveError;
        setDrive((s) => ({ ...s, syncing: false, error: err.message, needsReconnect: err.authExpired, connected: err.authExpired ? false : s.connected }));
        if (!silent) toast(err.message, 'error');
      }
    },
    [persistDriveState, toast, writeLocal],
  );

  const connectDrive = useCallback(async () => {
    const clientId = driveStateRef.current.clientId?.trim();
    if (!clientId) {
      toast('Enter your Google OAuth Client ID first (see the setup guide below).', 'error');
      return;
    }
    if (!driveRef.current || driveRef.current.clientId !== clientId) driveRef.current = new GoogleDriveProvider(clientId);
    try {
      await driveRef.current.connect(driveStateRef.current.everConnected ? '' : 'consent');
      setDrive({ connected: true, syncing: false });
      await syncNow(true);
    } catch (e) {
      setDrive({ connected: false, syncing: false, error: (e as Error).message });
      toast((e as Error).message, 'error');
    }
  }, [syncNow, toast]);

  const disconnectDrive = useCallback(async () => {
    driveRef.current?.disconnect();
    driveRef.current = null;
    setDrive({ connected: false, syncing: false });
    await persistDriveState({ autoSync: driveStateRef.current.autoSync, clientId: driveStateRef.current.clientId });
    toast('Google Drive disconnected. Your data remains on this device.', 'info');
  }, [persistDriveState, toast]);

  const resolveConflict = useCallback(
    async (choice: 'local' | 'remote') => {
      const c = drive.conflict;
      const p = driveRef.current;
      if (!c || !p) return;
      setDrive((s) => ({ ...s, syncing: true, conflict: undefined }));
      try {
        if (choice === 'remote') {
          await local.snapshot(dataRef.current, 'last');
          setData(c.remote);
          dataRef.current = c.remote;
          await writeLocal(c.remote);
          await persistDriveState({ ...driveStateRef.current, remoteVersion: c.fileVersion, remoteModifiedTime: c.remoteModified, syncedLocalUpdatedAt: c.remote.meta.updatedAt, lastSyncAt: nowISO(), everConnected: true });
          toast('Using the Google Drive copy. The previous local copy was kept as a snapshot.', 'success');
        } else {
          const id = driveStateRef.current.fileId!;
          const f = await p.update(id, dataRef.current);
          await persistDriveState({ ...driveStateRef.current, remoteVersion: f.version, remoteModifiedTime: f.modifiedTime, syncedLocalUpdatedAt: dataRef.current.meta.updatedAt, lastSyncAt: nowISO(), everConnected: true });
          toast('Kept this device’s data and uploaded it to Drive.', 'success');
        }
        setDrive((s) => ({ ...s, syncing: false, lastResult: 'Conflict resolved' }));
      } catch (e) {
        setDrive((s) => ({ ...s, syncing: false, error: (e as Error).message }));
        toast((e as Error).message, 'error');
      }
    },
    [drive.conflict, local, persistDriveState, toast, writeLocal],
  );

  // Sync again when the device comes back online.
  useEffect(() => {
    const on = () => {
      if (driveRef.current?.hasValidToken && driveStateRef.current.autoSync) syncNow(true);
    };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [syncNow]);

  /* ---------------- Local save ---------------- */
  const scheduleSave = useCallback(
    (d: AppData) => {
      setSaveState('saving');
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        await writeLocal(d);
        if (driveRef.current?.hasValidToken && driveStateRef.current.autoSync && !drive.conflict) {
          window.clearTimeout(syncTimer.current);
          syncTimer.current = window.setTimeout(() => syncNow(true), 4000);
        }
      }, 250);
    },
    [writeLocal, syncNow, drive.conflict],
  );

  // Flush pending save on tab close.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) local.saveData(dataRef.current).catch(() => undefined);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [local]);

  const update = useCallback(
    (fn: (draft: AppData) => void, message?: string) => {
      const draft = structuredClone(dataRef.current);
      try {
        fn(draft);
      } catch (e) {
        toast((e as Error).message, 'error');
        return;
      }
      draft.meta.updatedAt = nowISO();
      dataRef.current = draft;
      setData(draft);
      scheduleSave(draft);
      if (message) toast(message, 'success');
    },
    [scheduleSave, toast],
  );

  const replaceData = useCallback(
    async (d: AppData, opts: { snapshotLabel?: string; message?: string } = {}) => {
      if (opts.snapshotLabel) await local.snapshot(dataRef.current, opts.snapshotLabel);
      const next = { ...d, meta: { ...d.meta, updatedAt: nowISO() } };
      dataRef.current = next;
      setData(next);
      await writeLocal(next);
      if (opts.message) toast(opts.message, 'success');
    },
    [local, toast, writeLocal],
  );

  const undoSnapshot = useCallback(
    async (label: string) => {
      const snap = await local.getSnapshot(label);
      if (!snap) return false;
      await replaceData(snap, { message: 'Previous data restored.' });
      return true;
    },
    [local, replaceData],
  );

  // Theme
  useEffect(() => {
    const root = document.documentElement;
    const t = data.settings.theme;
    if (t === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
  }, [data.settings.theme]);

  const value = useMemo<Ctx>(
    () => ({
      data, update, replaceData, saveState, storage, toast, toasts, dismissToast, local,
      drive, driveState, setDriveConfig, connectDrive, disconnectDrive, syncNow, resolveConflict, undoSnapshot,
    }),
    [data, update, replaceData, saveState, storage, toast, toasts, dismissToast, local, drive, driveState, setDriveConfig, connectDrive, disconnectDrive, syncNow, resolveConflict, undoSnapshot],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
