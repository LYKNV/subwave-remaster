'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../lib/cn';
import { Kbd } from './ui/kbd';

const SHORTCUTS = [
  { keys: ['Space', 'K'], label: 'Tune in / out' },
  { keys: ['↑'], label: 'Volume up' },
  { keys: ['↓'], label: 'Volume down' },
  { keys: ['M'], label: 'Mute / unmute' },
  { keys: ['T'], label: 'Toggle theme' },
  { keys: ['1'], label: 'Open Timeline' },
  { keys: ['2'], label: 'Open Booth feed' },
  { keys: ['3', 'R'], label: 'Make a request' },
  { keys: ['?'], label: 'This shortcuts list' },
  { keys: ['⌘K'], label: 'Command palette' },
  { keys: ['Esc'], label: 'Close drawer / dialog' },
];

/* Help dialog listing every player keyboard shortcut. Centered newsprint
   modal — accepts `container` so it stays inside the frame in contained
   mode, matching FullDialog / Modal. */
export default function ShortcutsDialog({ open, onOpenChange, container }) {
  const contained = !!container;
  const pos = contained ? 'absolute' : 'fixed';
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay
          className={cn('v3-drawer-overlay inset-0 z-40', pos)}
          style={{ background: 'var(--overlay)' }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn('v3-modal-pop z-50 left-1/2 top-1/2 outline-none flex flex-col', pos)}
          style={{
            transform: 'translate(-50%, -50%)',
            width: 'min(420px, calc(100vw - 2rem))',
            maxHeight: 'calc(100vh - 3rem)',
            background: 'var(--bg)',
            color: 'var(--ink)',
            border: '1px solid var(--ink)',
            boxShadow: 'var(--drawer-shadow)',
          }}
        >
          <div
            className="flex items-baseline justify-between gap-3 px-6 py-4"
            style={{ borderBottom: '1px solid var(--ink)' }}
          >
            <Dialog.Title
              className="v3-eyebrow m-0"
              style={{ fontSize: 13, letterSpacing: '0.3em' }}
            >
              Keyboard shortcuts
            </Dialog.Title>
            <Dialog.Close
              className="cursor-pointer text-xl leading-none v3-focus"
              aria-label="Close"
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)' }}
            >
              ×
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-auto v3-scroll px-6 py-3">
            <ul className="flex flex-col">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-4 py-2.5"
                  style={{ borderBottom: '1px dashed var(--separator-soft)' }}
                >
                  <span className="text-sm">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
