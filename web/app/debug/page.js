'use client';

import { useEffect, useState, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function DebugPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (paused) return;
      try {
        const r = await fetch(`${API_URL}/debug`);
        const j = await r.json();
        if (!cancelled) { setData(j); setErr(null); }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [paused]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [data?.liquidsoapLog, autoScroll]);

  return (
    <div className="min-h-screen bg-stone-950 text-amber-50 font-mono text-xs">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-4">
        <header className="flex flex-wrap items-center gap-3 border-b border-amber-900/40 pb-3">
          <h1 className="text-2xl font-black tracking-tighter">
            SUB<span className="text-amber-500">/</span>WAVE
            <span className="text-amber-200/40 font-normal text-sm ml-3">/debug</span>
          </h1>
          <a href="/" className="text-[10px] tracking-widest uppercase text-amber-500/70 hover:text-amber-300 underline underline-offset-4">← back to player</a>
          <div className="ml-auto flex items-center gap-3 text-[10px] tracking-widest uppercase">
            <span className={`flex items-center gap-1 ${err ? 'text-red-400' : 'text-emerald-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${err ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
              {err ? 'down' : 'live'}
            </span>
            <button
              onClick={() => setPaused(!paused)}
              className="border border-amber-700/60 hover:border-amber-400 px-2 py-1 text-amber-200"
            >
              {paused ? 'resume' : 'pause'}
            </button>
            <span className="text-amber-500/50">refresh 2s</span>
          </div>
        </header>

        {err && (
          <div className="border border-red-700/60 bg-red-950/30 px-3 py-2 text-red-300">
            controller error: {err}
          </div>
        )}

        {data && (
          <div className="grid lg:grid-cols-2 gap-4">
            {/* NOW PLAYING */}
            <Panel title="Now playing (now-playing.json)">
              <KV obj={data.nowPlaying} />
            </Panel>

            {/* ICECAST */}
            <Panel title="Icecast">
              <KV obj={data.icecast} />
            </Panel>

            {/* CURRENT REQUEST */}
            <Panel title="Queue · current served request">
              {data.queue.current ? <KV obj={data.queue.current} /> : <Empty>none (auto-playlist)</Empty>}
            </Panel>

            {/* CONTEXT */}
            <Panel title="DJ context">
              <KV obj={data.context} />
            </Panel>

            {/* UPCOMING */}
            <Panel title={`Upcoming queue (${data.queue.upcoming.length})`} fullWidth>
              {data.queue.upcoming.length === 0 ? <Empty>queue empty</Empty> : (
                <ol className="space-y-1">
                  {data.queue.upcoming.map((t, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-amber-500/50 tabular-nums w-6">{i+1}</span>
                      <span className="text-amber-100 truncate flex-1">{t.title} — <span className="text-amber-300/70">{t.artist}</span></span>
                      {t.requestedBy && <span className="text-cyan-400/80">↳ {t.requestedBy}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            {/* DJ LOG */}
            <Panel title={`DJ log (${data.queue.djLogCount} total, last 30)`} fullWidth>
              <div className="space-y-0.5 max-h-72 overflow-y-auto">
                {data.queue.djLog.map(e => (
                  <div key={e.id} className="flex gap-3 leading-relaxed">
                    <span className="text-amber-500/40 tabular-nums shrink-0 w-20">{new Date(e.t).toLocaleTimeString('en-GB', { hour12: false })}</span>
                    <span className={`shrink-0 w-24 ${kindColor(e.kind)}`}>[{e.kind}]</span>
                    <span className="text-amber-100/90 break-all">{e.message}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* OLLAMA */}
            <Panel title={`Ollama recent calls (${data.ollama.recentCalls.length})`} fullWidth>
              <div className="text-amber-500/50 mb-2">{data.ollama.model} @ {data.ollama.url}</div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {data.ollama.recentCalls.length === 0 && <Empty>no calls yet</Empty>}
                {data.ollama.recentCalls.map((c, i) => (
                  <details key={i} className="border border-amber-900/40 px-2 py-1 bg-stone-900/50">
                    <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                      <span className={c.ok ? 'text-emerald-400' : 'text-red-400'}>{c.ok ? '✓' : '✗'}</span>
                      <span className="text-amber-300">{c.kind}</span>
                      <span className="text-amber-200/50">{c.ms}ms</span>
                      <span className="text-amber-500/40 ml-auto">{new Date(c.t).toLocaleTimeString('en-GB', { hour12: false })}</span>
                    </summary>
                    <div className="mt-2 space-y-1 text-[11px]">
                      {c.user && <Field label="user">{c.user}</Field>}
                      {c.systemPreview && <Field label="system…">{c.systemPreview}…</Field>}
                      {c.response && <Field label="response">{c.response}</Field>}
                      {c.error && <Field label="error" tone="err">{c.error}</Field>}
                    </div>
                  </details>
                ))}
              </div>
            </Panel>

            {/* LIQUIDSOAP LOG */}
            <Panel
              title="Liquidsoap log (last 100 lines)"
              fullWidth
              extra={
                <label className="flex items-center gap-1 text-amber-200/70 text-[10px]">
                  <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
                  auto-scroll
                </label>
              }
            >
              <pre
                ref={logRef}
                className="text-[11px] leading-snug max-h-96 overflow-y-auto whitespace-pre-wrap break-all text-amber-200/80 bg-stone-950/80 p-2 border border-amber-900/30"
              >
                {data.liquidsoapLog}
              </pre>
            </Panel>

            {/* STATE FILES */}
            <Panel title="State dir /var/sub-wave">
              <Files files={data.stateFiles} />
            </Panel>

            {/* VOICE FILES */}
            <Panel title={`DJ voice WAVs (${data.voiceFiles?.length ?? 0})`}>
              <Files files={data.voiceFiles} />
            </Panel>

            {/* CONFIG */}
            <Panel title="Config (redacted)" fullWidth>
              <KV obj={data.config} />
            </Panel>
          </div>
        )}

        {!data && !err && <div className="text-amber-200/40 italic">connecting…</div>}
      </div>
    </div>
  );
}

function Panel({ title, children, fullWidth, extra }) {
  return (
    <section className={`border border-amber-900/40 bg-stone-900/30 ${fullWidth ? 'lg:col-span-2' : ''}`}>
      <div className="px-3 py-1.5 border-b border-amber-900/40 bg-amber-950/20 flex items-center justify-between">
        <span className="text-[10px] tracking-[0.3em] text-amber-500/80 uppercase">{title}</span>
        {extra}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function KV({ obj }) {
  if (!obj) return <Empty>—</Empty>;
  return (
    <div className="space-y-0.5">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="text-amber-500/60 shrink-0 w-32 truncate">{k}</span>
          <span className="text-amber-100/95 break-all flex-1">
            {v === null ? <em className="text-amber-200/30">null</em>
              : typeof v === 'object' ? <pre className="text-[11px] inline whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
              : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Files({ files }) {
  if (!files || files.error) return <Empty>{files?.error || 'no files'}</Empty>;
  return (
    <div className="space-y-0.5">
      {files.map(f => (
        <div key={f.name} className="flex gap-3">
          <span className={`shrink-0 w-44 truncate ${f.isDir ? 'text-cyan-400/80' : 'text-amber-100'}`}>
            {f.isDir ? '📁 ' : ''}{f.name}
          </span>
          <span className="text-amber-500/50 tabular-nums w-16 text-right shrink-0">{fmtSize(f.size)}</span>
          <span className="text-amber-500/40 ml-auto shrink-0">{f.mtime ? new Date(f.mtime).toLocaleTimeString('en-GB', { hour12: false }) : ''}</span>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children, tone }) {
  return (
    <div className="flex gap-2">
      <span className="text-amber-500/60 shrink-0 w-16">{label}</span>
      <span className={`${tone === 'err' ? 'text-red-300' : 'text-amber-100/90'} whitespace-pre-wrap break-all`}>{children}</span>
    </div>
  );
}

function Empty({ children }) {
  return <div className="text-amber-200/30 italic">{children}</div>;
}

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function kindColor(k) {
  switch (k) {
    case 'playing': return 'text-emerald-400';
    case 'queued': return 'text-amber-200/70';
    case 'request': return 'text-cyan-400';
    case 'dj-speak':
    case 'hourly-check':
    case 'weather':
    case 'station-id': return 'text-amber-400';
    case 'scheduler': return 'text-fuchsia-300/80';
    case 'error':
    case 'miss': return 'text-red-400';
    default: return 'text-amber-200/60';
  }
}
