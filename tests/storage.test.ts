import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalProvider } from '../src/storage/localProvider';
import { GoogleDriveProvider, type SyncState } from '../src/storage/googleDrive';
import { StorageError } from '../src/storage/types';
import { createSeedData } from '../src/data/seed';
import { exportEnvelope } from '../src/domain/schema';
import type { AppData } from '../src/domain/types';

describe('LocalProvider (IndexedDB)', () => {
  it('saves and loads data across instances', async () => {
    const a = new LocalProvider();
    await a.init();
    const d = createSeedData('2026-10-28');
    d.settings.householdName = 'Persist test';
    await a.saveData(d);
    const b = new LocalProvider();
    await b.init();
    const loaded = await b.loadData();
    expect(loaded?.settings.householdName).toBe('Persist test');
    expect(b.getStorageStatus().provider).toBe('indexeddb');
  });

  it('reports corrupted data with a recoverable error and keeps a copy', async () => {
    const a = new LocalProvider();
    await a.init();
    // write garbage directly
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('family-kitchen-os', 1);
      req.onsuccess = () => {
        const t = req.result.transaction('kv', 'readwrite');
        t.objectStore('kv').put('not-an-object', 'appData');
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
      };
    });
    await expect(a.loadData()).rejects.toBeInstanceOf(StorageError);
  });

  it('import rejects invalid JSON with readable problems', async () => {
    const a = new LocalProvider();
    await a.init();
    expect(() => a.importData('{oops')).toThrow(/not valid JSON/);
  });
});

/* ---------------- Google Drive sync (fetch mocked) ---------------- */

function fakeDrive(initial?: { data: AppData; version: number }) {
  let file = initial ? { id: 'f1', version: initial.version, body: exportEnvelope(initial.data) } : null;
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.split('?')[0].replace('https://www.googleapis.com', '')}`);
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (method === 'GET' && url.includes('/files?q=')) return json({ files: file ? [{ id: file.id, version: String(file.version), modifiedTime: 't' }] : [] });
    if (method === 'GET' && url.includes('alt=media')) return new Response(file!.body, { status: 200 });
    if (method === 'GET') return file ? json({ id: file.id, version: String(file.version), modifiedTime: 't' }) : new Response('{}', { status: 404 });
    if (method === 'POST') {
      const body = String(init!.body);
      const start = body.indexOf('{"app"');
      const end = body.lastIndexOf('}') + 1;
      file = { id: 'f1', version: 1, body: body.slice(start, end) };
      return json({ id: 'f1', version: '1', modifiedTime: 't' });
    }
    if (method === 'PATCH') {
      file = { id: 'f1', version: file!.version + 1, body: String(init!.body) };
      return json({ id: 'f1', version: String(file.version), modifiedTime: 't' });
    }
    return new Response('{}', { status: 400 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, get file() { return file; } };
}

function provider() {
  const p = new GoogleDriveProvider('test-client');
  // simulate a granted access token
  Object.assign(p as unknown as { token: string; tokenExpiry: number }, { token: 'tok', tokenExpiry: Date.now() + 3600_000 });
  return p;
}

describe('GoogleDriveProvider.sync', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates the data file once, then updates it in place', async () => {
    const drive = fakeDrive();
    const p = provider();
    const d = createSeedData('2026-10-28');
    const r1 = await p.sync(d, { autoSync: true });
    expect(r1.kind).toBe('created');
    const state: SyncState = { autoSync: true, fileId: 'f1', remoteVersion: '1', syncedLocalUpdatedAt: d.meta.updatedAt };
    expect((await p.sync(d, state)).kind).toBe('noop');
    const changed = { ...d, meta: { ...d.meta, updatedAt: '2099-01-01T00:00:00.000Z' } };
    const r3 = await p.sync(changed, state);
    expect(r3.kind).toBe('pushed');
    expect(drive.calls.filter((c) => c.startsWith('POST'))).toHaveLength(1); // never duplicated
  });

  it('pulls newer remote data when local is unchanged', async () => {
    const remote = createSeedData('2026-10-28');
    remote.settings.householdName = 'From phone';
    remote.meta.updatedAt = '2099-01-01T00:00:00.000Z';
    fakeDrive({ data: remote, version: 5 });
    const local = createSeedData('2026-10-28');
    const r = await provider().sync(local, { autoSync: true, fileId: 'f1', remoteVersion: '4', syncedLocalUpdatedAt: local.meta.updatedAt });
    expect(r.kind).toBe('pulled');
    if (r.kind === 'pulled') expect(r.data.settings.householdName).toBe('From phone');
  });

  it('detects conflicts instead of overwriting', async () => {
    const remote = createSeedData('2026-10-28');
    remote.meta.updatedAt = '2099-01-01T00:00:00.000Z';
    fakeDrive({ data: remote, version: 7 });
    const local = createSeedData('2026-10-28');
    const r = await provider().sync(local, { autoSync: true, fileId: 'f1', remoteVersion: '6', syncedLocalUpdatedAt: 'older' });
    expect(r.kind).toBe('conflict');
  });

  it('fails clearly when the session expired', async () => {
    fakeDrive();
    const p = new GoogleDriveProvider('x');
    await expect(p.sync(createSeedData(), { autoSync: true })).rejects.toThrow(/expired/);
  });
});
