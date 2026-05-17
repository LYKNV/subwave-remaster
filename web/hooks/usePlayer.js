'use client';

import { useEffect, useRef, useState } from 'react';

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL || '/stream.mp3';

// Owns the <audio> element + tune-in state. The audioRef must be attached to
// an <audio> tag rendered by the consumer (so the Waveform's Web Audio API
// can also reach it).
export function usePlayer({ initialVolume = 1 } = {}) {
  const audioRef = useRef(null);
  const [tunedIn, setTunedIn] = useState(false);
  const [volume, setVolume] = useState(initialVolume);
  const preMuteVolume = useRef(initialVolume || 1);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Tear down playback. Used by the Tune Out button and by PlayerApp when the
  // station goes off air, so the <audio> element isn't left retrying a dead
  // mount.
  const stop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = '';
    setTunedIn(false);
  };

  const tune = () => {
    if (!audioRef.current) return;
    if (tunedIn) {
      stop();
    } else {
      audioRef.current.src = `${STREAM_URL}?t=${Date.now()}`;
      audioRef.current.volume = volume;
      audioRef.current.play().catch(err => console.error('Play failed:', err));
      setTunedIn(true);
    }
  };

  // Mute is just volume 0; toggling restores the last non-zero level so the
  // keyboard 'M' shortcut and the command palette have a sensible round-trip.
  const toggleMute = () => {
    if (volume > 0) {
      preMuteVolume.current = volume;
      setVolume(0);
    } else {
      setVolume(preMuteVolume.current || 1);
    }
  };

  return { audioRef, tunedIn, volume, setVolume, tune, stop, toggleMute, muted: volume === 0 };
}
