/**
 * Optional Google Drive storage provider.
 *
 * - Auth: Google Identity Services (GIS) token model, in the browser only.
 *   No client secret, no refresh token — access tokens live in memory and expire
 *   after ~1 hour; the user reconnects when needed.
 * - Scope: `drive.file` — the app can only see files it created itself.
 * - Data: one JSON file named `family-kitchen-os-data.json` in the user's Drive.
 *   The file is updated in place (never duplicated). Its Drive `version` number
 *   is used to detect changes made from another device.
 * - Local IndexedDB stays the primary copy, so the app keeps working offline or
 *   when Drive fails.
 */
import type { AppData } from '../domain/types';
import { exportEnvelope, parseImport } from '../domain/schema';
import type { StorageProvider, StorageStatus } from './types';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FILE_NAME = 'family-kitchen-os-data.json';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export interface SyncState {
  fileId?: string;
  /** Drive file version at last successful sync. */
  remoteVersion?: string;
  remoteModifiedTime?: string;
  /** Local `meta.updatedAt` that matched the remote copy at last sync. */
  syncedLocalUpdatedAt?: string;
  lastSyncAt?: string;
  autoSync: boolean;
  clientId?: string;
  connectedEmailHint?: string;
  everConnected?: boolean;
}

export interface RemoteFile {
  id: string;
  version: string;
  modifiedTime: string;
}

export type SyncResult =
  | { kind: 'noop' }
  | { kind: 'pushed'; file: RemoteFile }
  | { kind: 'created'; file: RemoteFile }
  | { kind: 'pulled'; file: RemoteFile; data: AppData }
  | { kind: 'conflict'; file: RemoteFile; remote: AppData };

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleOAuth2 {
  initTokenClient(cfg: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string; message?: string }) => void;
  }): { requestAccessToken(o?: { prompt?: string }): void };
  revoke(token: string, cb?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Could not load Google sign-in. Check your internet connection or content blockers.'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

export class DriveError extends Error {
  constructor(message: string, public status?: number, public authExpired = false) {
    super(message);
  }
}

export class GoogleDriveProvider implements StorageProvider {
  private token?: string;
  private tokenExpiry = 0;
  private status: StorageStatus = { provider: 'memory', persistent: true };

  constructor(public clientId: string) {}

  get hasValidToken() {
    return !!this.token && Date.now() < this.tokenExpiry - 60_000;
  }

  /** Interactive sign-in. Must be triggered from a user click (popup). */
  async connect(prompt: '' | 'consent' | 'select_account' = ''): Promise<void> {
    if (!this.clientId) throw new DriveError('Add your Google OAuth Client ID in Settings first.');
    await loadGis();
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) throw new DriveError('Google sign-in library did not initialise.');
    await new Promise<void>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) {
            reject(new DriveError(r.error_description || r.error || 'Google did not grant access.'));
            return;
          }
          this.token = r.access_token;
          this.tokenExpiry = Date.now() + (r.expires_in ?? 3600) * 1000;
          resolve();
        },
        error_callback: (e) =>
          reject(new DriveError(e.type === 'popup_closed' ? 'The Google sign-in window was closed.' : e.type === 'popup_failed_to_open' ? 'Pop-up blocked. Allow pop-ups for this site and try again.' : e.message || e.type)),
      });
      client.requestAccessToken({ prompt });
    });
  }

  disconnect() {
    const t = this.token;
    this.token = undefined;
    this.tokenExpiry = 0;
    if (t) window.google?.accounts?.oauth2?.revoke(t);
  }

  private async req(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.hasValidToken) throw new DriveError('Google Drive session expired. Click "Reconnect" to continue syncing.', 401, true);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new DriveError('You are offline. Changes are saved on this device and will sync when you reconnect.');
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${this.token}` } });
    } catch {
      throw new DriveError('Network error while contacting Google Drive.');
    }
    if (res.status === 401) {
      this.token = undefined;
      throw new DriveError('Google Drive session expired. Click "Reconnect".', 401, true);
    }
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j?.error?.message ?? '';
      } catch {
        /* ignore */
      }
      throw new DriveError(`Google Drive error ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
    }
    return res;
  }

  async findFile(): Promise<RemoteFile | null> {
    const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    const res = await this.req(`${API}/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,version,modifiedTime)`);
    const j = (await res.json()) as { files: RemoteFile[] };
    return j.files?.[0] ?? null;
  }

  async getFileMeta(id: string): Promise<RemoteFile | null> {
    try {
      const res = await this.req(`${API}/files/${id}?fields=id,version,modifiedTime,trashed`);
      const j = (await res.json()) as RemoteFile & { trashed?: boolean };
      return j.trashed ? null : j;
    } catch (e) {
      if (e instanceof DriveError && e.status === 404) return null;
      throw e;
    }
  }

  async download(id: string): Promise<AppData> {
    const res = await this.req(`${API}/files/${id}?alt=media`);
    const text = await res.text();
    return parseImport(text);
  }

  async create(data: AppData): Promise<RemoteFile> {
    const boundary = 'fkos' + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: 'application/json', description: 'Family Kitchen OS data (do not edit by hand)' }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      exportEnvelope(data) +
      `\r\n--${boundary}--`;
    const res = await this.req(`${UPLOAD}/files?uploadType=multipart&fields=id,version,modifiedTime`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return (await res.json()) as RemoteFile;
  }

  async update(id: string, data: AppData): Promise<RemoteFile> {
    const res = await this.req(`${UPLOAD}/files/${id}?uploadType=media&fields=id,version,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: exportEnvelope(data),
    });
    return (await res.json()) as RemoteFile;
  }

  /**
   * Two-way sync with conflict detection.
   *  - remote unchanged & local changed  → push
   *  - remote changed   & local unchanged → pull
   *  - both changed (or first link with existing remote data) → conflict (user decides)
   */
  async sync(local: AppData, state: SyncState): Promise<SyncResult> {
    let file = state.fileId ? await this.getFileMeta(state.fileId) : null;
    if (!file) file = await this.findFile();
    if (!file) return { kind: 'created', file: await this.create(local) };

    const remoteChanged = file.version !== state.remoteVersion || file.id !== state.fileId;
    const localChanged = local.meta.updatedAt !== state.syncedLocalUpdatedAt;

    if (!remoteChanged && !localChanged) return { kind: 'noop' };
    if (!remoteChanged && localChanged) return { kind: 'pushed', file: await this.update(file.id, local) };
    const remote = await this.download(file.id);
    if (remoteChanged && (!localChanged || remote.meta.updatedAt === local.meta.updatedAt)) return { kind: 'pulled', file, data: remote };
    return { kind: 'conflict', file, remote };
  }

  /* StorageProvider interface (used for explicit load/save from Settings) */
  async loadData(): Promise<AppData | null> {
    const f = await this.findFile();
    return f ? this.download(f.id) : null;
  }
  async saveData(data: AppData): Promise<void> {
    const f = await this.findFile();
    if (f) await this.update(f.id, data);
    else await this.create(data);
    this.status.lastSavedAt = new Date().toISOString();
  }
  exportData(data: AppData) {
    return exportEnvelope(data);
  }
  importData(json: string) {
    return parseImport(json);
  }
  getStorageStatus(): StorageStatus {
    return { ...this.status };
  }
  async getMeta<T>(): Promise<T | undefined> {
    return undefined;
  }
  async setMeta(): Promise<void> {}
}
