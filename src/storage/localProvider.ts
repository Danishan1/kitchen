import type { AppData } from '../domain/types';
import { exportEnvelope, migrate, parseImport } from '../domain/schema';
import { nowISO } from '../domain/util';
import { StorageError, type StorageProvider, type StorageStatus } from './types';

const DB_NAME = 'family-kitchen-os';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'appData';
const LS_PREFIX = 'fkos:';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available in this browser.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another open tab. Close other tabs of this app and reload.'));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    let result: T;
    req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error ?? req.error);
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted (storage may be full).'));
  });
}

/**
 * Primary local persistence: IndexedDB, falling back to localStorage, then to
 * in-memory (with a clear warning) if the browser blocks storage (e.g. some
 * private modes).
 */
export class LocalProvider implements StorageProvider {
  private db: IDBDatabase | null = null;
  private mode: StorageStatus['provider'] = 'indexeddb';
  private memory = new Map<string, unknown>();
  private status: StorageStatus = { provider: 'indexeddb', persistent: true };

  async init(): Promise<void> {
    try {
      this.db = await openDb();
      this.mode = 'indexeddb';
    } catch (e) {
      try {
        const k = LS_PREFIX + 'probe';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        this.mode = 'localstorage';
        this.status.error = `IndexedDB unavailable (${(e as Error).message}); using localStorage.`;
      } catch {
        this.mode = 'memory';
        this.status.error = 'Browser storage is blocked. Changes will be lost on refresh — export a backup before closing.';
      }
    }
    this.status.provider = this.mode;
    this.status.persistent = this.mode !== 'memory';
  }

  private async rawGet<T>(key: string): Promise<T | undefined> {
    if (this.mode === 'indexeddb' && this.db) return tx<T>(this.db, 'readonly', (s) => s.get(key) as IDBRequest<T>);
    if (this.mode === 'localstorage') {
      const v = localStorage.getItem(LS_PREFIX + key);
      return v == null ? undefined : (JSON.parse(v) as T);
    }
    return this.memory.get(key) as T | undefined;
  }

  private async rawSet(key: string, value: unknown): Promise<void> {
    if (this.mode === 'indexeddb' && this.db) {
      await tx(this.db, 'readwrite', (s) => s.put(value, key));
      return;
    }
    if (this.mode === 'localstorage') {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
      return;
    }
    this.memory.set(key, value);
  }

  async loadData(): Promise<AppData | null> {
    let raw: unknown;
    try {
      raw = await this.rawGet<unknown>(KEY);
    } catch (e) {
      this.status.error = `Could not read saved data: ${(e as Error).message}`;
      throw new StorageError(this.status.error);
    }
    if (raw == null) return null;
    try {
      const data = migrate(typeof raw === 'string' ? JSON.parse(raw) : raw);
      return data;
    } catch (e) {
      // Keep the unreadable copy so nothing is silently destroyed.
      const stamp = nowISO();
      try {
        await this.rawSet(`corrupt:${stamp}`, raw);
      } catch {
        /* ignore */
      }
      throw new StorageError(
        `Saved data could not be read (${(e as Error).message}). A copy was kept as "corrupt:${stamp}". You can restore a JSON backup or start fresh.`,
        true,
        typeof raw === 'string' ? raw : JSON.stringify(raw),
      );
    }
  }

  async saveData(data: AppData): Promise<void> {
    try {
      await this.rawSet(KEY, data);
      this.status.lastSavedAt = nowISO();
      if (this.mode !== 'memory') this.status.error = undefined;
    } catch (e) {
      const msg = (e as Error).name === 'QuotaExceededError' ? 'Storage is full — remove recipe photos or export and clear old data.' : (e as Error).message;
      this.status.error = `Save failed: ${msg}`;
      throw new StorageError(this.status.error);
    }
  }

  /** Keep a copy of the previous data before destructive operations (import / reset). */
  async snapshot(data: AppData, label: string): Promise<void> {
    try {
      await this.rawSet(`snapshot:${label}`, data);
    } catch {
      /* best effort */
    }
  }

  async getSnapshot(label: string): Promise<AppData | undefined> {
    const raw = await this.rawGet<unknown>(`snapshot:${label}`);
    return raw ? migrate(raw) : undefined;
  }

  exportData(data: AppData): string {
    return exportEnvelope(data);
  }

  importData(json: string): AppData {
    return parseImport(json);
  }

  getStorageStatus(): StorageStatus {
    return { ...this.status };
  }

  getMeta<T>(key: string): Promise<T | undefined> {
    return this.rawGet<T>(`meta:${key}`).catch(() => undefined);
  }

  setMeta<T>(key: string, value: T): Promise<void> {
    return this.rawSet(`meta:${key}`, value).catch(() => undefined);
  }
}
