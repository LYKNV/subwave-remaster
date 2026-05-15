// Admin-gated GET /debug — everything-at-a-glance for the debug UI.
import express from 'express';
import { readFile, readdir, stat } from 'node:fs/promises';
import { config } from '../config.js';
import * as dj from '../llm/dj.js';
import * as llmProvider from '../llm/provider.js';
import * as library from '../music/library.js';
import { getFullContext } from '../context.js';
import { queue } from '../broadcast/queue.js';
import { requireAdmin } from '../middleware/auth.js';

export const router = express.Router();

router.get('/debug', requireAdmin, async (req, res) => {
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
    const r = await fetch('http://icecast:7702/status-json.xsl');
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

  // 6. Recent LLM calls — `llm` reflects the active provider/model resolved
  // by the registry; `ollama.url` is still shown as the homelab endpoint.
  out.llm = {
    provider: llmProvider.providerName(),
    activeModel: llmProvider.activeModelLabel(),
    ollamaUrl: config.ollama.url,
    recentCalls: dj.recentCalls,
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
