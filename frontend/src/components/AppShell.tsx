import {
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { User } from "../types";
import { Brand } from "./Brand";

// Defines the authenticated workspace frame and its responsive navigation state.
export type SectionKey = "overview" | "projects" | "learning-goals";

interface AppShellProps {
  activeSection: SectionKey;
  children: ReactNode;
  onSectionChange: (section: SectionKey) => void;
  onSignOut: () => void;
  user: User;
}

const navigationItems: Array<{
  key: SectionKey;
  label: string;
  glyph: string;
}> = [
  { key: "overview", label: "Overview", glyph: "⌂" },
  { key: "projects", label: "Projects", glyph: "▦" },
  { key: "learning-goals", label: "Learning Goals", glyph: "◎" },
];

const sectionLabels: Record<SectionKey, string> = {
  overview: "Overview",
  projects: "Projects",
  "learning-goals": "Learning Goals",
};

export function AppShell({
  activeSection,
  children,
  onSectionChange,
  onSignOut,
  user,
}: AppShellProps): ReactElement {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const userInitial = user.name.trim().charAt(0).toUpperCase() || "D";

  function selectSection(section: SectionKey): void {
    onSectionChange(section);
    setIsMenuOpen(false);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <button
        aria-label="Close navigation"
        className={`sidebar-overlay${isMenuOpen ? " visible" : ""}`}
        onClick={() => setIsMenuOpen(false)}
        tabIndex={isMenuOpen ? 0 : -1}
        type="button"
      />

      <aside
        aria-label="Primary navigation"
        className={`sidebar${isMenuOpen ? " open" : ""}`}
        id="primary-sidebar"
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            aria-label="Close navigation"
            className="sidebar-close"
            onClick={() => setIsMenuOpen(false)}
            type="button"
          >
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-label">Workspace</span>
          {navigationItems.map((item) => (
            <button
              aria-current={activeSection === item.key ? "page" : undefined}
              className={activeSection === item.key ? "active" : ""}
              key={item.key}
              onClick={() => selectSection(item.key)}
              type="button"
            >
              <span className="nav-glyph" aria-hidden="true">
                {item.glyph}
              </span>
              {item.label}
              {activeSection === item.key && (
                <span className="nav-active-dot" aria-hidden="true" />
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-account">
          <div className="account-details">
            <span className="account-avatar" aria-hidden="true">
              {userInitial}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>@{user.username}</small>
            </span>
          </div>
          <button className="signout-button" onClick={onSignOut} type="button">
            <span aria-hidden="true">↗</span>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="top-header">
          <button
            aria-controls="primary-sidebar"
            aria-expanded={isMenuOpen}
            aria-label="Open navigation"
            className="menu-button"
            onClick={() => setIsMenuOpen(true)}
            type="button"
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
          <div>
            <span>DevTrack workspace</span>
            <h1>{sectionLabels[activeSection]}</h1>
          </div>
          <span
            className="top-header-avatar"
            aria-label={`Signed in as ${user.name}`}
          >
            {userInitial}
          </span>
        </header>

        <main className="main-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
