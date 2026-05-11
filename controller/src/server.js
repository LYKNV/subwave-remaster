// Controller HTTP API.
// The Next.js web UI hits this for: now-playing, queue state, request submission.

import express from 'express';
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { config } from './config.js';
import * as subsonic from './subsonic.js';
import * as ollama from './ollama.js';
import * as library from './library.js';
import * as jingles from './jingles.js';
import { getFullContext } from './context.js';
import { queue } from './queue.js';
import { startScheduler } from './scheduler.js';

// Background tagger process tracking (single-flight)
const tagger = { running: false, startedAt: null, pid: null, lastLog: [] };

const app = express();
app.use(express.json());

// CORS for the Next.js frontend
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ---------------------------------------------------------------------------
// GET /now-playing — current track + context snapshot
// ---------------------------------------------------------------------------
app.get('/now-playing', async (req, res) => {
  try {
    const [nowPlaying, ctx] = await Promise.all([
      queue.getNowPlaying(),
      getFullContext(),
    ]);
    res.json({ nowPlaying, context: ctx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /state — queue + history + DJ log
// ---------------------------------------------------------------------------
app.get('/state', (req, res) => {
  res.json(queue.snapshot());
});

// ---------------------------------------------------------------------------
// POST /request — listener submits a request
// ---------------------------------------------------------------------------
app.post('/request', async (req, res) => {
  const { text, name } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Empty request' });
  }
  const requester = (name || '').trim() || 'anon';

  try {
    queue.log('request', `${requester}: "${text}"`);

    // 1. LLM matches intent
    const matched = await ollama.matchRequest(text, { listenerName: requester });

    // 2. Search Navidrome
    let candidates = [];
    for (const term of matched.search_terms || []) {
      const r = await subsonic.search(term, { songCount: 5 });
      candidates = [...candidates, ...r];
    }

    // De-dup
    const seen = new Set();
    const unique = candidates.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    let pick = unique[0];

    // If no direct match but we have a mood, fall back to mood-based
    if (!pick && matched.mood) {
      const moodPool = await subsonic.getRandomSongs({ size: 10, genre: matched.mood });
      pick = moodPool[0];
    }

    if (!pick) {
      queue.log('miss', `Nothing matched "${text}"`);
      return res.json({
        success: false,
        message: `Sorry ${requester}, nothing in the crates matched that.`,
      });
    }

    // 3. Generate DJ intro that mentions the request
    const ctx = await getFullContext();
    const introScript = await ollama.generateIntro({
      track: pick,
      context: ctx,
      requestedBy: requester,
    });

    // 4. Add to queue (will trigger Liquidsoap via the queue manager)
    await queue.push({
      track: pick,
      requestedBy: requester,
      intent: matched.intent,
      introScript,
    });

    res.json({
      success: true,
      ack: matched.ack,
      track: { title: pick.title, artist: pick.artist },
      queuePosition: queue.upcoming.length,
    });
  } catch (err) {
    queue.log('error', `Request handling failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// (manual skip is not implemented in this build — Liquidsoap controls pacing)

// ---------------------------------------------------------------------------
// POST /auto-pick — toggle whether the LLM picks the next track
// Body: { "on": true | false }
// ---------------------------------------------------------------------------
app.post('/auto-pick', express.json(), (req, res) => {
  if (typeof req.body?.on === 'boolean') queue.autoPick = req.body.on;
  queue.log('scheduler', `auto-pick ${queue.autoPick ? 'enabled' : 'disabled'}`);
  res.json({ autoPick: queue.autoPick });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => res.json({ status: 'on-air' }));

// ---------------------------------------------------------------------------
// JINGLES — list / create / delete pre-recorded TTS stingers
// ---------------------------------------------------------------------------
app.get('/jingles', async (req, res) => {
  try {
    res.json({ jingles: await jingles.list() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/jingles', async (req, res) => {
  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (text.length > 500) return res.status(400).json({ error: 'text too long (max 500)' });
  try {
    const created = await jingles.create(text);
    queue.log('scheduler', `New jingle created: "${text.slice(0, 60)}…"`);
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/jingles/:filename', async (req, res) => {
  try {
    res.json(await jingles.remove(req.params.filename));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// SETTINGS — single endpoint that returns everything the /settings UI needs
// ---------------------------------------------------------------------------
app.get('/settings', async (req, res) => {
  try {
    await library.load();
    res.json({
      autoPick: queue.autoPick,
      pickerBusy: queue.pickerBusy,
      jingles: await jingles.list(),
      libraryStats: library.stats(),
      tagger: { ...tagger, lastLog: tagger.lastLog.slice(-30) },
      ollama: { url: config.ollama.url, model: config.ollama.model },
      location: config.weather.locationName,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// TAG-LIBRARY — kick off the tagger as a background child process.
// Polls /settings to see progress (library.total grows; tagger.running flips).
// ---------------------------------------------------------------------------
app.post('/tag-library', (req, res) => {
  if (tagger.running) return res.status(409).json({ error: 'tagger already running', tagger });
  const limit = parseInt(req.body?.limit, 10);
  const args = ['src/tag-library.js'];
  if (Number.isFinite(limit) && limit > 0) args.push('--limit', String(limit));

  const child = spawn('node', args, { cwd: '/app', detached: false });
  tagger.running = true;
  tagger.startedAt = new Date().toISOString();
  tagger.pid = child.pid;
  tagger.lastLog = [];

  const capture = (chunk) => {
    const lines = chunk.toString().split('\n').filter(l => l.trim());
    tagger.lastLog.push(...lines);
    if (tagger.lastLog.length > 100) tagger.lastLog = tagger.lastLog.slice(-100);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('exit', (code) => {
    tagger.running = false;
    tagger.lastLog.push(`[exit ${code}]`);
    queue.log('scheduler', `tagger finished (exit ${code})`);
  });
  queue.log('scheduler', `tagger started${Number.isFinite(limit) ? ` (limit=${limit})` : ''}`);
  res.json({ ok: true, tagger });
});

// ---------------------------------------------------------------------------
// GET /debug — everything-at-a-glance for the debug UI
// ---------------------------------------------------------------------------
app.get('/debug', async (req, res) => {
  const out = { t: new Date().toISOString() };

  // 1. now-playing.json (what Liquidsoap last wrote)
  try {
    out.nowPlaying = JSON.parse(await readFile(config.liquidsoap.nowPlayingFile, 'utf8'));
  } catch (err) {
    out.nowPlaying = { error: err.message };
  }

  // 2. Queue snapshot (current + upcoming + history + djLog)
  out.queue = {
    current: queue.current ? {
      title: queue.current.track.title,
      artist: queue.current.track.artist,
      album: queue.current.track.album,
      requestedBy: queue.current.requestedBy,
      source: queue.current.source,
      intent: queue.current.intent,
      introScript: queue.current.introScript,
    } : null,
    upcoming: queue.upcoming.map(i => ({
      title: i.track.title, artist: i.track.artist,
      requestedBy: i.requestedBy, aiPicked: i.aiPicked,
    })),
    historyCount: queue.history.length,
    djLogCount: queue.djLog.length,
    djLog: queue.djLog.slice(0, 30),
    autoPick: queue.autoPick,
    pickerBusy: queue.pickerBusy,
  };

  // 3. Icecast status
  try {
    const r = await fetch('http://icecast:8000/status-json.xsl');
    const ic = (await r.json()).icestats;
    const src = Array.isArray(ic.source) ? ic.source[0] : ic.source;
    out.icecast = src ? {
      title: src.title,
      bitrate: src.bitrate,
      listeners: src.listeners,
      listener_peak: src.listener_peak,
      mount: src.listenurl,
      stream_start: src.stream_start_iso8601,
      server_start: ic.server_start_iso8601,
    } : { error: 'no source connected' };
  } catch (err) {
    out.icecast = { error: err.message };
  }

  // 4. Liquidsoap log tail
  try {
    const log = await readFile('/var/log/liquidsoap/radio.log', 'utf8');
    out.liquidsoapLog = log.split('\n').slice(-100).join('\n');
  } catch (err) {
    out.liquidsoapLog = `error: ${err.message}`;
  }

  // 5. State dir listing
  try {
    const dir = '/var/sub-wave';
    const entries = await readdir(dir);
    out.stateFiles = await Promise.all(entries.map(async (name) => {
      try {
        const s = await stat(`${dir}/${name}`);
        return { name, size: s.size, mtime: s.mtime.toISOString(), isDir: s.isDirectory() };
      } catch { return { name, error: true }; }
    }));
    const voiceDir = `${dir}/voice`;
    try {
      const v = await readdir(voiceDir);
      out.voiceFiles = await Promise.all(v.map(async (name) => {
        const s = await stat(`${voiceDir}/${name}`);
        return { name, size: s.size, mtime: s.mtime.toISOString() };
      }));
    } catch {}
  } catch (err) {
    out.stateFiles = { error: err.message };
  }

  // 6. Recent Ollama calls
  out.ollama = {
    url: config.ollama.url,
    model: config.ollama.model,
    recentCalls: ollama.recentCalls,
  };

  // 6b. Library tagging stats
  try {
    await library.load();
    out.library = library.stats();
  } catch (err) {
    out.library = { error: err.message };
  }

  // 7. Context snapshot
  try {
    out.context = await getFullContext();
  } catch (err) {
    out.context = { error: err.message };
  }

  // 8. Config (redacted)
  out.config = {
    navidromeUrl: config.navidrome.url,
    navidromeUser: config.navidrome.user,
    ollamaUrl: config.ollama.url,
    ollamaModel: config.ollama.model,
    location: config.weather.locationName,
    port: config.server.port,
  };

  res.json(out);
});

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------
app.listen(config.server.port, () => {
  console.log(`SUB/WAVE controller on :${config.server.port}`);
  queue.startWatcher();
  startScheduler();
  // Auto-generate the default station ident on first boot (idempotent)
  jingles.ensureDefaultIdent().catch(err => console.error('[jingles] ident generation failed:', err.message));
});
