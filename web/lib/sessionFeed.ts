// Shared display helpers for live-session turns served by GET /session.
//
// A session turn is { t, role, kind, text, meta }. The live session is the
// single source of truth for the booth log everywhere it's shown to people:
// the player Booth feed, the player broadcast ticker, and /admin/dash. The
// controller's in-memory `djLog` is operator diagnostics only — it stays
// behind /admin/debug.
//
// role → display class:
//   voice  — spoken on-air verbatim (links, station IDs, time, weather)
//   dj     — the DJ agent's pick / request reasoning (the "thinking")
//   track  — a track that aired
//   system — system events (session start, pick prompts, restarts)

import type { SessionTurn } from './types';

export type TurnDisplayClass = 'voice' | 'dj' | 'track' | 'system';

export function turnClass(turn: SessionTurn | null | undefined): TurnDisplayClass {
  switch (turn?.role) {
    case 'segment': return 'voice';
    case 'dj':      return 'dj';
    case 'track':   return 'track';
    default:        return 'system';
  }
}

export const isVoice = (turn: SessionTurn | null | undefined): boolean =>
  turnClass(turn) === 'voice';

// "DJ" view = everything the DJ personally said or decided.
export const isDjTurn = (turn: SessionTurn | null | undefined): boolean => {
  const c = turnClass(turn);
  return c === 'voice' || c === 'dj';
};

// Session turns carry no id — derive a stable React key from timestamp + index.
export function turnKey(turn: SessionTurn | null | undefined, i: number): string {
  return `${turn?.t || 'x'}-${i}`;
}

// Plain display text. `track` turns already carry a "▶ …" prefix in their
// text; strip it so callers can supply their own marker.
export function turnText(turn: SessionTurn | null | undefined): string {
  const text = turn?.text || '';
  if (turnClass(turn) === 'track') return text.replace(/^▶\s*/, '');
  return text;
}
