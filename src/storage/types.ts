import type { AppData } from '../domain/types';

export interface StorageStatus {
  provider: 'indexeddb' | 'localstorage' | 'memory';
  /** True when data will survive a browser refresh. */
  persistent: boolean;
  lastSavedAt?: string;
  error?: string;
}

/**
 * Storage abstraction. The UI only talks to this interface, so a different
 * backend can be added without touching screens.
 */
export interface StorageProvider {
  loadData(): Promise<AppData | null>;
  saveData(data: AppData): Promise<void>;
  exportData(data: AppData): string;
  importData(json: string): AppData;
  getStorageStatus(): StorageStatus;
  /** Small key-value side storage (sync state etc.) that is NOT part of backups. */
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string, public recoverable = true, public raw?: string) {
    super(message);
  }
}
