'use client';

import { forwardRef } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';

/* shadcn-style Command wrappers over `cmdk`, restyled with the newsprint
   tokens. CommandDialog is hand-built on @radix-ui/react-dialog rather than
   the stock shadcn version — this repo has no stock DialogContent, and the
   `container` prop keeps the palette inside the frame in contained mode. */

export const Command = forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn('flex h-full w-full flex-col overflow-hidden', className)}
    style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    {...props}
  />
));
Command.displayName = 'Command';

export function CommandDialog({
  open,
  onOpenChange,
  container,
  label = 'Command palette',
  children,
}) {
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
          className={cn('z-50 left-1/2 outline-none', pos)}
          style={{
            top: '16%',
            transform: 'translateX(-50%)',
            width: 'min(540px, calc(100vw - 2rem))',
            background: 'var(--bg)',
            color: 'var(--ink)',
            border: '1px solid var(--ink)',
            boxShadow: 'var(--drawer-shadow)',
            animation: 'v3-fade-in 160ms ease-out',
          }}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Command loop>{children}</Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const CommandInput = forwardRef(({ className, ...props }, ref) => (
  <div
    className="flex items-center gap-2 px-4"
    style={{ borderBottom: '1px solid var(--ink)' }}
  >
    <Search size={15} strokeWidth={1.5} style={{ color: 'var(--muted)', flexShrink: 0 }} />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-[var(--muted)]',
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = 'CommandInput';

export const CommandList = forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('v3-scroll max-h-[320px] overflow-y-auto overflow-x-hidden py-1', className)}
    {...props}
  />
));
CommandList.displayName = 'CommandList';

export const CommandEmpty = forwardRef((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm"
    style={{ color: 'var(--muted)' }}
    {...props}
  />
));
CommandEmpty.displayName = 'CommandEmpty';

export const CommandGroup = forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1',
      '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2',
      '[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase',
      '[&_[cmdk-group-heading]]:tracking-[0.3em] [&_[cmdk-group-heading]]:text-[var(--muted)]',
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = 'CommandGroup';

export const CommandItem = forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2.5 text-sm outline-none',
      'data-[selected=true]:bg-[var(--ink)] data-[selected=true]:text-[var(--bg)]',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40',
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = 'CommandItem';
