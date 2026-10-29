import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  BookOpen, CalendarDays, ChefHat, Cloud, CloudOff, GraduationCap, Home, LayoutGrid, Menu, Package,
  BarChart3, Settings, ShoppingCart, Wallet, Timer, HardDrive,
} from 'lucide-react';
import { useApp } from '../store';
import { Toasts } from './ui';
import { formatDuration } from '../domain/dates';
import { useNow } from '../hooks/useNow';
import { sessionElapsed } from '../domain/sessions';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: Home, end: true },
  { to: '/planner', label: 'Meal Planner', icon: CalendarDays },
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/grocery', label: 'Grocery Manager', icon: ShoppingCart },
  { to: '/budget', label: 'Budget & Expenses', icon: Wallet },
  { to: '/inventory', label: 'Kitchen Inventory', icon: Package },
  { to: '/learning', label: 'Cooking Learning', icon: GraduationCap },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings & Backup', icon: Settings },
];

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'],
  [/^\/planner/, 'Meal Planner'],
  [/^\/recipes\/prices/, 'Ingredient prices'],
  [/^\/recipes/, 'Recipes'],
  [/^\/grocery/, 'Grocery Manager'],
  [/^\/budget/, 'Budget & Expenses'],
  [/^\/inventory/, 'Kitchen Inventory'],
  [/^\/learning/, 'Cooking Learning'],
  [/^\/reports/, 'Reports'],
  [/^\/settings/, 'Settings & Backup'],
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="navlist">
      {NAV.map((n) => (
        <li key={n.to}>
          <NavLink to={n.to} end={n.end} onClick={onNavigate}>
            <n.icon aria-hidden />
            {n.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Brand() {
  const { data } = useApp();
  return (
    <div className="nav-brand">
      <span className="logo">
        <ChefHat size={18} />
      </span>
      <span>
        Kitchen OS
        <small>{data.settings.householdName}</small>
      </span>
    </div>
  );
}

function SaveStatus() {
  const { saveState, storage, drive } = useApp();
  const cls = saveState === 'error' || storage.provider === 'memory' ? 'error' : saveState === 'saving' ? 'saving' : '';
  const label =
    saveState === 'error' ? 'Save failed' : storage.provider === 'memory' ? 'Not saved' : saveState === 'saving' ? 'Saving…' : drive.connected ? (drive.syncing ? 'Syncing…' : 'Synced') : 'Saved';
  const Icon = drive.connected ? Cloud : drive.needsReconnect ? CloudOff : HardDrive;
  return (
    <Link to="/settings?section=storage" className={`status-pill ${cls}`} title={storage.error ?? (drive.connected ? 'Saved on this device and Google Drive' : 'Saved on this device')}>
      <span className="dot" aria-hidden />
      <Icon size={13} aria-hidden />
      {label}
    </Link>
  );
}

function ActiveSession() {
  const { data } = useApp();
  const s = data.cookingSessions.find((x) => x.status !== 'done');
  const now = useNow(s?.status === 'running' ? 1000 : 0);
  if (!s) return null;
  return (
    <Link to={`/learning/session/${s.id}`} className="session-pill" title="Open cooking session">
      <Timer size={14} aria-hidden />
      {formatDuration(sessionElapsed(s, now))}
      {s.status === 'paused' && ' ⏸'}
    </Link>
  );
}

export function Layout() {
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const title = TITLES.find(([re]) => re.test(loc.pathname))?.[1] ?? 'Kitchen OS';
  useEffect(() => {
    document.title = `${title} · Family Kitchen OS`;
    const main = document.querySelector('.main');
    if (main) main.scrollTop = 0;
  }, [loc.pathname, title]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <Brand />
        <nav>
          <NavItems />
        </nav>
        <div className="nav-foot">
          <span>Data stays in your browser unless you connect Google Drive.</span>
        </div>
      </aside>
      <header className="topbar">
        <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setDrawer(true)}>
          <Menu />
        </button>
        <div className="title">{title}</div>
        <ActiveSession />
        <SaveStatus />
      </header>
      <main className="main" id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="bottomnav" aria-label="Quick navigation">
        <NavLink to="/" end>
          <Home aria-hidden />
          Today
        </NavLink>
        <NavLink to="/planner">
          <CalendarDays aria-hidden />
          Plan
        </NavLink>
        <NavLink to="/recipes">
          <BookOpen aria-hidden />
          Recipes
        </NavLink>
        <NavLink to="/grocery">
          <ShoppingCart aria-hidden />
          Grocery
        </NavLink>
        <button type="button" onClick={() => setDrawer(true)} aria-label="More sections">
          <LayoutGrid aria-hidden />
          More
        </button>
      </nav>
      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Navigation">
            <Brand />
            <NavItems onNavigate={() => setDrawer(false)} />
          </div>
        </>
      )}
      <Toasts />
    </div>
  );
}
