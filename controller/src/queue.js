// Queue manager — keeps the in-memory queue and writes track URIs
// to the file Liquidsoap watches. A now-playing watcher rotates items
// between upcoming → current → history based on what Liquidsoap reports.

import { writeFile, readFile } from 'node:fs/promises';
import { config } from './config.js';
import * as subsonic from './subsonic.js';
import * as ollama from './ollama.js';
import { speak } from './piper.js';
import { pickAndEnqueue } from './picker.js';
import { getFullContext } from './context.js';

// Random gap between DJ links on auto-played tracks.
// 85% of the time we land in 1-9, 15% we go quiet for 10-15 tracks.
function pickLinkInterval() {
  if (Math.random() < 0.15) return 10 + Math.floor(Math.random() * 6);
  return 1 + Math.floor(Math.random() * 9);
}

class Queue {
  constructor() {
    this.upcoming = [];        // request items pushed by listeners, not yet playing
    this.current = null;       // what's broadcasting right now (request or auto)
    this.history = [];         // finished tracks, newest first
    this.djLog = [];           // controller-level events for the web UI
    this.lastSeenKey = null;   // for change detection in the watcher
    this.senderBusy = false;   // drain-to-Liquidsoap mutex
    this.pickerBusy = false;   // prevent concurrent LLM picks
    this.autoPick = true;      // toggle: should we ask Ollama for next track when idle
    this.autoLink = true;      // toggle: random DJ links between auto tracks
    this.tracksUntilLink = pickLinkInterval();
    this.linkBusy = false;
  }

  log(kind, message, meta = {}) {
    const entry = { id: Date.now() + Math.random(), kind, message, meta, t: new Date().toISOString() };
    this.djLog.unshift(entry);
    this.djLog = this.djLog.slice(0, 200);
    console.log(`[${kind}] ${message}`);
  }

  // Push a listener request. Adds to upcoming and kicks off the Liquidsoap sender.
  async push({ track, requestedBy = null, intent = null, introScript = null, aiPicked = false }) {
    const item = {
      track, requestedBy, intent, introScript, aiPicked,
      queuedAt: new Date().toISOString(),
      sent: false,
    };
    this.upcoming.push(item);
    this.log('queued', `${track.title} — ${track.artist}`, { requestedBy, queueDepth: this.upcoming.length });
    this.drainToLiquidsoap();  // fire-and-forget
    return this.upcoming.length;
  }

  // Walk the upcoming queue and feed unsent items to Liquidsoap one at a time,
  // spaced out so the 1s file-poll doesn't miss any.
  async drainToLiquidsoap() {
    if (this.senderBusy) return;
    this.senderBusy = true;
    try {
      while (true) {
        const item = this.upcoming.find(i => !i.sent);
        if (!item) break;

        if (item.introScript) {
          try {
            const wavPath = await speak(item.introScript);
            await writeFile(config.liquidsoap.sayFile, wavPath);
            this.log('dj-speak', item.introScript);
            await sleep(250);
          } catch (err) {
            this.log('error', `TTS failed: ${err.message}`);
          }
        }

        const uri = subsonic.getAnnotatedUri(item.track);
        await writeFile(config.liquidsoap.queueFile, uri);
        item.sent = true;

        // Give Liquidsoap's 1s poll a chance to read + delete the file
        // before we overwrite it with the next item.
        await sleep(1500);
      }
    } finally {
      this.senderBusy = false;
    }
  }

  // Speak something without queueing a track — for hourly time checks,
  // weather updates, station IDs.
  async announce(text, kind = 'announcement') {
    if (!text || !text.trim()) return;
    try {
      const wavPath = await speak(text);
      await writeFile(config.liquidsoap.sayFile, wavPath);
      this.log(kind, text);
    } catch (err) {
      this.log('error', `Announce failed: ${err.message}`);
    }
  }

