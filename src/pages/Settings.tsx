import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cloud, CloudOff, Download, HardDrive, Plus, RefreshCw, RotateCcw, Trash2, Upload, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useApp } from '../store';
import { Alert, Field, Modal, NumberInput, PageHeader } from '../components/ui';
import { MEAL_SLOTS } from '../domain/constants';
import type { MealSlot, Settings } from '../domain/types';
import { createEmptyData, createSeedData } from '../data/seed';
import { downloadFile, uid } from '../domain/util';
import { formatDateTime, today } from '../domain/dates';
import { ImportError } from '../domain/schema';
import { DRIVE_FILE_NAME, DRIVE_SCOPE } from '../storage/googleDrive';
import { toCsv } from '../domain/csv';
import { expensesCsv } from '../domain/budget';
import { groceryCategoryLabel } from '../domain/constants';
import { useConfirm } from '../components/ui';

export function SettingsPage() {
  const { data, update } = useApp();
  const [params] = useSearchParams();
  const s = data.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((d) => void (d.settings[k] = v));

  useEffect(() => {
    const sec = params.get('section');
    if (sec) setTimeout(() => document.getElementById(sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [params]);

  return (
    <div className="page narrow">
      <PageHeader title="Settings & Backup" sub="Everything here is editable. Nothing is public — your data stays in this browser unless you connect Google Drive." />

      <section className="card stack" id="household">
        <h2>Household</h2>
        <div className="form-grid cols-2">
          <Field label="Kitchen / household name">
            <input type="text" value={s.householdName} onChange={(e) => set('householdName', e.target.value)} />
          </Field>
          <Field label="Household size">
            <NumberInput value={s.householdSize} min={1} step={1} onChange={(n) => set('householdSize', Math.max(1, n ?? 1))} />
          </Field>
          <Field label="City">
            <input type="text" value={s.location} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="Hometown">
            <input type="text" value={s.hometown} onChange={(e) => set('hometown', e.target.value)} />
          </Field>
          <Field label="Preferred cuisine">
            <input type="text" value={s.cuisine} onChange={(e) => set('cuisine', e.target.value)} />
          </Field>
          <Field label="Spice level">
            <select value={s.spiceLevel} onChange={(e) => set('spiceLevel', e.target.value as Settings['spiceLevel'])}>
              <option value="mild">Mild</option>
              <option value="medium">Medium</option>
              <option value="medium-spicy">Medium–spicy</option>
              <option value="spicy">Spicy</option>
            </select>
          </Field>
          <Field label="Dietary preferences" className="full">
            <textarea value={s.dietary} rows={2} onChange={(e) => set('dietary', e.target.value)} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={s.halalOnly} onChange={(e) => set('halalOnly', e.target.checked)} /> Halal only (prefer recipes with halal sourcing notes)
          </label>
          <Field label="Target non-veg days per week">
            <NumberInput value={s.nonVegDaysTarget} min={0} step={1} onChange={(n) => set('nonVegDaysTarget', Math.min(7, Math.max(0, n ?? 0)))} />
          </Field>
        </div>
        <div className="field-label">Members (optional labels)</div>
        {s.members.map((m, i) => (
          <div key={m.id} className="row gap wrap">
            <input type="text" value={m.name} onChange={(e) => update((d) => void (d.settings.members[i].name = e.target.value))} aria-label="Member name" style={{ flex: '1 1 140px' }} />
            <input type="text" value={m.role ?? ''} onChange={(e) => update((d) => void (d.settings.members[i].role = e.target.value))} aria-label="Member note" placeholder="Note / schedule" style={{ flex: '2 1 180px' }} />
            <label className="check small">
              <input type="checkbox" checked={m.packedLunch} onChange={(e) => update((d) => void (d.settings.members[i].packedLunch = e.target.checked))} /> Packed lunch
            </label>
            <button className="icon-btn danger" aria-label="Remove member" onClick={() => update((d) => void d.settings.members.splice(i, 1))}>
              <Trash2 />
            </button>
          </div>
        ))}
        <button className="btn sm" style={{ width: 'fit-content' }} onClick={() => update((d) => void d.settings.members.push({ id: uid('m'), name: 'New member', packedLunch: false }))}>
          <Plus /> Add member
        </button>
        <p className="small faint">{s.members.filter((m) => m.packedLunch).length} member(s) need packed lunches.</p>
      </section>

      <section className="card stack" id="meals">
        <h2>Meals & planning</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Meal</th>
                <th>Usual time</th>
                <th>People eating (default)</th>
              </tr>
            </thead>
            <tbody>
              {MEAL_SLOTS.map((slot) => (
                <tr key={slot.id}>
                  <td>{slot.label}</td>
                  <td style={{ width: 140 }}>
                    <input type="time" value={s.mealTimes[slot.id]} onChange={(e) => update((d) => void (d.settings.mealTimes[slot.id as MealSlot] = e.target.value))} aria-label={`${slot.label} time`} />
                  </td>
                  <td style={{ width: 160 }}>
                    <NumberInput ariaLabel={`${slot.label} people`} value={s.peoplePerMeal[slot.id]} min={0} step={1} onChange={(n) => update((d) => void (d.settings.peoplePerMeal[slot.id as MealSlot] = Math.max(0, n ?? 0)))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-grid cols-2">
          <Field label="Packed-lunch note" className="full">
            <input type="text" value={s.packedLunchNote} onChange={(e) => set('packedLunchNote', e.target.value)} />
          </Field>
          <Field label="Default recipe servings">
            <NumberInput value={s.defaultServings} min={1} step={1} onChange={(n) => set('defaultServings', Math.max(1, n ?? 1))} />
          </Field>
          <Field label="Avoid repeating a dish within (days)">
            <NumberInput value={s.avoidRepeatDays} min={0} step={1} onChange={(n) => set('avoidRepeatDays', Math.max(0, n ?? 0))} />
          </Field>
          <Field label="Week starts on">
            <select value={s.weekStartsOn} onChange={(e) => set('weekStartsOn', Number(e.target.value) as 0 | 1)}>
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </Field>
          <Field label="Units">
            <select value={s.preferredUnits} onChange={(e) => set('preferredUnits', e.target.value as Settings['preferredUnits'])}>
              <option value="metric+spoons">Metric + tsp/tbsp (Indian kitchen)</option>
              <option value="metric">Metric only</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="card stack" id="budget">
        <h2>Budget</h2>
        <div className="form-grid cols-3">
          <Field label="Weekly (₹)">
            <NumberInput value={s.weeklyBudget || undefined} min={0} placeholder="Not set" onChange={(n) => set('weeklyBudget', n ?? 0)} />
          </Field>
          <Field label="Monthly (₹)">
            <NumberInput value={s.monthlyBudget || undefined} min={0} placeholder="Not set" onChange={(n) => set('monthlyBudget', n ?? 0)} />
          </Field>
          <Field label="Alert at (%)">
            <NumberInput value={s.budgetAlertPct} min={1} step={1} onChange={(n) => set('budgetAlertPct', Math.min(100, Math.max(1, n ?? 80)))} />
          </Field>
        </div>
      </section>

      <section className="card stack" id="appearance">
        <h2>Appearance</h2>
        <div className="segmented" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} aria-pressed={s.theme === t} onClick={() => set('theme', t)}>
              {t === 'system' ? 'Match device' : t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </section>

      <StorageSection />
      <BackupSection />
    </div>
  );
}

/* ------------------------------ Storage & Drive ------------------------------ */

function StorageSection() {
  const { storage, saveState, drive, driveState, setDriveConfig, connectDrive, disconnectDrive, syncNow, resolveConflict } = useApp();
  const [clientId, setClientId] = useState(driveState.clientId ?? '');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  useEffect(() => setClientId(driveState.clientId ?? ''), [driveState.clientId]);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used`)).catch(() => undefined);
  }, []);
  const origin = typeof location !== 'undefined' ? location.origin : '';

  return (
    <section className="card stack" id="storage">
      <h2>Storage & sync</h2>
      <div className="row gap wrap">
        <span className="badge primary">
          <HardDrive size={12} /> {storage.provider === 'indexeddb' ? 'IndexedDB (this browser)' : storage.provider === 'localstorage' ? 'localStorage (fallback)' : 'Memory only'}
        </span>
        <span className={`badge ${saveState === 'error' ? 'danger' : 'ok'}`}>{saveState === 'error' ? 'last save failed' : saveState === 'saving' ? 'saving…' : 'saved'}</span>
        {storage.lastSavedAt && <span className="small faint">last saved {formatDateTime(storage.lastSavedAt)}</span>}
        {usage && <span className="small faint">· {usage}</span>}
        <span className={`badge ${drive.connected ? 'ok' : ''}`}>{drive.connected ? <><Cloud size={12} /> Drive connected</> : <><CloudOff size={12} /> Local only</>}</span>
      </div>
      {storage.error && <Alert kind="danger">{storage.error}</Alert>}
      {persisted === false && (
        <div className="row gap wrap">
          <span className="small muted">The browser may clear site data when space is low.</span>
          <button className="btn sm" onClick={() => navigator.storage?.persist?.().then(setPersisted)}>
            <ShieldCheck /> Ask browser to keep data
          </button>
        </div>
      )}

      <hr />
      <h3>Google Drive (optional)</h3>
      <p className="small muted">
        Keeps a copy of your data in a single file (<code>{DRIVE_FILE_NAME}</code>) in your own Google Drive, so you can use the app on another phone or computer. The app asks only for the <code>drive.file</code> permission — it can see only files it created. Your browser copy stays the main copy, so the app keeps working offline.
      </p>
      <Field label="Google OAuth Client ID" hint="ends with .apps.googleusercontent.com — not a secret">
        <div className="input-group">
          <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-abc.apps.googleusercontent.com" spellCheck={false} />
          <button className="btn" onClick={() => setDriveConfig({ clientId: clientId.trim() })} disabled={clientId.trim() === (driveState.clientId ?? '')}>
            Save
          </button>
        </div>
      </Field>
      <div className="row gap wrap">
        {!drive.connected ? (
          <button className="btn primary" onClick={connectDrive} disabled={!driveState.clientId}>
            <Cloud /> {drive.needsReconnect || driveState.everConnected ? 'Reconnect Google Drive' : 'Connect Google Drive'}
          </button>
        ) : (
          <>
            <button className="btn primary" onClick={() => syncNow()} disabled={drive.syncing}>
              <RefreshCw /> {drive.syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button className="btn" onClick={disconnectDrive}>
              <CloudOff /> Disconnect
            </button>
          </>
        )}
        <label className="check small">
          <input type="checkbox" checked={driveState.autoSync} onChange={(e) => setDriveConfig({ autoSync: e.target.checked })} /> Sync automatically after changes
        </label>
      </div>
      <div className="small muted">
        {driveState.lastSyncAt ? `Last sync: ${formatDateTime(driveState.lastSyncAt)}` : 'Never synced'}
        {drive.lastResult && ` · ${drive.lastResult}`}
      </div>
      {drive.error && <Alert kind={drive.needsReconnect ? 'warn' : 'danger'}>{drive.error}</Alert>}
      {drive.conflict && (
        <Modal
          open
          onClose={() => undefined}
          title="Sync conflict"
          footer={
            <>
              <button className="btn" onClick={() => downloadFile(`kitchen-os-drive-copy-${today()}.json`, JSON.stringify(drive.conflict!.remote, null, 2), 'application/json')}>
                <Download /> Download Drive copy
              </button>
              <span className="grow" />
              <button className="btn" onClick={() => resolveConflict('remote')}>
                Use Drive copy
              </button>
              <button className="btn primary" onClick={() => resolveConflict('local')}>
                Keep this device’s copy
              </button>
            </>
          }
        >
          <Alert kind="warn">
            Your data changed on this device <b>and</b> in Google Drive since the last sync. Choose which copy to keep — the other one is not merged.
          </Alert>
          <ul className="small">
            <li>Drive copy last saved: {formatDateTime(drive.conflict.remote.meta.updatedAt)} ({drive.conflict.remote.recipes.length} recipes, {drive.conflict.remote.meals.length} meals, {drive.conflict.remote.expenses.length} expenses)</li>
          </ul>
          <p className="small faint">“Use Drive copy” keeps a snapshot of this device’s data, which you can restore from Backup → Undo last restore.</p>
        </Modal>
      )}

      <details>
        <summary>Setup guide — create your own Google Client ID (one-time, ~10 minutes)</summary>
        <ol className="small stack" style={{ marginTop: 8 }}>
          <li>
            Open <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a> and create a project (e.g. “Family Kitchen OS”).
          </li>
          <li>APIs &amp; Services → Library → enable <b>Google Drive API</b>.</li>
          <li>
            APIs &amp; Services → OAuth consent screen (Google Auth Platform): choose <b>External</b>, fill app name and your email, and add the scope <code>{DRIVE_SCOPE}</code>. While the app is in “Testing”, add each family member’s Gmail under <b>Test users</b>.
          </li>
          <li>
            Credentials → Create credentials → <b>OAuth client ID</b> → type <b>Web application</b>. Under <b>Authorized JavaScript origins</b> add:
            <div className="code">{origin}</div>
            (for GitHub Pages this is <code>https://YOUR-USERNAME.github.io</code> — no path; add <code>http://localhost:5173</code> too for local development). No redirect URI or client secret is needed — this app uses the browser token flow.
          </li>
          <li>Copy the Client ID, paste it above, Save, then click Connect and approve access.</li>
          <li>On another device, open the same site, paste the same Client ID, connect, and choose “Use Drive copy” if asked.</li>
        </ol>
        <p className="small faint">Access tokens last about an hour and are never stored; you may need to click Reconnect after a while. You can remove access any time at myaccount.google.com → Security → Third-party access.</p>
      </details>
    </section>
  );
}

/* ------------------------------ Backup / reset ------------------------------ */

function BackupSection() {
  const { data, local, replaceData, toast, undoSnapshot } = useApp();
  const confirm = useConfirm();
  const [importErr, setImportErr] = useState<string[]>([]);

  const exportJson = () => downloadFile(`family-kitchen-os-backup-${today()}.json`, local.exportData(data), 'application/json');
  const onImport = async (file?: File) => {
    if (!file) return;
    setImportErr([]);
    try {
      const text = await file.text();
      const next = local.importData(text);
      const ok = await confirm({
        title: 'Restore this backup?',
        message: `It contains ${next.recipes.length} recipes, ${next.meals.length} meals, ${next.expenses.length} expenses and ${next.pantry.length} pantry items. Your current data will be replaced (a snapshot is kept so you can undo).`,
        confirmLabel: 'Restore backup',
        danger: true,
      });
      if (!ok) return;
      await replaceData(next, { snapshotLabel: 'last', message: 'Backup restored.' });
    } catch (e) {
      setImportErr(e instanceof ImportError ? e.problems : [(e as Error).message]);
      toast('Import failed — see details in Backup section.', 'error');
    }
  };
  const reset = async (kind: 'sample' | 'blank') => {
    const ok = await confirm({
      title: kind === 'sample' ? 'Reset to sample data?' : 'Clear plans and records?',
      message:
        kind === 'sample'
          ? 'All your data is replaced with the original sample recipes, menu and settings. Export a backup first if you might need it. A snapshot is kept for undo.'
          : 'Meals, shopping lists, pantry, expenses and sessions are removed. Recipes, ingredient prices and equipment are reset to defaults. A snapshot is kept for undo.',
      confirmLabel: kind === 'sample' ? 'Reset everything' : 'Clear',
      danger: true,
    });
    if (!ok) return;
    await replaceData(kind === 'sample' ? createSeedData() : createEmptyData(), { snapshotLabel: 'last', message: 'Data reset.' });
  };
  const pantryCsv = () => {
    const ing = new Map(data.ingredients.map((i) => [i.id, i]));
    downloadFile(
      `pantry-${today()}.csv`,
      toCsv(data.pantry, [
        { header: 'Item', value: (p) => ing.get(p.ingredientId)?.name },
        { header: 'Category', value: (p) => (ing.get(p.ingredientId) ? groceryCategoryLabel(ing.get(p.ingredientId)!.category) : '') },
        { header: 'Quantity', value: (p) => (p.qty == null ? 'unknown' : p.qty) },
        { header: 'Unit', value: (p) => p.unit },
        { header: 'Minimum', value: (p) => p.minQty },
        { header: 'Location', value: (p) => p.location },
        { header: 'Purchased', value: (p) => p.purchaseDate },
        { header: 'Best before', value: (p) => p.expiry },
        { header: 'Notes', value: (p) => p.notes },
      ]),
      'text/csv',
    );
  };

  return (
    <section className="card stack" id="backup">
      <h2>Backup, restore & reset</h2>
      <p className="small muted">Download a JSON backup regularly (e.g. weekly). It contains everything — recipes, plans, lists, pantry, expenses, sessions and settings. Google Drive credentials are not included.</p>
      <div className="row gap wrap">
        <button className="btn primary" onClick={exportJson}>
          <Download /> Download JSON backup
        </button>
        <label className="btn">
          <Upload /> Restore from JSON
          <input type="file" accept="application/json,.json" hidden onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button className="btn" onClick={() => downloadFile(`expenses-${today()}.csv`, expensesCsv(data.expenses), 'text/csv')}>
          <Download /> Expenses CSV
        </button>
        <button className="btn" onClick={pantryCsv}>
          <Download /> Pantry CSV
        </button>
      </div>
      {importErr.length > 0 && (
        <Alert kind="danger">
          <b>That file couldn’t be imported:</b>
          <ul>
            {importErr.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          Your current data was not changed.
        </Alert>
      )}
      <hr />
      <h3 className="row gap">
        <AlertTriangle size={16} color="var(--danger)" /> Danger zone
      </h3>
      <div className="row gap wrap">
        <button className="btn" onClick={async () => {
            if (!(await confirm({ title: 'Undo last restore / reset?', message: 'Your data goes back to how it was just before the last backup restore, reset, or “Use Drive copy”.', confirmLabel: 'Undo' }))) return;
            if (!(await undoSnapshot('last'))) toast('No snapshot to restore.', 'info');
          }}>
          <RotateCcw /> Undo last restore / reset
        </button>
        <button className="btn danger" onClick={() => reset('blank')}>
          Clear plans & records
        </button>
        <button className="btn danger solid" onClick={() => reset('sample')}>
          Reset to sample data
        </button>
      </div>
    </section>
  );
}
