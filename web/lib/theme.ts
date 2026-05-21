// Theme mode persistence + apply.
// Three modes: 'system' (default, follows prefers-color-scheme), 'light', 'dark'.
// 'system' is stored as the literal absence of [data-theme] on <html> so CSS
// can fall through to the @media (prefers-color-scheme: dark) block.

import type { ThemeMode } from './types';

export const THEME_KEY = 'subwave-theme';
export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark';
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(THEME_KEY);
  return isThemeMode(v) ? v : 'system';
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (mode === 'light' || mode === 'dark') {
    html.setAttribute('data-theme', mode);
  } else {
    html.removeAttribute('data-theme');
  }
}

export function setTheme(mode: ThemeMode | string): void {
  const m: ThemeMode = isThemeMode(mode) ? mode : 'system';
  if (typeof window !== 'undefined') {
    if (m === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, m);
  }
  applyTheme(m);
}

// Inline string for the pre-hydration <script> in layout.js — applies the
// stored theme before paint so there's no flash of the wrong palette.
export const THEME_INIT_SCRIPT = `
  try {
    var m = localStorage.getItem('${THEME_KEY}');
    if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-theme', m);
  } catch (e) {}
`;
