'use client';

import { cn } from '@/lib/cn';

interface FigureProps {
  src?: string;
  alt?: string;
  caption?: string;
  label?: string;
  ratio?: '16 / 10' | '9 / 16';
}

// Screenshot slot for the /what feature story. While `src` is empty it renders
// a labelled placeholder box; pass `src` later and the same component swaps in
// the real image — no layout change.
export default function Figure({ src, alt, caption, label, ratio = '16 / 10' }: FigureProps) {
  const aspectClass = ratio === '9 / 16' ? 'aspect-[9/16]' : 'aspect-[16/10]';
  return (
    <figure className="m-0 flex flex-col gap-2">
      {src ? (
        <img
          src={src}
          alt={alt || caption || label || ''}
          className="block h-auto w-full border border-ink object-contain"
        />
      ) : (
        <div
          role="img"
          aria-label={alt || `Placeholder: ${label}`}
          className={cn(
            'flex items-center justify-center border border-dashed border-separator-strong bg-overlay p-4 text-center',
            aspectClass,
          )}
        >
          <span className="text-[11px] font-bold tracking-[0.24em] text-muted uppercase">
            {label || 'Screenshot'}
          </span>
        </div>
      )}
      {caption && (
        <figcaption className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
          <span className="font-bold text-vermilion">FIG.&nbsp;</span>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
