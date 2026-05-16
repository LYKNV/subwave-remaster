// Centralised config — reads from env, with sensible defaults

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The shared state directory — every file-based IPC channel lives under here.
// In Docker the compose files mount <repo>/state → /var/sub-wave and pass
// STATE_DIR=/var/sub-wave. Native dev (`npm run dev` from controller/) has no
// such mount, so it falls back to the repo-local state/ dir resolved relative
// to this file (controller/src/config.js → ../../state).
export const STATE_DIR = process.env.STATE_DIR
  || resolve(dirname(fileURLToPath(import.meta.url)), '../../state');

export const config = {
  // Absolute path to the shared state dir — modules build their own file
  // paths from this rather than hardcoding /var/sub-wave.
  stateDir: STATE_DIR,
  navidrome: {
    url: process.env.NAVIDROME_URL || 'http://navidrome:4533',
    user: process.env.NAVIDROME_USER || '',
    password: process.env.NAVIDROME_PASS || '',
    apiVersion: '1.16.1',
    clientName: 'sub-wave',
  },
  ollama: {
    // Default-when-blank server URL + model. The admin Settings UI
    // (`llm.ollamaUrl` / `llm.model`) overrides both — there are no
    // OLLAMA_URL / OLLAMA_MODEL env vars; the UI fields are the only source.
    url: 'http://localhost:11434',
    model: 'nemotron-3-super:cloud',
  },
  piper: {
    binary: process.env.PIPER_BIN || '/usr/local/bin/piper',
    voice: process.env.PIPER_VOICE || '/opt/piper/voices/en_GB-alan-medium.onnx',
    voiceConfig: process.env.PIPER_VOICE_CONFIG || '/opt/piper/voices/en_GB-alan-medium.onnx.json',
    outDir: process.env.PIPER_OUT || `${STATE_DIR}/voice`,
  },
  kokoro: {
    python: process.env.KOKORO_PYTHON || '/opt/kokoro/venv/bin/python',
    workerScript: process.env.KOKORO_WORKER || '/app/scripts/kokoro_worker.py',
    model: process.env.KOKORO_MODEL || '/opt/kokoro/models/kokoro-v1.0.onnx',
    voices: process.env.KOKORO_VOICES || '/opt/kokoro/models/voices-v1.0.bin',
    voice: process.env.KOKORO_VOICE || 'bf_isabella',   // British female, BBC-ish
    lang: process.env.KOKORO_LANG || 'en-gb',
    speed: parseFloat(process.env.KOKORO_SPEED || '1.0'),
  },
  liquidsoap: {
    queueFile: `${STATE_DIR}/next.txt`,
    sayFile: `${STATE_DIR}/say.txt`,
    // Separate channel for talk-over voice (auto-links, anything that should
    // play OVER a track that's already started with light ducking instead of
    // heavy ducking the music to 25%). Read by a second poll thread in radio.liq.
    introFile: `${STATE_DIR}/intro.txt`,
    autoPlaylist: `${STATE_DIR}/auto.m3u`,
    nowPlayingFile: `${STATE_DIR}/now-playing.json`,
  },
  session: {
    // The live DJ session — a chat-history JSON the controller rewrites as
    // tracks play and the DJ talks. Archived sessions land in `dir` on roll.
    currentFile: `${STATE_DIR}/session.json`,
    dir: `${STATE_DIR}/sessions`,
  },
  weather: {
    // Wolverhampton — your home location
    lat: 52.5862,
    lng: -2.1288,
    locationName: 'Wolverhampton',
  },
  news: {
    feedUrl: process.env.NEWS_FEED_URL || 'http://feeds.bbci.co.uk/news/rss.xml',
    maxItems: parseInt(process.env.NEWS_MAX_ITEMS || '10', 10),
  },
  search: {
    // Tavily API key for the web-search skill. Blank → the skill stays inert.
    apiKey: process.env.SEARCH_API_KEY || '',
  },
  server: {
    port: parseInt(process.env.PORT || '7701', 10),
  },
  show: {
    autoQueueRefreshMinutes: parseInt(process.env.AUTO_QUEUE_REFRESH_MINUTES || '60', 10),
  },
};
