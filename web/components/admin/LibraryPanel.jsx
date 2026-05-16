'use client';

// Library — /admin/library. The operator searches the Navidrome library and
// pushes a chosen track straight into the queue (an admin-grade version of
// the listener request flow, without the LLM matching guesswork). A "Latest
// tracks" section surfaces the most recently added music for one-click queuing,
// and "Mood tags" runs the resumable library tagger that classifies tracks.
import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '../../lib/adminAuth';

export default function LibraryPanel() {
  const { adminFetch, needsAuth, hydrated } = useAdminAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);  // null = not searched yet
  const [searching, setSearching] = useState(false);
  const [queuing, setQueuing] = useState(null);   // id of the row being queued
  const [feedback, setFeedback] = useState(null); // { tone, text }
  const [recent, setRecent] = useState(null);     // null = not loaded yet
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [tagState, setTagState] = useState(null); // { libraryStats, tagger }
  const [taggerLimit, setTaggerLimit] = useState('50');
  const [taggerBusy, setTaggerBusy] = useState(false);

  const ready = hydrated && !needsAuth;

  const loadRecent = useCallback(async () => {
    if (!ready) return;
    setLoadingRecent(true);
    try {
      const r = await adminFetch('/dj/recent?limit=25');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `latest tracks failed (${r.status})`);
      setRecent(Array.isArray(j.results) ? j.results : []);
    } catch (err) {
      setFeedback({ tone: 'err', text: err.message });
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
      const j = await r.json();
      setTagState({ libraryStats: j.libraryStats, tagger: j.tagger });
    } catch { /* transient — next poll retries */ }
  }, [adminFetch, ready]);

  useEffect(() => {
    if (!ready) return;
    loadTagState();
    const id = setInterval(loadTagState, 3000);
    return () => clearInterval(id);
  }, [ready, loadTagState]);

  const runSearch = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || !ready) return;
    setSearching(true);
    setFeedback(null);
    try {
      const r = await adminFetch(`/dj/search?q=${encodeURIComponent(q)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `search failed (${r.status})`);
      setResults(Array.isArray(j.results) ? j.results : []);
    } catch (err) {
      setFeedback({ tone: 'err', text: err.message });
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const queueTrack = async (track) => {
    setQueuing(track.id);
    setFeedback(null);
    try {
      const r = await adminFetch('/dj/queue-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(track),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `queue failed (${r.status})`);
      setFeedback({
        tone: 'ok',
        text: `queued “${j.track?.title || track.title}” · position ${j.queuePosition}`,
      });
    } catch (err) {
      setFeedback({ tone: 'err', text: err.message });
    } finally {
      setQueuing(null);
    }
  };

  const startTagger = async () => {
    setTaggerBusy(true);
    setFeedback(null);
    try {
      const limit = parseInt(taggerLimit, 10);
      const r = await adminFetch('/tag-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `tagger start failed (${r.status})`);
      await loadTagState();
    } catch (err) {
      setFeedback({ tone: 'err', text: err.message });
    } finally {
      setTaggerBusy(false);
    }
  };

  const libraryStats = tagState?.libraryStats;
  const tagger = tagState?.tagger;

  return (
    <div className="space-y-4" style={{ fontSize: 12 }}>
      <div className="flex flex-wrap items-center gap-3 pb-3" style={{ borderBottom: '1px solid var(--ink)' }}>
        <span className="v3-caption" style={{ color: 'var(--ink)' }}>library</span>
        <span className="v3-caption" style={{ color: 'var(--muted)' }}>search · queue · mood tags</span>
        {feedback && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: feedback.tone === 'err' ? '#c5302a' : 'var(--accent)' }}>
            {feedback.text}
          </span>
        )}
      </div>

      <Section title="Manual queue">
        <form onSubmit={runSearch} className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Artist, title, album…"
            style={{
              boxSizing: 'border-box', flex: 1,
              border: '1px solid var(--ink)', background: 'transparent',
              padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
              color: 'var(--ink)', outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={searching || !query.trim() || !ready}
            className="v3-eyebrow v3-focus cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--accent)', color: '#fff',
              border: '1px solid var(--accent)', padding: '8px 18px', fontSize: 10,
            }}
          >
            {searching ? 'searching…' : 'search'}
          </button>
        </form>

        <div className="mt-3">
          {results === null ? (
            <Empty>search the library to queue a track</Empty>
          ) : results.length === 0 ? (
            <Empty>no tracks found</Empty>
          ) : (
            <TrackList tracks={results} queuing={queuing} onQueue={queueTrack} />
          )}
        </div>
      </Section>

      <Section
        title="Latest tracks"
        action={
          <button
            onClick={loadRecent}
            disabled={loadingRecent || !ready}
            className="v3-eyebrow v3-focus cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              border: '1px solid var(--ink)', background: 'transparent',
              color: 'var(--ink)', padding: '3px 10px', fontSize: 9,
            }}
          >
            {loadingRecent ? 'loading…' : 'refresh'}
          </button>
        }
      >
        {recent === null ? (
          <Empty>{loadingRecent ? 'loading latest tracks…' : 'recently added tracks appear here'}</Empty>
        ) : recent.length === 0 ? (
          <Empty>no recently added tracks</Empty>
        ) : (
          <TrackList tracks={recent} queuing={queuing} onQueue={queueTrack} />
        )}
      </Section>

      <Section title="Mood tags">
        <div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
          {libraryStats?.total ?? 0} tracks tagged
          {libraryStats?.updatedAt && (
            <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 12 }}>
              · last update {new Date(libraryStats.updatedAt).toLocaleString('en-GB')}
            </span>
          )}
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
          Walks your Navidrome library album-by-album, classifies each track via Ollama.
          Resumable — already-tagged tracks are skipped.
        </div>

        <div className="flex items-center gap-2 mt-3">
          <span className="v3-caption" style={{ color: 'var(--muted)' }}>limit</span>
          <input
            type="number"
            value={taggerLimit}
            onChange={e => setTaggerLimit(e.target.value)}
            disabled={tagger?.running}
            className="v3-focus v3-tab-num"
            style={{
              boxSizing: 'border-box', width: 96,
              border: '1px solid var(--ink)', background: 'transparent',
              padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
              color: 'var(--ink)', outline: 'none',
            }}
          />
          <button
            onClick={startTagger}
            disabled={taggerBusy || tagger?.running || !ready}
            className="v3-eyebrow v3-focus cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--accent)', color: '#fff',
              border: 'none', padding: '8px 16px', fontSize: 10,
            }}
          >
            {tagger?.running ? 'running…' : 'start tagging'}
          </button>
          {tagger?.running && tagger.startedAt && (
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>
              pid {tagger.pid} · started {new Date(tagger.startedAt).toLocaleTimeString('en-GB')}
            </span>
          )}
        </div>

        {libraryStats?.total > 0 && (
          <div className="mt-4">
            <div className="v3-caption mb-2" style={{ color: 'var(--muted)' }}>by mood</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(libraryStats.byMood || {})
                .sort((a, b) => b[1] - a[1])
                .map(([m, n]) => (
                  <span
                    key={m}
                    style={{ border: '1px solid var(--ink)', padding: '2px 8px', fontSize: 12 }}
                  >
                    <span style={{ color: 'var(--ink)' }}>{m}</span>{' '}
                    <span className="v3-tab-num" style={{ color: 'var(--muted)' }}>{n}</span>
                  </span>
                ))}
            </div>
          </div>
        )}

        {tagger?.lastLog?.length > 0 && (
          <details className="mt-4" style={{ border: '1px solid var(--ink)' }}>
            <summary
              className="cursor-pointer v3-caption"
              style={{ padding: '8px 12px', color: 'var(--ink)' }}
            >
              tagger log ({tagger.lastLog.length} lines)
            </summary>
            <pre
              className="v3-scroll"
              style={{
                fontSize: 11, lineHeight: 1.4, maxHeight: 280, overflowY: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', padding: 12,
                color: 'var(--ink)', borderTop: '1px solid var(--ink)',
              }}
            >
              {tagger.lastLog.join('\n')}
            </pre>
          </details>
        )}
      </Section>
    </div>
  );
}

function TrackList({ tracks, queuing, onQueue }) {
  return (
    <ul className="space-y-1">
      {tracks.map(t => (
        <li key={t.id} className="flex items-center gap-3">
          <span className="truncate flex-1" style={{ color: 'var(--ink)' }}>
            {t.title} <span style={{ color: 'var(--muted)' }}>— {t.artist}</span>
            {t.album && <span style={{ color: 'var(--muted)' }}> · {t.album}</span>}
          </span>
          {t.duration != null && (
            <span className="v3-tab-num shrink-0" style={{ color: 'var(--muted)' }}>
              {fmtDuration(t.duration)}
            </span>
          )}
          <button
            onClick={() => onQueue(t)}
            disabled={!!queuing}
            className="v3-eyebrow v3-focus cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              border: '1px solid var(--ink)', background: 'transparent',
              color: 'var(--ink)', padding: '5px 12px', fontSize: 10,
            }}
          >
            {queuing === t.id ? 'queuing…' : 'queue'}
          </button>
        </li>
      ))}
    </ul>
  );
}

function fmtDuration(s) {
  const sec = Math.max(0, Math.round(s));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function Section({ title, action, children }) {
  return (
    <section style={{ border: '1px solid var(--ink)' }}>
      <div className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: '1px solid var(--ink)' }}>
        <span className="v3-caption" style={{ color: 'var(--ink)' }}>{title}</span>
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ children }) {
  return <div className="italic" style={{ color: 'var(--muted)' }}>{children}</div>;
}
