'use client';

import { buildTagline } from '@/lib/tagline';
import { cn } from '@/lib/cn';
import { Slider } from './ui/slider';
import type { NowPlayingTrack, StationContext } from '@/lib/types';
import type { PlayerStatus } from '@/hooks/usePlayer';

export interface TransportBarProps {
  tunedIn: boolean;
  status?: PlayerStatus;
  onTune: () => void;
  offline?: boolean;
  volume: number;
  setVolume: (v: number) => void;
  nowPlaying: NowPlayingTrack | null;
  elapsed: number;
  context: StationContext | null;
}

const VOLUME_CELLS = 12;

export default function TransportBar({
  tunedIn,
  status = 'idle',
  onTune,
  offline = false,
  volume,
  setVolume,
  nowPlaying,
  elapsed,
  context,
}: TransportBarProps) {
  // The window between the tune-in gesture and the first audible frame —
  // surfaced on the button so the player doesn't claim to play while silent.
  const connecting = status === 'connecting';
  const duration = nowPlaying?.duration ?? 0;
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;
  const lit = Math.round(volume * VOLUME_CELLS);

  // Track info lives in the CenterStage on desktop, so the footer's centre
  // slot stays empty there. On mobile it carries the context tagline (the
  // vibe/weather line the header hides below md).
  const tagline = buildTagline(context);

  return (
    <div className="absolute right-0 bottom-0 left-0 z-20 bg-bg [border-top:none] sm:[border-top:1px_solid_var(--ink)]">
      {/* Hairline progress along the top edge of the bar. */}
      {duration > 0 && (
        <div
          className="pointer-events-none absolute -top-px left-0 h-0.5 w-[var(--progress)] bg-vermilion"
          data-progress={`${progress * 100}%`}
          ref={(el) => { if (el) el.style.setProperty('--progress', `${progress * 100}%`); }}
          aria-hidden="true"
        />
      )}

      <div
        // Bottom inset keeps the Tune In / volume row clear of the iPhone
        // home indicator when installed (viewport-fit=cover). Side insets
        // matter for landscape on notched phones; top stays fixed so the
        // hairline progress bar above this row sits flush.
        className="flex items-center gap-3 pt-3
          pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)]
          pl-[max(1rem,env(safe-area-inset-left))] sm:gap-6
          sm:pt-5 sm:pr-[max(2rem,env(safe-area-inset-right))]
          sm:pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)] sm:pl-[max(2rem,env(safe-area-inset-left))]"
      >
        <button
          onClick={offline ? undefined : onTune}
          disabled={offline}
          aria-disabled={offline}
          title={offline ? 'The station is currently off air' : undefined}
          className={cn(
            'v3-eyebrow v3-focus flex shrink-0 items-center gap-[10px] px-4 py-3 sm:px-7 sm:py-[14px]',
            offline
              ? 'cursor-not-allowed border border-muted bg-bg text-muted'
              : 'cursor-pointer border-0 bg-ink text-bg',
          )}
        >
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              connecting && 'v3-connecting-pulse',
              offline
                ? 'bg-muted'
                : tunedIn
                  ? 'bg-vermilion'
                  : 'bg-[#5a5048]',
            )}
          />
          {offline ? 'Stream Offline' : connecting ? 'Connecting…' : tunedIn ? 'Tune Out' : 'Tune In'}
        </button>

        {/* Centre slot — empty spacer on desktop, context tagline on mobile. */}
        <div
          className="v3-caption flex min-w-0 flex-1 items-center truncate text-muted"
          title={tagline ?? ''}
        >
          {tagline && <span className="truncate sm:hidden">{tagline}</span>}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-[10px]">
          <span className="v3-caption hidden text-muted sm:inline">Vol</span>
          <div className="relative flex h-[18px] w-[52px] items-center gap-0.5 sm:w-20">
            {Array.from({ length: VOLUME_CELLS }).map((_, i) => (
              <span
                key={i}
                className={cn('h-full flex-1 border border-ink', i < lit ? 'bg-ink' : 'bg-transparent')}
              />
            ))}
            {/* Interaction layer only — the lit cells above are the visible
                control, so the Slider is overlaid invisibly. */}
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[volume]}
              onValueChange={([v]) => setVolume(v ?? 0)}
              aria-label="Volume"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
