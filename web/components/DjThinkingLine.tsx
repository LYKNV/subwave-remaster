'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { turnClass, turnText, type TurnDisplayClass } from '@/lib/sessionFeed';
import type { SessionTurn } from '@/lib/types';

// Shows only the DJ's "thinking" — the latest thing said on-air ("voice") or
// the latest pick/request reasoning ("dj"). Aired tracks and system turns
// stay out. Renders under the track info as a small typed line; tapping it
// opens the Booth drawer with the full transcript.
const THINKING_CLASSES = new Set<TurnDisplayClass>(['voice', 'dj']);

const MARKER: Record<string, string> = { voice: '♪', dj: '◇' };

function thinkingText(turn: SessionTurn): string {
  const cls = turnClass(turn);
  const text = turnText(turn);
  return cls === 'voice' ? `"${text}"` : text;
}

export interface DjThinkingLineProps {
  /** Live session messages, oldest first. */
  feed: SessionTurn[] | undefined;
  enabled: boolean;
  onOpenBooth?: () => void;
}

// `feed` is the live session's `messages` array — turns of
// { t, role, kind, text, meta }, oldest first.
export default function DjThinkingLine({ feed, enabled, onOpenBooth }: DjThinkingLineProps) {
  // The newest voice/dj turn — what the DJ is currently "thinking".
  const latest = useMemo<SessionTurn | null>(() => {
    if (!feed?.length) return null;
    for (let i = feed.length - 1; i >= 0; i--) {
      const turn = feed[i];
      if (turn && THINKING_CLASSES.has(turnClass(turn)) && turn.text) return turn;
    }
    return null;
  }, [feed]);

  const full = latest ? thinkingText(latest) : '';

  // Typewriter: re-type from scratch whenever the latest turn changes.
  const [shown, setShown] = useState('');
  const turnId = latest ? `${latest.t}` : '';
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!full) {
      setShown('');
      lastId.current = turnId;
      return;
    }
    if (turnId === lastId.current) {
      // Same turn re-rendered (e.g. the 5s feed poll) — keep finished text.
      setShown(full);
      return;
    }
    lastId.current = turnId;
    setShown('');
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 42);
    return () => clearInterval(id);
  }, [turnId, full]);

  if (!enabled || !latest) return null;

  const cls = turnClass(latest);
  const open = () => onOpenBooth?.();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      title="Open booth feed"
      className="v3-focus mt-[22px] mb-[10px] flex w-full max-w-[78%] cursor-pointer items-baseline gap-2 font-mono text-[12px] leading-[1.55] text-muted"
    >
      <span className="opacity-70" aria-hidden="true">
        {MARKER[cls] || '·'}
      </span>
      <span className="[overflow-wrap:anywhere]">
        {shown}
        <span className="v3-blink ml-px text-vermilion">▍</span>
      </span>
    </div>
  );
}
