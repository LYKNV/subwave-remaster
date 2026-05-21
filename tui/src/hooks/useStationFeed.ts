import { useEffect, useState } from 'react';
import type { SessionTurn } from '../lib/sessionFeed.js';

// 5s polling of /now-playing + /state + /session.
//
// Everything that comes from the controller lives in one combined state
// object so we can decide *at the setState call site* whether anything
// actually changed — if not, the setter returns the previous reference and
// React skips the render entirely. That matters in the TUI: every render is
// a full-frame redraw in the terminal, which flashes visibly. During stable
// periods (no new track, no new booth turn, listener count unchanged) the
// poll produces zero re-renders.
//
// `trackStartedAt` is the timestamp the current track first appeared in a
// poll; <NowPlaying> derives elapsed from it on each render. There is no
// per-second tick — the bar advances on each 5s poll, which is the only
// cadence at which any other state can change anyway.

export interface Track {
  title?: string;
  artist?: string;
  duration?: number;
  requestedBy?: string;
}

export interface WeatherInfo {
  temp?: number;
  condition?: string;
}

export interface DateInfo {
  dayLabel?: string;
}

export interface StationContext {
  weather?: WeatherInfo;
  date?: DateInfo;
  activeShow?: ActiveShow | null;
}

export interface ActiveShow {
  name?: string;
}

export interface DjInfo {
  name?: string;
}

export interface Listeners {
  current?: number;
}

export interface StationState {
  upcoming: Track[];
  history: Track[];
  djLog: unknown[];
}

export interface SessionSnapshot {
  session: unknown;
  messages: SessionTurn[];
}

export interface StationFeed {
  nowPlaying: Track | null;
  trackStartedAt: number | null;
  context: StationContext | null;
  dj: DjInfo | null;
  activeShow: ActiveShow | null;
  listeners: Listeners | null;
  streamOnline: boolean | null;
  state: StationState;
  session: SessionSnapshot;
}

const INITIAL: StationFeed = {
  nowPlaying: null,
  trackStartedAt: null,
  context: null,
  dj: null,
  activeShow: null,
  listeners: null,
  streamOnline: null,
  state: { upcoming: [], history: [], djLog: [] },
  session: { session: null, messages: [] },
};

function trackKey(np: Track | null): string | null {
  return np ? `${np.title}|${np.artist}` : null;
}

interface NowPlayingResponse {
  nowPlaying?: Track | null;
  context?: StationContext;
  dj?: DjInfo;
  activeShow?: ActiveShow | null;
  listeners?: Listeners;
  streamOnline?: boolean;
}

export function useStationFeed(apiUrl: string): StationFeed {
  const [feed, setFeed] = useState<StationFeed>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [npRes, stRes, seRes] = await Promise.all([
          fetch(`${apiUrl}/now-playing`).then(r => r.json() as Promise<NowPlayingResponse>),
          fetch(`${apiUrl}/state`).then(r => r.json() as Promise<StationState>),
          fetch(`${apiUrl}/session`).then(r => r.json() as Promise<SessionSnapshot>),
        ]);
        if (cancelled) return;
        setFeed(prev => {
          const np: Track | null = npRes.nowPlaying ?? null;
          const sameTrack = trackKey(np) === trackKey(prev.nowPlaying);
          const next: StationFeed = {
            nowPlaying: np,
            trackStartedAt: sameTrack ? prev.trackStartedAt : Date.now(),
            context: npRes.context ?? prev.context,
            dj: npRes.dj ?? prev.dj,
            activeShow: npRes.activeShow ?? npRes.context?.activeShow ?? null,
            listeners: npRes.listeners ?? prev.listeners,
            streamOnline: typeof npRes.streamOnline === 'boolean'
              ? npRes.streamOnline
              : prev.streamOnline,
            state: stRes ?? prev.state,
            session: (seRes && Array.isArray(seRes.messages)) ? seRes : prev.session,
          };
          // Skip the render entirely if the polled snapshot is observably
          // identical to what we already have. JSON.stringify is fine here —
          // these objects are small (queue tail + ~120 session turns).
          try {
            if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          } catch { /* fall through to update */ }
          return next;
        });
      } catch { /* keep prior state; next poll retries */ }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [apiUrl]);

  return feed;
}
