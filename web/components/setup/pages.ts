// The setup guide's page list — order drives both the sidebar contents and
// the prev/next links. Kept in a plain module (no 'use client') so it can be
// imported by both the client nav and the server page components.
export interface SetupPageEntry {
  href: string;
  label: string;
}

export const SETUP_PAGES: SetupPageEntry[] = [
  { href: '/setup', label: 'Overview' },
  { href: '/setup/prerequisites', label: 'Prerequisites' },
  { href: '/setup/quick-start', label: 'Quick Start' },
  { href: '/setup/manual', label: 'Manual Install' },
  { href: '/setup/development', label: 'Development' },
  { href: '/setup/updates', label: 'Updates & Help' },
];
