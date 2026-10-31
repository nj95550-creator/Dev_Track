/**
 * Authenticated workspace frame: sidebar, search and account navigation.
 * Mobile navigation manages focus, page inertness and body scrolling so keyboard
 * and touch users can open and dismiss the same workspace safely.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Target,
  Settings2,
  LogOut,
  ChevronRight,
  Menu,
  X,
  ArrowUpRight,
  Search,
  CircleHelp,
} from 'lucide-react';
import { Brand } from './Brand';
import type { User } from '../types';
export type SectionKey = 'overview' | 'projects' | 'learning-goals' | 'settings';
const items = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'projects', label: 'My projects', icon: FolderKanban },
  { key: 'learning-goals', label: 'Learning goals', icon: Target },
] as const;
const titles = {
  overview: 'Overview',
  projects: 'My projects',
  'learning-goals': 'Learning goals',
  settings: 'Settings',
};
/**
 * Render the frame around the active screen; callbacks remain the parent's
 * navigation/search/mutation boundary and children contain the selected page.
 */
export function AppShell({
  activeSection,
  children,
  onSectionChange,
  onSignOut,
  user,
  projectCount,
  goalCount,
  averageProgress,
  onNewProject,
  onSearch,
  searchValue,
}: {
  activeSection: SectionKey;
  children: ReactNode;
  onSectionChange: (s: SectionKey) => void;
  onSignOut: () => void;
  user: User;
  projectCount: number;
  goalCount: number;
  averageProgress: number;
  onNewProject: () => void;
  onSearch: (q: string) => void;
  searchValue: string;
}) {
  // About navigation can target content that mounts only after Settings opens.
  // Defer scrolling until that section exists and honor reduced-motion preference.
  const privacyRequested = useRef(false);
  useEffect(() => {
    if (activeSection !== 'settings' || !privacyRequested.current) return;
    privacyRequested.current = false;
    const frame = requestAnimationFrame(() =>
      document.getElementById('privacy-note')?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [activeSection]);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 780px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width: 780px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  // An open mobile drawer moves focus inside and locks body scrolling. Closing
  // restores the prior overflow and focuses the menu control without moving the page.
  useEffect(() => {
    if (!mobile || !open) return;
    document.querySelector<HTMLElement>('#sidebar a')?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      document.querySelector<HTMLElement>('.menu-button')?.focus({ preventScroll: true });
    };
  }, [mobile, open]);
  // Escape dismisses navigation; Ctrl/Cmd+K is the implemented global search shortcut.
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('#workspace-search')?.focus();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  /**
   * Delegate the selected section and close the mobile drawer, restoring page
   * interaction through the drawer's existing effect cleanup.
   */
  function navigate(section: SectionKey) {
    onSectionChange(section);
    setOpen(false);
  }
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {open && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        inert={mobile && !open ? true : undefined}
        className={`sidebar ${open ? 'open' : ''}`}
        aria-label="Workspace navigation"
        id="sidebar"
      >
        <div className="sidebar-brand">
          <Brand compact />
          <button
            className="icon-button sidebar-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-letter">{user.name.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{user.isDemo ? 'Demo workspace' : 'Personal workspace'}</strong>
            <small>
              {user.isDemo ? 'Try things out. Make it yours.' : 'A little progress, every day'}
            </small>
          </span>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="sidebar-nav">
          {items.map(({ key, label, icon: Icon }) => (
            <a
              href={`#${key}`}
              key={key}
              aria-current={activeSection === key ? 'page' : undefined}
              className={activeSection === key ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                navigate(key);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key !== 'overview' && <small>{key === 'projects' ? projectCount : goalCount}</small>}
            </a>
          ))}
        </nav>
        <button className="sidebar-new" onClick={onNewProject}>
          <span>+</span> Create a project
        </button>
        <div className="sidebar-bottom">
          <div className="workspace-progress">
            <span>
              One step at a time <ArrowUpRight size={14} />
            </span>
            <strong>
              {averageProgress}
              <small>%</small>
            </strong>
            <div className="mini-progress">
              <span style={{ width: `${averageProgress}%` }} />
            </div>
            <p>
              Average project progress.
              <br />
              Your projects and learning goals.
            </p>
          </div>
          <nav className="sidebar-nav">
            <a
              href="#settings"
              className={activeSection === 'settings' ? 'active' : ''}
              aria-current={activeSection === 'settings' ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate('settings');
              }}
            >
              <Settings2 size={18} />
              <span>Settings & preferences</span>
            </a>
            <button
              onClick={() => {
                if (activeSection === 'settings') {
                  setOpen(false);
                  requestAnimationFrame(() =>
                    document.getElementById('privacy-note')?.scrollIntoView({
                      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'auto'
                        : 'smooth',
                    }),
                  );
                } else {
                  privacyRequested.current = true;
                  navigate('settings');
                }
              }}
            >
              <CircleHelp size={18} />
              <span>About this workspace</span>
            </button>
          </nav>
          <div className="sidebar-account">
            <span className="avatar">
              {user.name
                .trim()
                .split(/\s+/)
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.isDemo ? 'Demo account' : `@${user.username}`}</small>
            </span>
            <button className="icon-button" onClick={onSignOut} aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-workspace" inert={mobile && open ? true : undefined}>
        <header className="top-header">
          <div className="breadcrumb">
            <button
              className="icon-button menu-button"
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="sidebar"
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{titles[activeSection]}</strong>
          </div>
          <div className="header-tools">
            <label className="header-search" htmlFor="workspace-search">
              <Search size={16} />
              <input
                id="workspace-search"
                type="search"
                value={searchValue}
                placeholder="Find a project…"
                aria-label="Search all projects"
                onChange={(e) => onSearch(e.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            <span className="header-date">
              {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
                new Date(),
              )}
            </span>
            <span className="avatar avatar--small">{user.name[0].toUpperCase()}</span>
          </div>
        </header>
        <main className="main-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Made for the work in progress.</span>
          <span>
            DEVTRACK <span className="footer-dot" /> V2.1
          </span>
        </footer>
      </div>
    </div>
  );
}
