'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  ActiveShow,
  DjState,
  ListenerCount,
  NowPlayingResponse,
  NowPlayingTrack,
  SessionPayload,
  StationContext,
  StationState,
} from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface StationFeed {
  nowPlaying: NowPlayingTrack | null;
  context: StationContext | null;
  dj: DjState | null;
  activeShow: ActiveShow | null;
  listeners: ListenerCount | number | null;
  /** null until the first poll resolves — distinguishes "not yet known" from "offline". */
  streamOnline: boolean | null;
  state: StationState;
  session: SessionPayload;
  elapsed: number;
  progress: number;
}

const EMPTY_STATE: StationState = { upcoming: [], history: [], djLog: [] };
const EMPTY_SESSION: SessionPayload = { session: null, messages: [] };

// 5s polling of /now-playing + /state + /session, plus a 1s elapsed tick reset
// on track-change. Single source of truth for "what's on air right now".
export function useStationFeed(): StationFeed {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingTrack | null>(null);
  const [context, setContext] = useState<StationContext | null>(null);
  const [dj, setDj] = useState<DjState | null>(null);
  const [activeShow, setActiveShow] = useState<ActiveShow | null>(null);
  const [listeners, setListeners] = useState<ListenerCount | number | null>(null);
  const [streamOnline, setStreamOnline] = useState<boolean | null>(null);
  const [state, setState] = useState<StationState>(EMPTY_STATE);
  const [session, setSession] = useState<SessionPayload>(EMPTY_SESSION);
  const [elapsed, setElapsed] = useState(0);
  const trackStartRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = async () => {
      try {
        const [npRes, stRes, seRes] = (await Promise.all([
          fetch(`${API_URL}/now-playing`).then(r => r.json()),
          fetch(`${API_URL}/state`).then(r => r.json()),
          fetch(`${API_URL}/session`).then(r => r.json()),
        ])) as [NowPlayingResponse, StationState, SessionPayload];
        setNowPlaying(prev => {
          if (
            npRes.nowPlaying?.title !== prev?.title ||
            npRes.nowPlaying?.artist !== prev?.artist
          ) {
            trackStartRef.current = Date.now();
          }
          return npRes.nowPlaying;
        });
        setContext(npRes.context);
        if (npRes.dj) setDj(npRes.dj);
        setActiveShow(npRes.activeShow ?? npRes.context?.activeShow ?? null);
        if (npRes.listeners != null) setListeners(npRes.listeners);
        if (typeof npRes.streamOnline === 'boolean') setStreamOnline(npRes.streamOnline);
        setState(stRes);
        if (seRes && Array.isArray(seRes.messages)) setSession(seRes);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (trackStartRef.current) {
        setElapsed(Math.floor((Date.now() - trackStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const duration = nowPlaying?.duration ?? 0;
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  return { nowPlaying, context, dj, activeShow, listeners, streamOnline, state, session, elapsed, progress };
}
