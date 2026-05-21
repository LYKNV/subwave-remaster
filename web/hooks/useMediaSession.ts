'use client';

import { useEffect, type RefObject } from 'react';
import type { NowPlayingTrack } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface UseMediaSessionParams {
  tunedIn: boolean;
  nowPlaying: NowPlayingTrack | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  onTune?: () => void;
  onSkip?: () => void;
}

// Wires the browser's Media Session API to the controller's now-playing feed.
// Effect: track + artist + album show on the OS lock screen, in the
// notification shade (Android), in Control Centre (iOS / macOS), and on
// Bluetooth headsets / car displays. Hardware play/pause/headphone buttons
// also route through these handlers.
//
// Tied to the same <audio> element that usePlayer owns, so:
//   • The system "playback state" reflects whether we're tuned in.
//   • Play / pause / stop actions go through usePlayer.tune() so all UI
//     state stays consistent (volume, waveform, transport bar label).
//
// "seekto" / "seekbackward" / "seekforward" are intentionally NOT wired —
// this is a live stream, you can't scrub. Leaving them unset removes the
// scrubber from the lock screen rather than showing a broken one.
//
// Skipping `nexttrack` would be wrong: a listener pressing "next" on their
// headphones expects to skip the *song they're hearing*, which on this
// station means asking the controller to advance. POST /skip does exactly
// that — but we gate it on the skipFn callback so consumers can opt out
// (e.g. an unauthenticated public listener page that shouldn't expose skip).
export function useMediaSession({
  tunedIn,
  nowPlaying,
  audioRef,
  onTune,
  onSkip,
}: UseMediaSessionParams): void {
  // Reflect tune-in / out into the system playback state. The browser uses
  // this to render the play/pause glyph on the lock screen correctly even
  // if the <audio> readyState is still loading.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = tunedIn ? 'playing' : 'paused';
  }, [tunedIn]);

  // Push current track metadata. When the controller has a Subsonic id for
  // the current track, route artwork through /api/cover/:id so the lock
  // screen / CarPlay / Bluetooth display shows the actual album art. The
  // controller proxies the bytes from Subsonic so credentials never leak
  // into the page. Falls back to the app icon when no id is available
  // (jingles, station idents, scanning state).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!('MediaMetadata' in window)) return;

    const title = nowPlaying?.title || 'SUB/WAVE';
    const artist = nowPlaying?.artist || 'Live broadcast';
    const album = nowPlaying?.album || 'SUB/WAVE';
    const subsonicId = nowPlaying?.subsonic_id;

    const artwork: MediaImage[] = subsonicId
      ? [
          // Real cover first; the app icon trails as a fallback in case the
          // Subsonic fetch errors or the track has no embedded art (some
          // browsers will try the next artwork entry when one fails).
          {
            src: `${API_URL}/cover/${encodeURIComponent(subsonicId)}`,
            sizes: '512x512',
            type: 'image/jpeg',
          },
          { src: '/icons/192', sizes: '192x192', type: 'image/png' },
        ]
      : [
          { src: '/icons/192', sizes: '192x192', type: 'image/png' },
          { src: '/icons/512', sizes: '512x512', type: 'image/png' },
        ];

    navigator.mediaSession.metadata = new window.MediaMetadata({
      title,
      artist,
      album,
      artwork,
    });
  }, [nowPlaying?.title, nowPlaying?.artist, nowPlaying?.album, nowPlaying?.subsonic_id]);

  // Action handlers. These are bound once per change to the dependencies so
  // they always close over the latest tune / skip callbacks.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const session = navigator.mediaSession;

    const handlePlay = () => {
      if (!tunedIn) onTune?.();
      else audioRef.current?.play().catch(() => {});
    };
    const handlePause = () => {
      if (tunedIn) onTune?.();
      else audioRef.current?.pause();
    };
    const handleStop = () => {
      if (tunedIn) onTune?.();
    };
    const handleNext = () => {
      onSkip?.();
    };

    try {
      session.setActionHandler('play', handlePlay);
      session.setActionHandler('pause', handlePause);
      session.setActionHandler('stop', handleStop);
      session.setActionHandler('nexttrack', onSkip ? handleNext : null);
      // Explicitly null out actions we don't support so the UI hides them
      // rather than showing greyed-out buttons.
      session.setActionHandler('previoustrack', null);
      session.setActionHandler('seekto', null);
      session.setActionHandler('seekbackward', null);
      session.setActionHandler('seekforward', null);
    } catch {
      // Older Safari throws on unsupported action types — swallow and carry
      // on; the supported subset is still registered.
    }

    return () => {
      try {
        session.setActionHandler('play', null);
        session.setActionHandler('pause', null);
        session.setActionHandler('stop', null);
        session.setActionHandler('nexttrack', null);
      } catch {}
    };
  }, [tunedIn, onTune, onSkip, audioRef]);
}
