'use client';

/* Admin Stats page — usage rollups for the LLM and TTS call rings plus DJ
   activity. Polls the controller's /stats endpoint, which aggregates the
   in-memory call buffers (since boot, lost on restart). Deliberately carries
   only rollups — the raw per-call lists live on /debug. */

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../../lib/adminAuth';
import { useDynamicStyle } from '../../hooks/useDynamicStyle';
import { V3Alert } from '../ui/alert';
import { Card, Btn, Pill, Eyebrow } from './ui';
import { cn } from '../../lib/cn';

// --- types --------------------------------------------------------------

interface LatencyStats {
  avg?: number;
  p95?: number;
  max?: number;
}

interface TokenStats {
  total?: number;
  input?: number;
  output?: number;
}

interface ByKindRow {
  kind: string;
  count: number;
  ok: number;
  avgMs?: number;
  tokens?: number;
}

interface ByModelRow {
  model: string;
  count: number;
  tokens?: number;
}

interface ByEngineRow {
  engine: string;
  count: number;
  ok: number;
  avgMs?: number;
}

interface ByTtsKindRow {
  kind: string;
  count: number;
  avgMs?: number;
}

interface ByDjKindRow {
  kind: string;
  count: number;
}

interface LlmStats {
  window: number;
  count: number;
  ok: number;
  failed: number;
  successRate?: number;
  latency: LatencyStats;
  tokens?: TokenStats;
  agent: { calls: number; avgSteps?: number; avgTools?: number };
  byKind: ByKindRow[];
  byModel: ByModelRow[];
  activeModel?: string;
}

interface TtsStats {
  window: number;
  count: number;
  ok: number;
  failed: number;
  latency: LatencyStats;
  fellBack: number;
  fallbackRate?: number;
  chars?: number;
  byEngine: ByEngineRow[];
  byKind: ByTtsKindRow[];
}

interface DjLogStats {
  count: number;
  byKind: ByDjKindRow[];
}

interface StatsResponse {
  llm?: LlmStats;
  tts?: TtsStats;
  djLog?: DjLogStats;
  error?: string;
}

// --- formatters ---------------------------------------------------------

const fmtInt = (n: number | null | undefined): string =>
  n == null ? '—' : Number(n).toLocaleString('en-GB');

const fmtMs = (n: number | null | undefined): string => {
  if (n == null) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
};

const fmtPct = (n: number | null | undefined): string =>
  n == null ? '—' : `${Math.round(n * 100)}%`;

const fmtTokens = (n: number | null | undefined): string => {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
};

// --- small building blocks ---------------------------------------------

interface StatCellProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
  danger?: boolean;
  last?: boolean;
}

function StatCell({ label, value, sub, accent, danger, last }: StatCellProps) {
  const tone = danger ? 'text-[var(--danger)]' : accent ? 'text-vermilion' : '';
  return (
    <div
      className={cn(
        'grid gap-[3px] p-3.5',
        !last && 'border-r border-separator-soft',
      )}
    >
      <span className="caption">{label}</span>
      <span className={cn('mono-num text-[22px] leading-[1.1] font-bold', tone)}>
        {value}
      </span>
      {sub && <span className="caption text-muted">{sub}</span>}
    </div>
  );
}

interface MetricStripProps {
  children: ReactNode;
}

function MetricStrip({ children }: MetricStripProps) {
  const count = Array.isArray(children) ? children.length : 1;
  const ref = useRef<HTMLDivElement>(null);
  useDynamicStyle(ref, { gridTemplateColumns: `repeat(${count}, 1fr)` });
  return (
    <div
      ref={ref}
      className="strip-mobile grid border-b border-separator-strong"
    >
      {children}
    </div>
  );
}

interface BarProps {
  frac?: number;
}

function Bar({ frac }: BarProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useDynamicStyle(ref, { width: `${Math.max(2, Math.round((frac || 0) * 100))}%` });
  return (
    <span className="inline-block h-1.5 w-14 overflow-hidden rounded-[2px] bg-separator-soft align-middle">
      <span ref={ref} className="block h-full bg-vermilion" />
    </span>
  );
}

interface TableColumn<R> {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right' | 'center';
  render?: (row: R) => ReactNode;
}

