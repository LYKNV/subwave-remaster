// The manual's page list — order drives both the sidebar contents and the
// prev/next links. Kept in a plain module (no 'use client') so it can be
// imported by both the client nav and the server page components.
export const MANUAL_PAGES = [
  { href: '/manual', label: 'Overview' },
  { href: '/manual/getting-started', label: 'Getting Started' },
  { href: '/manual/requests', label: 'Making Requests' },
  { href: '/manual/dj', label: 'How the DJ Works' },
  { href: '/manual/admin', label: 'Admin & Settings' },
];
