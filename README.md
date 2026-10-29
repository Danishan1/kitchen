# Family Kitchen OS

A personal kitchen management app for a family of five in Delhi: plan meals, learn and cook recipes step by step, generate shopping lists, track pantry stock and food spending, look after kitchen equipment, and print clean recipe cards and checklists.

- **Static website** — React + TypeScript + Vite, deployable to GitHub Pages. No server, no paid database.
- **Works offline** — data lives in your browser (IndexedDB).
- **Optional Google Drive sync** — one JSON file in your own Drive, using your own OAuth Client ID.
- **Mobile first** — bottom navigation on phones, a compact sidebar on desktop, light & dark themes.

---

## Contents

1. [Features](#features)
2. [Run it locally](#run-it-locally)
3. [Deploy to GitHub Pages](#deploy-to-github-pages)
4. [Backups](#backups)
5. [Google Drive setup (optional)](#google-drive-setup-optional)
6. [How the data works](#how-the-data-works)
7. [Project structure](#project-structure)
8. [Tests](#tests)
9. [Limitations & honesty notes](#limitations--honesty-notes)

---

## Features

| Section | What it does |
| --- | --- |
| **Dashboard** | Today's meals with Cook / Prepared / Skip actions, packed lunches, a prep checklist (incl. "tonight for tomorrow" reminders), use-soon and low-stock items, this week's spend vs budget, pending purchases, plan completion, recent cooking, quick actions. Every number comes from saved data. |
| **Meal Planner** | Week, 14-day and month views. Breakfast, packed lunch, lunch, evening tea/snacks and dinner. Multiple dishes per meal with servings and people count, reminders, notes, leftover meals, prepared/skipped/replaced status. Drag to move (Ctrl/Alt-drag to copy), duplicate, copy a day or week, suggestions based on pantry, repetition and veg/non-veg balance, weekly effort summary. Seeded with an editable 7-day North-Indian menu. |
| **Recipes** | 23 complete beginner-friendly recipes for 5 servings (rice, moong & masoor dal, aloo jeera, aloo gobi, bhindi, roti, aloo paratha, omelette, egg curry, rajma, chole, chicken curry, chicken pulao, chicken/egg roll, burger, biryani, khichdi, poha, sandwich, noodles, chai, raita). Create/edit/duplicate/delete, search by name or ingredient, filters, serving scaling, cost estimates from your price list, equipment warnings, tips, mistakes, storage, halal notes, rating, photo, history. |
| **Cooking mode** | Full-screen, one step at a time, large text, ingredient & step checklists, step timers (in-page), session timer, keeps the screen awake where supported. |
| **Grocery Manager** | Build lists from planned meals (scaled, merged, minus known pantry stock), manual lists, edit quantities/units, shopping mode with big checkboxes, record purchases (qty, price, vendor, date), add purchases to pantry (once), record purchases as expenses (once), group by category or shop, reusable templates, CSV/JSON export, print. |
| **Budget & Expenses** | Weekly & monthly INR budgets with alert threshold, expenses by category/vendor, remaining budget, 8-week history, average per week, approx. cost per meal/serving, estimates vs actual shown separately, CSV export, printable monthly summary. |
| **Kitchen Inventory** | Pantry (known or *unknown* quantities, minimum stock, location, purchase & best-before dates, stock movements history, "cookable with known stock") and Equipment (owned / missing / damaged / optional, condition, cost) with an optional, no-pressure wishlist. |
| **Cooking Learning** | 2-week beginner plan, 9 skill paths with beginner/intermediate/advanced lessons, checklists and fixes, 7-step prep workflow, timed sessions with estimated vs actual time and reflection notes, editable food-safety reminders. |
| **Reports** | Weekly/monthly meal, spending, vendor and speed summaries; index of all printable documents. |
| **Settings & Backup** | Household, members, meal times, people per meal, packed lunches, cuisine, spice, dietary prefs, budget, units, theme, storage status, Google Drive, JSON backup/restore, CSV exports, reset with undo. |

Printable documents (browser print → "Save as PDF" works too): recipe card, shopping checklist, weekly meal plan, today's plan, pantry inventory (with a count column), monthly expense summary, equipment list, cooking progress checklist, food-safety sheet.

---

## Run it locally

Requirements: **Node.js 20+** (22 recommended) and npm.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + integration tests
npm run build      # production build into dist/
npm run preview    # serve the built site at http://localhost:4173
```

The built `dist/` folder is plain static files. You don't need Node to *use* the deployed site.

---

## Deploy to GitHub Pages

1. Create a GitHub repository (e.g. `family-kitchen-os`) and push this project to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Family Kitchen OS"
   git branch -M main
   git remote add origin https://github.com/<you>/family-kitchen-os.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the tests, builds with `VITE_BASE=/<repo-name>/`, and deploys.
4. Your app is at `https://<you>.github.io/<repo-name>/`.

Routing uses hash URLs (`…/#/recipes/rajma`), so direct links and page refreshes work on GitHub Pages without any 404 tricks.

> **Privacy:** a GitHub Pages site is public, but it only contains the app code. Your household data is stored in each visitor's own browser (and optionally their own Google Drive) — nothing personal is published. The site also sends a `noindex` hint to search engines. If you'd rather not have it public at all, run it locally or on a private host.

**Custom domain or user site** (`<you>.github.io` repo): set `VITE_BASE=/` in the workflow.

---

## Backups

- **Settings → Backup → Download JSON backup** saves *everything* (recipes, plans, lists, pantry, expenses, sessions, settings). Do this weekly or before big changes.
- **Restore from JSON** validates the file first; invalid files are rejected with readable reasons and your data is not touched. A snapshot of the previous data is kept — **Undo last restore / reset** brings it back.
- CSV exports are available for expenses, pantry and each shopping list (open in Excel/Google Sheets).
- Browsers can clear site data under storage pressure; the Settings page offers "Ask browser to keep data" (persistent storage) where supported.

---

## Google Drive setup (optional)

Drive sync lets the same data follow you between phone and laptop. It uses **your own** Google Cloud project — no shared credentials exist in this repo and **no client secret is ever needed or stored**.

1. Go to <https://console.cloud.google.com/> → create a project.
2. **APIs & Services → Library →** enable **Google Drive API**.
3. **OAuth consent screen / Google Auth Platform**: User type **External**, fill in app name + your email. Add the scope `https://www.googleapis.com/auth/drive.file`. While the app is in *Testing* mode, add every family member's Google account under **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized JavaScript origins**: `https://<you>.github.io` (origin only — no `/repo` path) and, for development, `http://localhost:5173`.
   - No redirect URI is required (the app uses the Google Identity Services *token* flow in a popup).
5. Copy the **Client ID** (`…apps.googleusercontent.com`).
6. In the app: **Settings → Storage & sync →** paste the Client ID → **Save → Connect Google Drive**. Approve access.
   - Optional: set the repo variable `VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions → *Variables*) so the ID is pre-filled for everyone using your deployment. A Client ID is public by design; it is not a secret.

How sync behaves:

- Scope `drive.file`: the app only sees the file it created, **`family-kitchen-os-data.json`**. It's updated in place — never duplicated.
- The browser copy (IndexedDB) stays primary, so the app keeps working offline or if Drive fails. Changes sync after a few seconds (if *auto sync* is on), on **Sync now**, and when you come back online.
- If both this device and Drive changed since the last sync, you get a **conflict dialog** (keep this device / use Drive / download Drive copy). Nothing is silently overwritten.
- Access tokens last ~1 hour and are kept only in memory. When one expires you'll see **Reconnect**; local saving continues meanwhile.
- Revoke access any time: <https://myaccount.google.com/permissions>.

GitHub Pages does not provide a database, and Drive sync does not work without the OAuth setup above.

---

## How the data works

`src/domain/types.ts` defines a versioned model (`meta.schemaVersion`) with separate collections:
`settings, ingredients, recipes, meals, groceryLists, groceryItems, pantry, stockMovements, expenses, equipment, cookingSessions, learningProgress, safetyTips, checklists, preferences`.

How ingredient data flows (no duplication):

```
ingredients (catalog: name, category, your price, optional piece/spoon weights)
   ▲ referenced by id
recipe ingredients ──scale by servings──► planned requirements (computed, never stored)
                                              │ minus KNOWN pantry stock (unknown = not subtracted)
                                              ▼
                                       grocery items (what to buy, per list)
                                              │ you tick "purchased" (+ qty, price, vendor, date)
                       ┌──────────────────────┴───────────────────────┐
         "Add to pantry" (explicit, once)                  "Record as expenses" (explicit, once)
                       ▼                                              ▼
       stock movement (keyed to item) → pantry qty          expenses (actual money spent)
```

- Regenerating a list only replaces un-purchased plan items; manual items and purchases are kept; stock already added from this list is not offset again — so nothing is double-counted.
- Pantry quantities change only through recorded movements (purchases added, manual use/add/count, and — only if you enable it — meals marked prepared). Inventory is never claimed to be accurate beyond what you recorded.
- Recipe costs and list totals are **estimates** from your price list; budget figures use **actual** expenses only. The UI labels them separately.
- Unit conversion is safe by default (g↔kg, ml↔l↔tsp↔tbsp↔cup, pc↔dozen). Piece ↔ gram or spoon ↔ gram conversions happen only for ingredients where *you* set an approximate weight (e.g. 1 onion ≈ 120 g), so lists can say "Onion 2.1 kg".
- Dates are stored as local `YYYY-MM-DD` (no UTC shift for IST) and displayed in `en-IN` format; money uses ₹ with Indian digit grouping.
- Storage goes through a provider interface (`loadData / saveData / exportData / importData / getStorageStatus`) in `src/storage/`: IndexedDB → localStorage fallback → in-memory (with a visible warning). Old/partial data is migrated without dropping unknown fields; unreadable data is kept aside, never destroyed.

---

## Project structure

```
src/
  domain/      pure logic: types, units, dates, recipes (scaling/cost), grocery (aggregation,
               pantry, purchases, expenses), planner, budget, sessions, schema (migrate/import), csv
  data/        seed recipes, ingredient catalog & prices, sample week, equipment, learning content
  storage/     LocalProvider (IndexedDB), GoogleDriveProvider (GIS + Drive REST), interface
  store.tsx    app state, debounced saving, sync orchestration, toasts
  components/  Layout (sidebar / bottom nav), dialogs, editors
  pages/       one file per section (+ CookMode, RecipeEditor, Session, IngredientPrices)
  print/       print documents
  styles/      app.css (tokens, light/dark), print.css (@media print)
tests/         domain, storage/Drive-sync (mocked), app smoke test
```

---

## Tests

`npm test` runs Vitest (jsdom + fake IndexedDB). Covered workflows include: unit conversion, India-safe dates, recipe completeness & scaling, cost estimates, search/filters, equipment warnings, grocery aggregation & merging, pantry subtraction with known vs unknown stock, regenerate-without-double-counting, purchases → pantry (idempotent) → expenses (once), pantry deduction for prepared meals, budget summaries & alerts, planner copy/move/suggestions, JSON round-trip, invalid-import messages, migration, CSV safety, IndexedDB persistence & corruption handling, Drive create/update-in-place/pull/conflict/expired-token, and a UI smoke test.

---

## Limitations & honesty notes

- Timers are in-page. They survive a refresh (timestamp-based) but cannot ring when the browser or tab is closed.
- Prices, cooking times and costs are starting estimates for Delhi (2026) — update them from your own bills.
- Food-safety reminders are conservative general guidance, editable, and not a substitute for official advice. When in doubt, throw it out.
- Drive sync resolves conflicts by choosing a whole copy, not by merging individual records.
- Recipe photos are stored inside your data (resized); many photos make backups larger.
