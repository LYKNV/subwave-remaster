'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/cn';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  children?: ReactNode;
  container?: HTMLElement | null;
}

/* V3 Sheet — right-side drawer between the top and bottom bars (offset 80px
   each), 460px wide, cream background, 1px ink borders, animates in from the
   right via v3-drawer-content keyframe in globals.css. No exit animation.
   When `container` is supplied the drawer is scoped to that element (used
   for the embedded player on the landing page); otherwise it covers the
   whole viewport as before. */
export function Sheet({ open, onOpenChange, title, children, container }: SheetProps) {
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
            'v3-drawer-content z-50 flex flex-col border-x border-ink bg-bg text-ink shadow-drawer',
            pos,
            contained
              ? 'top-16 right-4 bottom-16 w-[min(420px,calc(100%-32px))]'
              : 'inset-x-0 top-16 bottom-16 w-full sm:top-20 sm:right-24 sm:bottom-20 sm:left-auto sm:w-[460px]',
            'p-5 outline-none sm:p-7',
          )}
          aria-describedby={undefined}
        >
          <div className="mb-5 flex items-baseline justify-between">
            <Dialog.Title className="v3-eyebrow m-0 text-sm tracking-[0.4em]">
              {title}
            </Dialog.Title>
            <Dialog.Close
              className="v3-focus cursor-pointer text-xl leading-none"
              aria-label="Close"
            >
              ×
            </Dialog.Close>
          </div>
          <div className="v3-scroll flex-1 overflow-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
