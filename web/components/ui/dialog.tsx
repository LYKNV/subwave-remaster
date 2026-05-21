'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../../lib/cn';

export interface FullDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  children?: ReactNode;
  container?: HTMLElement | null;
}

/* V3 Dialog — full-screen overlay used for the settings panel. Pass a
   `container` element to scope it (used by the contained-mode player on the
   landing page); otherwise it covers the whole viewport as before. */
export function FullDialog({ open, onOpenChange, title, children, container }: FullDialogProps) {
  const contained = !!container;
  const pos = contained ? 'absolute' : 'fixed';
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay
          className={cn('v3-drawer-overlay inset-0 z-40 bg-overlay', pos)}
        />
        <Dialog.Content
          className={cn(
            'v3-drawer-content z-50 flex flex-col bg-bg text-ink shadow-drawer',
            pos,
            'inset-x-0 top-0 bottom-0 outline-none',
          )}
        >
          <div className="flex items-baseline justify-between border-b border-ink px-8 py-6">
            <Dialog.Title className="v3-eyebrow m-0 text-[14px] tracking-[0.4em]">
              {title}
            </Dialog.Title>
            <Dialog.Close
              className="v3-focus cursor-pointer text-xl leading-none"
              aria-label="Close"
            >
              ×
            </Dialog.Close>
          </div>
          <div className="v3-scroll flex-1 overflow-auto px-8 py-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