interface TableProps<R> {
  cols: TableColumn<R>[];
  rows?: R[];
  empty: ReactNode;
}

function Table<R>({ cols, rows, empty }: TableProps<R>) {
  if (!rows?.length) {
    return <span className="field-hint italic">{empty}</span>;
  }
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {cols.map(c => (
            <th
              key={c.key}
              className={cn(
                'caption border-b border-separator-strong px-2 py-1 whitespace-nowrap',
                c.align === 'right' && 'text-right',
                c.align === 'center' && 'text-center',
              )}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map(c => (
              <td
                key={c.key}
                className={cn(
                  'border-b border-separator-soft px-2 py-1 text-[12px]',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                )}
              >
                {c.render ? c.render(r) : ((r as Record<string, unknown>)[c.key] as ReactNode)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- panel --------------------------------------------------------------

export default function StatsPanel() {
  const { adminFetch, needsAuth, hydrated } = useAdminAuth();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!hydrated || needsAuth) return;
    let cancelled = false;
    const tick = async () => {
      if (paused) return;
      try {
        const r = await adminFetch('/stats');
        if (r.status === 401) {
          if (!cancelled) setData(null);
          return;
        }
        const j = (await r.json()) as StatsResponse;
        if (cancelled) return;
        if (!j || typeof j !== 'object' || !j.llm) {
          setErr(j?.error || 'unexpected response shape from /stats');
          setData(null);
        } else {
          setData(j);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [paused, needsAuth, hydrated, adminFetch]);

  const llm = data?.llm;
  const tts = data?.tts;
  const djLog = data?.djLog;

  return (
    <div className="grid gap-4">
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex flex-wrap items-center gap-4 p-3.5">
          <Eyebrow className={err ? 'text-[var(--danger)]' : 'text-vermilion'}>
            ● {err ? 'down' : 'live'}
          </Eyebrow>
          <span className="caption">refresh · 5s</span>
          <span className="caption text-muted">
            in-memory · since controller boot
          </span>
          <span className="ml-auto">
            <Btn sm onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</Btn>
          </span>
        </div>
      </section>

      {err && <V3Alert tone="error" title="controller error">{err}</V3Alert>}

      {!data && !err && (
        <Card title="Stats">
          <span className="field-hint italic">connecting…</span>
        </Card>
      )}

      {data && llm && tts && djLog && (
        <>
          {/* ── LLM USAGE ─────────────────────────────────────────────── */}
          <Card
            title="LLM usage"
            sub={`last ${llm.window} model calls`}
            right={llm.activeModel ? <Pill tone="accent">{llm.activeModel}</Pill> : null}
          >
            {llm.count === 0 ? (
              <span className="field-hint italic">
                no model calls recorded yet
              </span>
            ) : (
              <div className="grid gap-0">
                <MetricStrip>
                  <StatCell label="Calls" value={fmtInt(llm.count)}
                    sub={`${llm.ok} ok · ${llm.failed} failed`} />
                  <StatCell label="Success rate" value={fmtPct(llm.successRate)}
                    danger={llm.successRate != null && llm.successRate < 0.9} />
                  <StatCell label="Avg latency" value={fmtMs(llm.latency.avg)}
                    sub={`p95 ${fmtMs(llm.latency.p95)}`} />
                  <StatCell label="Tokens" value={fmtTokens(llm.tokens?.total)}
                    sub={llm.tokens
                      ? `${fmtTokens(llm.tokens.input)} in · ${fmtTokens(llm.tokens.output)} out`
                      : 'provider reports none'} />
                  <StatCell label="Agent runs" value={fmtInt(llm.agent.calls)} last
                    sub={llm.agent.calls
                      ? `${llm.agent.avgSteps} steps · ${llm.agent.avgTools} tools avg`
                      : 'none'} />
                </MetricStrip>

                <div className="stack-mobile grid grid-cols-[1fr_1fr] gap-0">
                  <div className="border-r border-separator-soft p-3.5">
                    <div className="caption mb-2">by call kind</div>
                    <Table<ByKindRow>
                      empty="no calls"
                      rows={llm.byKind}
                      cols={[
                        { key: 'kind', label: 'Kind', render: r => r.kind.replace(/^sdk\./, '') },
                        { key: 'count', label: 'Calls', align: 'right',
                          render: r => <span className="mono-num">{r.count}</span> },
                        { key: 'ok', label: 'OK', align: 'right',
                          render: r => <span className="mono-num">{r.ok}/{r.count}</span> },
                        { key: 'avgMs', label: 'Avg', align: 'right',
                          render: r => <span className="mono-num">{fmtMs(r.avgMs)}</span> },
                        { key: 'tokens', label: 'Tokens', align: 'right',
                          render: r => <span className="mono-num">{fmtTokens(r.tokens || null)}</span> },
                      ]}
                    />
                  </div>
                  <div className="p-3.5">
                    <div className="caption mb-2">by model</div>
                    <Table<ByModelRow>
                      empty="no calls"
                      rows={llm.byModel}
                      cols={[
                        { key: 'model', label: 'Model' },
                        { key: 'count', label: 'Calls', align: 'right',
                          render: r => <span className="mono-num">{r.count}</span> },
                        { key: 'tokens', label: 'Tokens', align: 'right',
                          render: r => <span className="mono-num">{fmtTokens(r.tokens || null)}</span> },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* ── TTS USAGE ─────────────────────────────────────────────── */}
          <Card title="Voice / TTS usage" sub={`last ${tts.window} spoken segments`}>
            {tts.count === 0 ? (
              <span className="field-hint italic">
                no spoken segments recorded yet
              </span>
            ) : (
              <div className="grid gap-0">
                <MetricStrip>
                  <StatCell label="Segments" value={fmtInt(tts.count)}
                    sub={`${tts.ok} ok · ${tts.failed} failed`} />
                  <StatCell label="Avg latency" value={fmtMs(tts.latency.avg)}
                    sub={`p95 ${fmtMs(tts.latency.p95)}`} />
                  <StatCell label="Slowest" value={fmtMs(tts.latency.max)} />
                  <StatCell label="Fallbacks" value={fmtInt(tts.fellBack)}
                    danger={tts.fellBack > 0}
                    sub={`${fmtPct(tts.fallbackRate)} of calls`} />
                  <StatCell label="Characters" value={fmtTokens(tts.chars)} last
                    sub="voiced" />
                </MetricStrip>

                <div className="stack-mobile grid grid-cols-[1fr_1fr] gap-0">
                  <div className="border-r border-separator-soft p-3.5">
                    <div className="caption mb-2">by engine</div>
                    <Table<ByEngineRow>
                      empty="no segments"
                      rows={tts.byEngine}
                      cols={[
                        { key: 'engine', label: 'Engine' },
                        { key: 'count', label: 'Calls', align: 'right',
                          render: r => <span className="mono-num">{r.count}</span> },
                        { key: 'ok', label: 'OK', align: 'right',
                          render: r => <span className="mono-num">{r.ok}/{r.count}</span> },
                        { key: 'avgMs', label: 'Avg', align: 'right',
                          render: r => <span className="mono-num">{fmtMs(r.avgMs)}</span> },
                      ]}
                    />
                  </div>
                  <div className="p-3.5">
                    <div className="caption mb-2">by segment kind</div>
                    <Table<ByTtsKindRow>
                      empty="no segments"
                      rows={tts.byKind}
                      cols={[
                        { key: 'kind', label: 'Kind' },
                        { key: 'count', label: 'Calls', align: 'right',
                          render: r => <span className="mono-num">{r.count}</span> },
                        { key: 'avgMs', label: 'Avg', align: 'right',
                          render: r => <span className="mono-num">{fmtMs(r.avgMs)}</span> },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* ── DJ ACTIVITY ───────────────────────────────────────────── */}
          <Card title="DJ activity" sub={`${djLog.count} log events by kind`}>
            {!djLog.byKind.length ? (
              <span className="field-hint italic">
                no DJ-log events yet
              </span>
            ) : (
              <div className="grid gap-1.5">
                {djLog.byKind.map(r => {
                  const max = djLog.byKind[0]?.count || 1;
                  return (
                    <div
                      key={r.kind}
                      className="flex items-center gap-2.5 text-[12px]"
                    >
                      <span className="w-[110px] text-muted">{r.kind}</span>
                      <Bar frac={r.count / max} />
                      <span className="mono-num font-bold">{r.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
