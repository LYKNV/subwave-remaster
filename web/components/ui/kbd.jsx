'use client';

import { cn } from '../../lib/cn';

/* Small newsprint key-cap badge for rendering shortcut hints. Pure CSS — no
   dependency. Used by the command palette and the shortcuts help dialog. */
export function Kbd({ children, className }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center font-mono leading-none select-none',
        className,
      )}
      style={{
        minWidth: 20,
        height: 20,
        padding: '0 6px',
        fontSize: 11,
        border: '1px solid var(--soft-border)',
        color: 'var(--muted)',
        background: 'transparent',
      }}
    >
      {children}
    </kbd>
  );
}
