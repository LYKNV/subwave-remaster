'use client';

// Library — /admin/library. The operator searches the Navidrome library and
// pushes a chosen track straight into the queue (an admin-grade version of
// the listener request flow, without the LLM matching guesswork). A "Recently
// added" section surfaces the most recently added music for one-click queuing,
// and the mood tagger runs the resumable library tagger that classifies tracks.
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useAdminAuth } from '../../lib/adminAuth';
import { notify, errorMessage } from '../../lib/notify';
import { Input } from '../ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/input-group';
import { Field, FieldLabel } from '../ui/field';
import { Card, Btn, Pill, Eyebrow, Seg, Metric } from './ui';
import { cn } from '../../lib/cn';

interface Track {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
}

interface QueueTrackResponse {
  track?: Track;
  queuePosition?: number;
  error?: string;
}

interface SearchResponse {
  results?: Track[];
  error?: string;
}

interface LibraryStats {
  total?: number;
  byMood?: Record<string, number>;
  updatedAt?: string;
}

interface TaggerState {
  running?: boolean;
  pid?: number;
  startedAt?: string;
  lastLog?: string[];
}

interface SettingsResponse {
  libraryStats?: LibraryStats;
  tagger?: TaggerState;
}

export default function LibraryPanel() {
  const { adminFetch, needsAuth, hydrated } = useAdminAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [queuing, setQueuing] = useState<string | null>(null);
  const [recent, setRecent] = useState<Track[] | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [tagState, setTagState] = useState<SettingsResponse | null>(null);
  const [taggerLimit, setTaggerLimit] = useState('50');
  const [taggerBusy, setTaggerBusy] = useState(false);

  const ready = hydrated && !needsAuth;

  const loadRecent = useCallback(async () => {
    if (!ready) return;
    setLoadingRecent(true);
    try {
      const r = await adminFetch('/dj/recent?limit=25');
      const j = (await r.json().catch(() => ({}))) as SearchResponse;
      if (!r.ok) throw new Error(j.error || `latest tracks failed (${r.status})`);
      setRecent(Array.isArray(j.results) ? j.results : []);
    } catch (err) {
      notify.err(errorMessage(err));
      setRecent([]);
    } finally {
      setLoadingRecent(false);
    }
  }, [adminFetch, ready]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  // Library stats + tagger progress live on /settings — poll so an in-flight
  // tagging run reports live progress without a manual refresh.
  const loadTagState = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await adminFetch('/settings');
      if (!r.ok) return;
      const j = (await r.json()) as SettingsResponse;
      setTagState({ libraryStats: j.libraryStats, tagger: j.tagger });
    } catch { /* transient — next poll retries */ }
  }, [adminFetch, ready]);

  useEffect(() => {
    if (!ready) return;
    loadTagState();
    const id = setInterval(loadTagState, 3000);
    return () => clearInterval(id);
  }, [ready, loadTagState]);

  const runSearch = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || !ready) return;
    setSearching(true);
    try {
      const r = await adminFetch(`/dj/search?q=${encodeURIComponent(q)}`);
      const j = (await r.json().catch(() => ({}))) as SearchResponse;
      if (!r.ok) throw new Error(j.error || `search failed (${r.status})`);
      setResults(Array.isArray(j.results) ? j.results : []);
    } catch (err) {
      notify.err(errorMessage(err));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const queueTrack = async (track: Track) => {
    setQueuing(track.id);
    try {
      const r = await adminFetch('/dj/queue-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(track),
      });
      const j = (await r.json().catch(() => ({}))) as QueueTrackResponse;
      if (!r.ok) throw new Error(j.error || `queue failed (${r.status})`);
      notify.ok(`queued “${j.track?.title || track.title}” · position ${j.queuePosition}`);
    } catch (err) {
      notify.err(errorMessage(err));
    } finally {
      setQueuing(null);
    }
  };

  const startTagger = async () => {
    setTaggerBusy(true);
    try {
      const limit = parseInt(taggerLimit, 10);
      const r = await adminFetch('/tag-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error || `tagger start failed (${r.status})`);
      notify.ok('tagger started');
      await loadTagState();
    } catch (err) {
      notify.err(errorMessage(err));
    } finally {
      setTaggerBusy(false);
    }
  };

  const libraryStats = tagState?.libraryStats;
  const tagger = tagState?.tagger;

  const taggedTotal = libraryStats?.total ?? 0;
  const moodEntries: [string, number][] = Object.entries(libraryStats?.byMood || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const resultCount = results === null ? null : results.length;

  return (
    <div className="grid gap-4">
      {/* ── HERO SEARCH ─────────────────────────────────────────────────── */}
      <section className="card">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-ink p-4">
          <div>
            <Eyebrow className="text-vermilion">library · search · queue</Eyebrow>
            <div className="mt-1.5 text-[22px] font-extrabold tracking-[-0.02em]">
              Find a track. Queue it instantly.
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Search Navidrome by artist, title, or album — no LLM matching.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Metric n={taggedTotal.toLocaleString('en-GB')} l="tracks tagged" />
            <span className="h-8 w-px bg-separator-strong" />
            <Metric n={moodEntries.length} l="moods" accent />
          </div>
        </div>

        <div className="p-4">
          <form onSubmit={runSearch} className="flex gap-2">
            <InputGroup className="flex-1">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="floating points, kingdoms in colour, 2018…"
                value={query}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              />
            </InputGroup>
            <Btn lg tone="accent" type="submit" disabled={searching || !query.trim() || !ready}>
              {searching ? 'Searching…' : 'Search'}
            </Btn>
            <Btn lg type="button" onClick={() => { setQuery(''); setResults(null); }} disabled={searching}>
              Clear
            </Btn>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-3.5">
            <span className="caption">filter</span>
            <Seg
              value="any"
              onChange={(id) => setQuery(id === 'any' ? query : id)}
              options={[
                { id: 'any', label: 'Any' },
                { id: 'ambient', label: 'Ambient' },
                { id: 'slow', label: 'Slow' },
                { id: 'driving', label: 'Driving' },
                { id: 'jazz', label: 'Jazz' },
                { id: 'deep', label: 'Deep' },
              ]}
            />
            <span className="caption ml-3">energy</span>
            <Seg
              value="any"
              options={[
                { id: 'any', label: 'Any' },
                { id: 'low', label: 'Low' },
                { id: 'mid', label: 'Mid' },
                { id: 'high', label: 'High' },
              ]}
            />
            <span className="ml-auto text-[11px] text-muted">
              {resultCount === null
                ? 'search the library to queue a track'
                : `${resultCount} result${resultCount === 1 ? '' : 's'} · sorted by relevance`}
            </span>
          </div>
        </div>
      </section>

      {/* ── 2-COL ─────────────────────────────────────────────────────── */}
      <div className="stack-mobile grid grid-cols-[1fr_240px] items-start gap-4">
        {/* RESULTS */}
        <div className="grid gap-4">
          <Card
            title="Results"
            sub={query.trim() ? `for ‘${query.trim()}’` : 'manual queue'}
            bodyClass="px-3.5 py-1"
          >
            {results === null ? (
              <Empty>search the library to queue a track</Empty>
            ) : results.length === 0 ? (
              <Empty>{searching ? 'searching…' : 'no tracks found'}</Empty>
            ) : (
              <TrackTable tracks={results} queuing={queuing} onQueue={queueTrack} />
            )}
          </Card>

          <Card
            title="Recently added"
            sub="latest tracks"
            right={
              <Btn sm onClick={loadRecent} disabled={loadingRecent || !ready}>
                {loadingRecent ? 'Loading…' : 'Refresh'}
              </Btn>
            }
          >
            {recent === null ? (
              <Empty>{loadingRecent ? 'loading latest tracks…' : 'recently added tracks appear here'}</Empty>
            ) : recent.length === 0 ? (
              <Empty>no recently added tracks</Empty>
            ) : (
              <div className="grid gap-2">
                {recent.map(r => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-dashed border-separator-strong py-1.5"
                  >
                    <div className="min-w-0 text-[13px]">
                      <span className="text-ink">{r.title}</span>
                      <span className="text-muted"> — {r.artist}</span>
                      {r.album && <span className="text-muted"> · {r.album}</span>}
                    </div>
                    {r.duration != null && (
                      <span className="mono-num text-[10px] text-muted">{fmtDuration(r.duration)}</span>
                    )}
                    <Btn sm onClick={() => queueTrack(r)} disabled={!!queuing}>
                      {queuing === r.id ? 'Queuing…' : 'Queue'}
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* SIDEBAR */}
        <aside className="grid gap-4">
          <Card title="Browse" bodyClass="!p-0">
            <div className="py-1">
              {[
                { l: 'Search results', n: resultCount == null ? '—' : resultCount, a: true },
                { l: 'Recently added', n: recent == null ? '—' : recent.length },
                { l: 'Tracks tagged', n: taggedTotal.toLocaleString('en-GB') },
                { l: 'Moods classified', n: moodEntries.length },
              ].map(x => (
                <div
                  key={x.l}
                  className={cn(
                    'flex items-center justify-between px-3.5 py-2 text-[12px]',
                    x.a
                      ? 'border-l-2 border-[var(--accent)] bg-[var(--ink-soft)]'
                      : 'border-l-2 border-transparent',
                  )}
                >
                  <span className={x.a ? 'font-bold' : 'font-medium'}>{x.l}</span>
                  <span className="mono-num text-[10px] text-muted">{x.n}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="By mood">
            {moodEntries.length === 0 ? (
              <div className="text-[11px] text-muted italic">
                run the tagger to classify your library
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {moodEntries.map(([m, n], i) => (
                  <Pill
                    key={m}
                    tone={i === 0 ? 'ink' : 'default'}
                    onClick={() => setQuery(m)}
                    title={`search “${m}”`}
                  >
                    {m}
                    <span
                      className={cn(
                        'mono-num ml-1',
                        i === 0 ? 'text-ink' : 'text-muted',
                      )}
                    >
                      {n}
                    </span>
                  </Pill>
                ))}
              </div>
            )}
          </Card>

          <Card title="Mood tagger">
            <div className="text-[12px] font-bold text-ink">
              {taggedTotal} tracks tagged
            </div>
            {libraryStats?.updatedAt && (
              <div className="mt-0.5 text-[10px] text-muted">
                last update {new Date(libraryStats.updatedAt).toLocaleString('en-GB')}
              </div>
            )}
            <div className="mt-1.5 text-[11px] leading-[1.5] text-muted">
              Walks Navidrome album-by-album, classifies each track via Ollama. Resumable —
              tagged tracks are skipped.
            </div>

            <Field className="mt-3">
              <FieldLabel htmlFor="tagger-limit">limit</FieldLabel>
              <Input
                id="tagger-limit"
                type="number"
                className="mono-num"
                value={taggerLimit}
                onChange={e => setTaggerLimit(e.target.value)}
                disabled={tagger?.running}
              />
            </Field>
            <Btn
              tone="accent"
              onClick={startTagger}
              disabled={taggerBusy || tagger?.running || !ready}
              className="mt-2.5 w-full justify-center"
            >
              {tagger?.running ? 'Running…' : 'Start tagging'}
            </Btn>
            {tagger?.running && tagger.startedAt && (
              <div className="mt-2 text-[10px] text-muted">
                pid {tagger.pid} · started {new Date(tagger.startedAt).toLocaleTimeString('en-GB')}
              </div>
            )}

            {tagger?.lastLog && tagger.lastLog.length > 0 && (
              <details className="mt-3 border border-separator-strong">
                <summary className="caption cursor-pointer px-2.5 py-2">
                  tagger log ({tagger.lastLog.length} lines)
                </summary>
                <pre className="term m-0 max-h-60 border-t border-separator-strong">
                  {tagger.lastLog.join('\n')}
                </pre>
              </details>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

interface TrackTableProps {
  tracks: Track[];
  queuing: string | null;
  onQueue: (t: Track) => void;
}

function TrackTable({ tracks, queuing, onQueue }: TrackTableProps) {
  const colsClass = 'grid grid-cols-[24px_1fr_150px_56px_70px] gap-3';
  return (
    <div>
      <div
        className={cn(
          colsClass,
          'border-b border-ink px-1.5 py-2 text-[9px] font-bold tracking-[0.22em] text-muted uppercase',
        )}
      >
        <span>#</span>
        <span>title</span>
        <span>album</span>
        <span className="text-right">dur</span>
        <span />
      </div>
      {tracks.map((t, i) => (
        <div
          key={t.id}
          className={cn(
            colsClass,
            'items-center border-b border-dashed border-separator-strong px-1.5 py-2 text-[12px]',
          )}
        >
          <span className="mono-num text-[10px] text-muted">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-ink">
              {t.title}
            </div>
            <div className="text-[11px] text-muted">{t.artist}</div>
          </div>
          <span className="overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-muted">
            {t.album || '—'}
          </span>
          <span className="mono-num text-right text-[11px] text-muted">
            {t.duration != null ? fmtDuration(t.duration) : '—'}
          </span>
          <Btn sm onClick={() => onQueue(t)} disabled={!!queuing}>
            {queuing === t.id ? 'Queuing…' : 'Queue'}
          </Btn>
        </div>
      ))}
    </div>
  );
}

function fmtDuration(s: number): string {
  const sec = Math.max(0, Math.round(s));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function Empty({ children }: { children?: ReactNode }) {
  return <div className="py-2.5 text-[12px] text-muted italic">{children}</div>;
}
