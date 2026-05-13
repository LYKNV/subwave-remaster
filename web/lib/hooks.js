'use client';

import { useEffect, useRef, useState } from 'react';

export function useClock() {
  const [t, setT] = useState(null);
  useEffect(() => {
    setT(new Date());
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

// Pseudo-random animated spectrum used as fallback when the real analyser
// can't attach (CORS, paused, no AudioContext, etc.). Values in [0, 1].
export function useSpectrum(bins = 120, active = true, speed = 60) {
  const [arr, setArr] = useState(() => Array(bins).fill(0.1));
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setArr(prev => prev.map((v, i) => {
        const target = Math.pow(Math.random(), 1.4) * (1 - i / (bins * 2.2));
        return v + (target - v) * 0.45;
      }));
    }, speed);
    return () => clearInterval(id);
  }, [active, bins, speed]);
  return arr;
}

// Web Audio analyser hook — wires an AnalyserNode to the given <audio> ref
// the first time `active` flips true, then writes per-frame frequency bytes
// into an internal ref read via `read()`. Returns `{ ready, read }`. If CORS
// or anything else blocks attachment, `ready` stays false and `read()` returns
// null — callers should fall back to `useSpectrum`.
export function useAnalyser(audioRef, active) {
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const binsRef = useRef(null);
  const probedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active || !audioRef?.current) return;
    let cancelled = false;
    const audioEl = audioRef.current;
    let probeInterval = null;
    let onPlaying = null;
    (async () => {
      try {
        if (!ctxRef.current) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctxRef.current = new AC();
        }
        if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();
        if (!sourceRef.current) {
          sourceRef.current = ctxRef.current.createMediaElementSource(audioEl);
          analyserRef.current = ctxRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          analyserRef.current.smoothingTimeConstant = 0.78;
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(ctxRef.current.destination);
          binsRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        }
        if (cancelled) return;
        setReady(true);

        // iOS Safari quirk: createMediaElementSource() on a live HTTP MP3 stream
        // wires up cleanly but the analyser only ever returns zeros. Probe once
        // after playback actually starts — if no samples land in ~600 ms, flip
        // ready=false so the pseudo-random useSpectrum fallback takes over.
        if (probedRef.current) return;
        onPlaying = () => {
          if (probedRef.current || cancelled) return;
          probedRef.current = true;
          let max = 0;
          let ticks = 0;
          probeInterval = setInterval(() => {
            if (cancelled) { clearInterval(probeInterval); probeInterval = null; return; }
            analyserRef.current.getByteFrequencyData(binsRef.current);
            for (let i = 0; i < binsRef.current.length; i++) {
              if (binsRef.current[i] > max) max = binsRef.current[i];
            }
            if (++ticks >= 12) {
              clearInterval(probeInterval);
              probeInterval = null;
              if (max === 0) {
                try { sourceRef.current?.disconnect(); } catch {}
                try { analyserRef.current?.disconnect(); } catch {}
                setReady(false);
              }
            }
          }, 50);
        };
        audioEl.addEventListener('playing', onPlaying, { once: true });
        if (!audioEl.paused && audioEl.readyState >= 2) onPlaying();
      } catch {
        // CORS or other failure — stay not-ready
      }
    })();
    return () => {
      cancelled = true;
      if (probeInterval) clearInterval(probeInterval);
      if (onPlaying && audioEl) audioEl.removeEventListener('playing', onPlaying);
    };
  }, [active, audioRef]);

  const read = () => {
    if (!ready || !analyserRef.current || !binsRef.current) return null;
    analyserRef.current.getByteFrequencyData(binsRef.current);
    return binsRef.current;
  };

  return { ready, read };
}
