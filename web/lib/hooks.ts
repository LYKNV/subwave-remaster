'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

export function useClock(): Date | null {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => {
    setT(new Date());
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

// Pseudo-random animated spectrum used as a fallback when the real analyser
// can't attach — notably iOS Safari, where createMediaElementSource on a live
// HTTP MP3 stream returns silence (WebKit limitation with no app-level
// workaround short of shipping a WASM MP3 decoder). Values in [0, 1].
export function useSpectrum(bins = 120, active = true, speed = 60): number[] {
  const [arr, setArr] = useState<number[]>(() => Array(bins).fill(0.1));
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

export interface Analyser {
  ready: boolean;
  read: () => Uint8Array<ArrayBuffer> | null;
}

// Older Safari exposes AudioContext as webkitAudioContext.
type AudioContextCtor = typeof AudioContext;
interface WebkitWindow {
  webkitAudioContext?: AudioContextCtor;
}

// Web Audio analyser hook — wires an AnalyserNode to the given <audio> ref
// the first time `active` flips true, then writes per-frame frequency bytes
// into an internal ref read via `read()`. Returns `{ ready, read }`. If CORS
// or anything else blocks attachment, `ready` stays false and `read()` returns
// null — callers should fall back to `useSpectrum`.
export function useAnalyser(
  audioRef: RefObject<HTMLAudioElement | null> | null | undefined,
  active: boolean,
): Analyser {
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const binsRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const probedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active || !audioRef?.current) return;
    let cancelled = false;
    const audioEl = audioRef.current;
    let probeInterval: ReturnType<typeof setInterval> | null = null;
    let onPlaying: (() => void) | null = null;
    (async () => {
      try {
        if (!ctxRef.current) {
          const AC: AudioContextCtor | undefined =
            window.AudioContext || (window as Window & WebkitWindow).webkitAudioContext;
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
            if (cancelled) {
              if (probeInterval) clearInterval(probeInterval);
              probeInterval = null;
              return;
            }
            const bins = binsRef.current;
            const an = analyserRef.current;
            if (!bins || !an) return;
            an.getByteFrequencyData(bins);
            for (let i = 0; i < bins.length; i++) {
              const v = bins[i] ?? 0;
              if (v > max) max = v;
            }
            if (++ticks >= 12) {
              if (probeInterval) clearInterval(probeInterval);
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

  const read = (): Uint8Array<ArrayBuffer> | null => {
    if (!ready || !analyserRef.current || !binsRef.current) return null;
    analyserRef.current.getByteFrequencyData(binsRef.current);
    return binsRef.current;
  };

  return { ready, read };
}