  // Called by the now-playing watcher when Liquidsoap reports a new track.
  onTrackStarted(np) {
    if (!np || !np.title) return;
    const key = `${np.subsonic_id || ''}|${np.title}|${np.artist || ''}`;
    if (key === this.lastSeenKey) return;
    this.lastSeenKey = key;

    // Roll previous current into history
    if (this.current) {
      this.history.unshift({ ...this.current, endedAt: new Date().toISOString() });
      this.history = this.history.slice(0, 50);
    }

    // Match upcoming by subsonic_id first (reliable), fall back to title+artist
    // for older items that pre-date the id annotation.
    let idx = -1;
    if (np.subsonic_id) {
      idx = this.upcoming.findIndex(u => u.track.id && u.track.id === np.subsonic_id);
    }
    if (idx < 0) {
      idx = this.upcoming.findIndex(
        u => u.track.title === np.title && (u.track.artist || '') === (np.artist || '')
      );
    }

    if (idx >= 0) {
      const item = this.upcoming.splice(idx, 1)[0];
      const source = item.aiPicked ? 'ai' : 'request';
      this.current = { ...item, startedAt: new Date().toISOString(), source };
      this.log('playing', `${np.title} — ${np.artist}`, { requestedBy: item.requestedBy, source });
    } else {
      // Not a tracked request → auto-playlist or jingle
      this.current = {
        track: {
          id: np.subsonic_id || null,
          title: np.title,
          artist: np.artist,
          album: np.album,
        },
        requestedBy: null,
        startedAt: new Date().toISOString(),
        source: 'auto',
      };
      this.log('playing', `${np.title} — ${np.artist}`, { source: 'auto' });
    }

    // Random DJ link between auto tracks. Listener requests are skipped entirely —
    // they already get a bespoke intro and shouldn't count toward the gap.
    const isAutonomous = this.current.source === 'auto' || this.current.source === 'ai';
    if (this.autoLink && isAutonomous) {
      this.tracksUntilLink--;
      if (this.tracksUntilLink <= 0 && this.history[0] && !this.linkBusy) {
        this.tracksUntilLink = pickLinkInterval();
        this.linkBusy = true;
        const previous = this.history[0].track;
        const current = this.current.track;
        (async () => {
          try {
            const ctx = await getFullContext();
            const script = await ollama.generateLink({ previous, current, context: ctx });
            await this.announce(script, 'link');
          } catch (err) {
            this.log('error', `DJ link failed: ${err.message}`);
          } finally {
            this.linkBusy = false;
          }
        })();
      }
    }

    // Auto-DJ: if nothing is queued, ask the LLM to pick the next track.
    // Fire-and-forget — by the time the current track ends, the pick should
    // already be in Liquidsoap's dj_queue, so there's no gap.
    if (this.autoPick && this.upcoming.length === 0 && !this.pickerBusy) {
      this.pickerBusy = true;
      pickAndEnqueue(this)
        .catch(err => this.log('error', `picker failed: ${err.message}`))
        .finally(() => { this.pickerBusy = false; });
    }
  }

  // IDs of tracks played in the last N entries — used by scheduler to avoid repeats
  recentlyPlayedIds(n = 25) {
    const ids = [];
    if (this.current?.track?.id) ids.push(this.current.track.id);
    for (const h of this.history.slice(0, n)) {
      if (h.track?.id) ids.push(h.track.id);
    }
    return new Set(ids);
  }

  // Poll now-playing.json every 1.5s and dispatch track changes
  startWatcher() {
    setInterval(async () => {
      const np = await this.getNowPlaying();
      this.onTrackStarted(np);
    }, 1500);
    this.log('scheduler', 'Now-playing watcher started');
  }

  snapshot() {
    const mapItem = i => ({
      title: i.track.title,
      artist: i.track.artist,
      album: i.track.album,
      requestedBy: i.requestedBy,
      source: i.source,
      startedAt: i.startedAt,
      endedAt: i.endedAt,
      queuedAt: i.queuedAt,
      sent: i.sent,
    });
    return {
      current: this.current ? mapItem(this.current) : null,
      upcoming: this.upcoming.map(mapItem),
      history: this.history.map(mapItem),
      djLog: this.djLog.slice(0, 50),
    };
  }

  // Read the now-playing JSON Liquidsoap writes
  async getNowPlaying() {
    try {
      const raw = await readFile(config.liquidsoap.nowPlayingFile, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export const queue = new Queue();
