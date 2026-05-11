'use client';

import { useState, useEffect, useRef } from 'react';
import { Radio, CloudRain, Sun, Moon, Sparkles } from 'lucide-react';
import Receiver from '../components/Receiver';
import RequestLine from '../components/RequestLine';
import BoothFeed from '../components/BoothFeed';
import Clock from '../components/Clock';

// Defaults are same-origin paths — the production deployment puts Caddy in
// front and routes /stream.mp3 → icecast and /api/* → controller. In dev,
// override via web/.env.local (see .env.example) to point at the boxes
// directly.
const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL || '/stream.mp3';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function ListenerPage() {
  const [tunedIn, setTunedIn] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [context, setContext] = useState(null);
  const [state, setState] = useState({ upcoming: [], history: [], djLog: [] });
  const [requestText, setRequestText] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const tick = async () => {
      try {
        const [npRes, stRes] = await Promise.all([
          fetch(`${API_URL}/now-playing`).then(r => r.json()),
          fetch(`${API_URL}/state`).then(r => r.json()),
        ]);
        setNowPlaying(npRes.nowPlaying);
        setContext(npRes.context);
        setState(stRes);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const tuneIn = () => {
    if (!audioRef.current) return;
    if (tunedIn) {
      audioRef.current.pause();
      audioRef.current.src = '';
      setTunedIn(false);
    } else {
      audioRef.current.src = `${STREAM_URL}?t=${Date.now()}`;
      audioRef.current.volume = volume;
      audioRef.current.play().catch(err => console.error('Play failed:', err));
      setTunedIn(true);
    }
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const submitRequest = async () => {
    if (!requestText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitMessage(null);
    try {
      const res = await fetch(`${API_URL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: requestText.trim(), name: requesterName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitMessage({ kind: 'ok', text: `${data.ack || 'Request received.'} (${data.track.title} — ${data.track.artist})` });
        setRequestText('');
      } else {
        setSubmitMessage({ kind: 'miss', text: data.message || 'No match.' });
      }
    } catch (err) {
      setSubmitMessage({ kind: 'err', text: 'Request failed. Is the controller up?' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitMessage(null), 8000);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-amber-50 font-mono relative overflow-hidden">
      <audio ref={audioRef} crossOrigin="anonymous" preload="auto" />
      <div className="pointer-events-none fixed inset-0 z-0" style={{
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
      }} />

      <div className="relative z-10 max-w-7xl mx-auto p-6 lg:p-10">
        <Header context={context} tunedIn={tunedIn} />

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Receiver
              nowPlaying={nowPlaying}
              tunedIn={tunedIn}
              volume={volume}
              setVolume={setVolume}
              onTune={tuneIn}
              audioRef={audioRef}
              streamUrl={STREAM_URL}
            />
            <RequestLine
              requesterName={requesterName}
              setRequesterName={setRequesterName}
              requestText={requestText}
              setRequestText={setRequestText}
              isSubmitting={isSubmitting}
              submitMessage={submitMessage}
              onSubmit={submitRequest}
            />
            <BoothFeed entries={state.djLog} />
          </div>

          <div className="space-y-6">
            <UpNext upcoming={state.upcoming} />
            <Played history={state.history} />
          </div>
        </div>

        <footer className="mt-12 pt-6 border-t border-amber-900/40 text-[10px] text-amber-500/40 tracking-widest uppercase flex justify-between">
          <span>SUB/WAVE v0.1 · Liquidsoap · Icecast · Qwen 2.5</span>
          <span>192kbps mp3</span>
        </footer>
      </div>
    </div>
  );
}

function Header({ context, tunedIn }) {
  return (
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 border-b border-amber-900/40 pb-6">
      <div>
        <div className="flex items-center gap-3 text-amber-500/70 text-xs tracking-[0.3em] uppercase mb-2">
          <span className="relative inline-flex">
            <Radio className="w-3 h-3" />
            {tunedIn && (
              <span className="absolute inset-0 -m-1 rounded-full bg-amber-500/30 animate-halo-soft" />
            )}
          </span>
          <span>Live · Single stream · One frequency</span>
        </div>
        <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-none">
          SUB<span className="text-amber-500">/</span>WAVE
        </h1>
        <p className="text-amber-200/40 text-sm mt-2 italic">
          broadcasting from the homelab — Liquidsoap × Icecast × Ollama
        </p>
      </div>

      <div className="border border-amber-900/40 bg-stone-900/40 px-4 py-3 min-w-[200px]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] tracking-[0.3em] text-amber-500/60 uppercase">UTC</span>
          <span className="text-[9px] tracking-[0.3em] text-amber-500/60 uppercase">98.7 FM</span>
        </div>
        <Clock />
        {context && (
          <div className="flex flex-col gap-1 text-xs text-amber-200/55 mt-3">
            <Badge icon={<TimeIcon period={context.time.period} />} label={context.time.period.replace('-', ' ')} />
            <Badge icon={<WeatherIcon condition={context.weather.condition} />} label={`${context.weather.condition} · ${context.weather.temp ?? '–'}°C`} />
            {context.festival && <Badge icon={<Sparkles className="w-3 h-3" />} label={context.festival.name} />}
          </div>
        )}
      </div>
    </header>
  );
}

function Badge({ icon, label }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      {icon}<span className="tracking-widest uppercase text-[10px]">{label}</span>
    </div>
  );
}

function TimeIcon({ period }) {
  return period.includes('night') || period.includes('evening')
    ? <Moon className="w-3 h-3" />
    : <Sun className="w-3 h-3" />;
}

function WeatherIcon({ condition }) {
  return condition === 'rainy' || condition === 'foggy' || condition === 'stormy'
    ? <CloudRain className="w-3 h-3" />
    : <Sun className="w-3 h-3" />;
}

function UpNext({ upcoming }) {
  return (
    <section className="border border-amber-900/40 bg-stone-900/30">
      <div className="flex items-center justify-between px-5 py-2 border-b border-amber-900/40 bg-amber-950/20">
        <span className="text-[10px] tracking-[0.3em] text-amber-500/80 uppercase">Up Next</span>
        <span className="text-[10px] text-amber-500/60 tabular-nums">{upcoming.length}</span>
      </div>
      <div className="divide-y divide-amber-900/20">
        {upcoming.length === 0 && (
          <div className="p-5 flex items-start gap-3 text-xs text-amber-200/40">
            <Radio className="w-4 h-4 mt-0.5 text-amber-500/50 shrink-0" />
            <div className="leading-relaxed">
              DJ on autopilot.<br />
              <span className="text-amber-200/30 italic">Drop a request and they'll spin it.</span>
            </div>
          </div>
        )}
        {upcoming.map((t, i) => (
          <div key={i} className="p-3 px-5">
            <div className="flex items-baseline gap-3">
              <span className="text-amber-500/50 text-xs tabular-nums w-4">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate text-amber-100">{t.title}</div>
                <div className="text-xs text-amber-200/50 truncate">{t.artist}</div>
                {t.requestedBy && <div className="text-[10px] text-cyan-400/80 mt-0.5">↳ {t.requestedBy}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Played({ history }) {
  return (
    <section className="border border-amber-900/40 bg-stone-900/30">
      <div className="px-5 py-2 border-b border-amber-900/40 bg-amber-950/20">
        <span className="text-[10px] tracking-[0.3em] text-amber-500/80 uppercase">Played</span>
      </div>
      <div className="divide-y divide-amber-900/20 max-h-96 overflow-y-auto sw-scroll">
        {history.length === 0 && (
          <div className="p-5 text-xs text-amber-200/30 italic">no history yet</div>
        )}
        {history.map((t, i) => (
          <div key={i} className="p-3 px-5 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-amber-200/75 truncate">{t.title}</div>
              <div className="text-xs text-amber-200/40 truncate">{t.artist}</div>
            </div>
            {t.t && (
              <div className="text-[10px] text-amber-500/40 tabular-nums shrink-0 mt-0.5">
                {relTime(t.t)}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function relTime(t) {
  const diff = (Date.now() - new Date(t).getTime()) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
