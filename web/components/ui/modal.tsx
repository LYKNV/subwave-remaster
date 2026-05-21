'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../../lib/cn';
import { useDynamicStyle } from '../../hooks/useDynamicStyle';

/* V3 Modal — centered, ink-bordered dialog in the admin newsprint style.
   shadcn-style composition: a header (title + sub + close), a scrollable
   body, and an optional sticky footer for actions.

   It portals into `.admin-root` rather than <body> so the admin-scoped CSS
   (`.input` / `.select` / `.textarea` / `.btn` / `.eyebrow` …) resolves for
   form controls rendered inside it. Falls back to <body> outside the admin
   shell. Controlled: pass `open` + `onOpenChange`. */
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({
  open,
  onOpenChange,
  title,
  sub,
  children,
  footer,
  width = 560,
}: ModalProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>('.admin-root') || document.body);
  }, []);

  // Dynamic width is parameter-driven; the persistent translate keeps the
  // dialog centred between the v3-modal-pop entry animation and its idle
  // resting state.
  const contentRef = useRef<HTMLDivElement>(null);
  useDynamicStyle(contentRef, {
    width: `min(${width}px, calc(100vw - 2rem))`,
    transform: 'translate(-50%, -50%)',
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="v3-drawer-overlay fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          ref={contentRef}
          aria-describedby={undefined}
          className={cn(
            'v3-modal-pop fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-3rem)] flex-col border border-ink bg-[var(--card-bg,var(--bg))] text-ink shadow-drawer outline-none',
          )}
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-ink px-5 py-3">
            <div className="flex min-w-0 items-baseline gap-3">
              <Dialog.Title className="eyebrow m-0 whitespace-nowrap text-ink">
                {title}
              </Dialog.Title>
              {sub && <span className="caption truncate">{sub}</span>}
            </div>
            <Dialog.Close
              className="v3-focus cursor-pointer border-0 bg-transparent p-0 text-[22px] leading-none text-muted"
              aria-label="Close"
            >
              ×
            </Dialog.Close>
          </div>

          <div className="v3-scroll flex-1 overflow-auto px-5 py-4">{children}</div>

          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-ink px-5 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
