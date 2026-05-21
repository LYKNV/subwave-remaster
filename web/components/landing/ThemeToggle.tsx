'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getStoredTheme, setTheme as persistTheme } from '../../lib/theme';

// Light/dark toggle for the landing-page masthead. Resolves the *applied*
// theme on mount (a stored manual choice, else prefers-color-scheme), then
// flips between explicit 'light'/'dark' modes on click.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      return;
    }
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    setTheme(t => {
      const next: 'light' | 'dark' = t === 'dark' ? 'light' : 'dark';
      persistTheme(next);
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex cursor-pointer items-center justify-center border-none bg-transparent p-[2px] text-muted"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark'
        ? <Sun className="h-[13px] w-[13px]" aria-hidden="true" />
        : <Moon className="h-[13px] w-[13px]" aria-hidden="true" />}
    </button>
  );
}
