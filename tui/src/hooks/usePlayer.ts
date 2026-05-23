import { useCallback, useEffect, useRef, useState } from 'react';
import { StreamPlayer, type Engine } from '../audio/player.js';

export interface PlayerState {
  tunedIn: boolean;
  volume: number;
  muted: boolean;
  available: boolean;
  supportsVolume: boolean;
  engine: Engine | null;
  toggle: () => void;
  stop: () => void;
  adjustVolume: (delta: number) => void;
  toggleMute: () => void;
}

// Owns the audio child process. Mirrors the web usePlayer: tune in / out,
// volume, mute. Volume is held in React state (0–100, the listener's intent)
// and pushed to the engine whenever it — or the mute toggle — changes.
export function usePlayer(streamUrl: string): PlayerState {
  const ref = useRef<StreamPlayer | null>(null);
  if (!ref.current) ref.current = new StreamPlayer(streamUrl);
  const sp = ref.current;

  const [tunedIn, setTunedIn] = useState(false);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);

  // Push the effective volume to a running engine on every change.
  useEffect(() => {
    if (tunedIn) sp.setVolume(muted ? 0 : volume);
  }, [volume, muted, tunedIn, sp]);

  // If the audio child dies on its own — a crash, or the stream connection
  // dropping — flip `tunedIn` back off so the UI stops claiming a dead
  // process is playing. The listener can press space to re-tune.
  useEffect(() => {
    sp.onExit(() => setTunedIn(false));
  }, [sp]);

  // Kill the child process if the app exits while playback is live.
  useEffect(() => () => sp.stop(), [sp]);

  // Auto-tune-in on mount so the listener doesn't have to press space first.
  useEffect(() => {
    if (!sp.available) return;
    sp.play(muted ? 0 : volume);
    setTunedIn(true);
    // Intentionally only on mount; subsequent volume/mute changes are pushed
    // via the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const toggle = useCallback(() => {
    setTunedIn(prev => {
      if (prev) { sp.stop(); return false; }
      if (!sp.available) return false;
      sp.play(muted ? 0 : volume);
      return true;
    });
  }, [sp, muted, volume]);

  const stop = useCallback(() => { sp.stop(); setTunedIn(false); }, [sp]);

  const adjustVolume = useCallback((delta: number) => {
    setVolume(v => Math.max(0, Math.min(100, v + delta)));
  }, []);

  const toggleMute = useCallback(() => setMuted(m => !m), []);

  return {
    tunedIn, volume, muted,
    available: sp.available,
    supportsVolume: sp.supportsVolume,
    engine: sp.engine,
    toggle, stop, adjustVolume, toggleMute,
  };
}
