// The setup-guide doc pages — order drives both the sidebar contents and
// the prev/next links. Kept in a plain module (no 'use client') so it can be
// imported by both the client nav and the server page components.
//
// The wizard lives at /setup (top-level); these are the deep documentation
// pages an operator reaches via /docs/setup or via the wizard's "I'd rather
// read the docs" escape hatch.
export interface SetupPageEntry {
  href: string;
  label: string;
}

export const SETUP_PAGES: SetupPageEntry[] = [
  { href: '/docs/setup', label: 'Overview' },
  { href: '/docs/setup/prerequisites', label: 'Prerequisites' },
  { href: '/docs/setup/quick-start', label: 'Quick Start' },
  { href: '/docs/setup/manual', label: 'Manual Install' },
  { href: '/docs/setup/development', label: 'Development' },
  { href: '/docs/setup/updates', label: 'Updates & Help' },
];
