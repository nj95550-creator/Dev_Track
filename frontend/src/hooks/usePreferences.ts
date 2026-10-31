/**
 * Persist optional appearance/view preferences independently of authentication.
 * Storage failures fall back to usable defaults, and system theme changes update
 * the document only while the user has selected the system appearance option.
 */
import { useEffect, useState } from 'react';
import type { Theme } from '../components/Settings';

/**
 * Read one allowlisted optional setting. Invalid or unavailable storage falls
 * back to a safe UI default rather than preventing the app from loading.
 */
function preference(key: string, allowed: string[], fallback: string) {
  try {
    const value = localStorage.getItem(key);
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
/**
 * Expose React state for theme/view while synchronizing optional localStorage
 * and the document theme. Authentication and workspace records remain server-owned.
 */
export function usePreferences() {
  const [view, setView] = useState(() => preference('devtrack-view', ['grid', 'list'], 'grid'));
  const [theme, setTheme] = useState<Theme>(
    () => preference('devtrack-theme', ['light', 'dark', 'system'], 'light') as Theme,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem('devtrack-theme', theme);
    } catch {
      /* Optional preference. */
    }
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem('devtrack-view', view);
    } catch {
      /* Optional preference. */
    }
  }, [view]);
  return { view, setView, theme, setTheme };
}
