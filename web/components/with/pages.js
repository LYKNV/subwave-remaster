// The "Listen With" page list — order drives both the sidebar contents and
// the prev/next links. Kept in a plain module (no 'use client') so it can be
// imported by both the client nav and the server page components. Add a new
// client by appending an entry here and dropping in its page component.
export const WITH_PAGES = [
  { href: '/with', label: 'Overview' },
  { href: '/with/vlc', label: 'VLC' },
  { href: '/with/cliamp', label: 'cliamp' },
];
