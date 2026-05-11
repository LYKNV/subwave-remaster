# SUB/WAVE

A real internet radio station. Single Icecast stream — every listener hears the same broadcast at the same time. An LLM-driven DJ picks tracks track-by-track based on what just played, the time of day, weather, festivals, and listener requests; Piper TTS speaks intros and time-checks between tracks.

```
                    ┌─────────────────────────────────────────┐
                    │           Listeners (browsers)          │
                    │      <audio src="…/stream.mp3">         │
                    └────────────────────┬────────────────────┘
                                         │ HTTP audio
                    ┌────────────────────▼────────────────────┐
                    │              ICECAST                    │
                    │       (broadcast endpoint, CORS on)     │
                    └────────────────────▲────────────────────┘
                                         │ source connection
                    ┌────────────────────┴────────────────────┐
                    │           LIQUIDSOAP                    │
                    │  • polls next.txt / say.txt             │
                    │  • smart crossfade, smooth_add ducking  │
                    │  • on_metadata → now-playing.json       │
                    │  • auto.m3u + emergency.mp3 fallback    │
                    └────────────────────▲────────────────────┘
                                         │ writes URIs + WAV paths
                    ┌────────────────────┴────────────────────┐
                    │         CONTROLLER (Node.js)            │
                    │  • Express API + /debug + /state        │
                    │  • now-playing watcher (1.5s)           │
                    │  • Ollama: request matching, DJ scripts,│
                    │    track picking, library tagging       │
                    │  • Piper TTS for spoken segments        │
                    │  • Scheduler: auto.m3u refresh, time    │
                    │    checks, weather, station IDs         │
                    └─┬──────────┬──────────┬──────────────┬──┘
                      │          │          │              │
                  ┌───▼───┐  ┌───▼────┐ ┌───▼────┐  ┌──────▼──────┐
                  │Ollama │  │Navidrm │ │ Piper  │  │ Open-Meteo  │
                  │       │  │Subsonic│ │  TTS   │  │  (weather)  │
                  └───────┘  └────────┘ └────────┘  └─────────────┘

                    ┌─────────────────────────────────────────┐
                    │          NEXT.JS WEB UI                 │
                    │  • /        — listener page             │
                    │  • /debug   — live diagnostics          │
                    └─────────────────────────────────────────┘
```

## Why this architecture

Real radio = one stream, synced listeners. That needs a server-side audio mixer. Liquidsoap is the standard tool — what college radio, Lainchan radio, every small internet station uses. Icecast is the broadcast layer listeners connect to.

The controller is the only bespoke piece. Liquidsoap and Icecast just do their well-understood jobs.

## What runs where

- **Icecast / Liquidsoap / Controller** — Docker Compose stack. Defaults assume `host.docker.internal` for the local Ollama.
- **Ollama** — runs on the host. Default model is `nemotron-3-super:cloud`; swap to anything that supports the `format: json` chat option (qwen2.5:7b, llama3.1:8b, etc).
- **Navidrome** — anywhere reachable. Controller talks Subsonic API over HTTPS.
- **Piper** — baked into the controller image, CPU-only. Voice: `en_GB-alan-medium`. Runs under Rosetta on Apple Silicon (slow boot, fast enough for short DJ clips).
- **Web UI** — Next.js dev server on port 3000.

## Directory layout

```
sub-wave/
├── controller/
│   ├── src/
│   │   ├── server.js          # Express API: /now-playing, /state, /request, /debug, /auto-pick
│   │   ├── subsonic.js        # Navidrome client + annotate URI builder
│   │   ├── ollama.js          # Request matching, DJ scripts, LLM picker (+ ring buffer of recent calls)
│   │   ├── piper.js           # TTS wrapper
│   │   ├── queue.js           # In-memory queue + now-playing watcher (rotates upcoming → current → history)
│   │   ├── picker.js          # LLM-as-DJ — picks the next track from a candidate pool
│   │   ├── library.js         # moods.json store (LLM-generated mood/energy tags)
│   │   ├── tag-library.js     # Standalone library tagger script
│   │   ├── scheduler.js       # auto.m3u refresh, hourly time, weather, station IDs
│   │   ├── context.js         # Time / weather / festival → dominantMood
│   │   └── config.js
│   ├── package.json           # npm run tag → src/tag-library.js
│   └── .env.example
├── web/
│   ├── app/
│   │   ├── page.js            # Listener page
│   │   └── debug/page.js      # Live diagnostics (2s refresh)
│   ├── components/            # Receiver, Vinyl, EQVisualizer, RequestLine, BoothFeed, ...
│   └── .env.example
├── liquidsoap/
│   └── radio.liq              # Liquidsoap broadcast script
├── docker/
│   ├── docker-compose.yml
│   ├── icecast.xml            # CORS headers enabled
│   └── Dockerfile.controller  # Node 22 + Piper + voice
├── scripts/
│   └── setup.sh
└── state/                     # Bind-mounted shared volume (created on first run)
    ├── auto.m3u               # Fallback playlist, refreshed every 10 min
    ├── jingles.m3u
    ├── emergency.mp3          # Pink-noise safety net
    ├── now-playing.json       # Written by Liquidsoap on_metadata
    ├── moods.json             # LLM-tagged library (after running `npm run tag`)
    ├── voice/                 # Piper WAVs (auto-cleaned hourly)
    └── logs/radio.log         # Liquidsoap log
```

## Quick start (Mac local)

```bash
# 1. Configure
cp controller/.env.example controller/.env
# Edit NAVIDROME_URL / USER / PASS / OLLAMA_URL / OLLAMA_MODEL

# 2. Web UI dev defaults
cp web/.env.example web/.env.local
# (leave as-is for localhost — points stream/api at this host)

# 3. State dir + emergency audio
mkdir -p state/{voice,archive,jingles,logs}
touch state/auto.m3u state/jingles.m3u
ffmpeg -f lavfi -i "anoisesrc=color=pink:duration=30:amplitude=0.05" \
  -codec:a libmp3lame -b:a 128k state/emergency.mp3 -y

# 4. Build + launch the stack
cd docker && docker compose up -d --build

# 5. Web UI
cd ../web && npm install && npm run dev
```

Open:
- **Listener** — http://localhost:3000
- **Debug** — http://localhost:3000/debug
- **Raw stream** — http://localhost:8000/stream.mp3 (any audio player)
- **Icecast status** — http://localhost:8000/status-json.xsl

## How the auto-DJ picks tracks

The picker runs **once per track change**, fired by the now-playing watcher. By the time the current track ends, the next one is already sitting in Liquidsoap's `dj_queue`.

Candidate pool, in order of preference:
1. **Mood-tagged tracks** matching the current `dominantMood` (from `state/moods.json` — populated by `npm run tag`)
2. **Any tagged track** if the mood pool is too small
3. **Starred + random** from Navidrome if the library hasn't been tagged

Recently played track IDs (last 25) are filtered out of the pool. The pool is capped at 15 candidates per call.

The LLM gets: the last 8 plays (title, artist, moods, energy), the current context (time period, weather, festival, dominant mood), and the candidate pool. It returns `{ id, reason }`. The reason is logged with each pick and visible on `/debug`.

If Ollama is down or returns garbage, the controller logs the error and does nothing — Liquidsoap falls back to `auto.m3u` (refreshed every 10 min from starred + random) so audio never stops.

Toggle the LLM picker without a restart:
```
curl -X POST http://localhost:4000/auto-pick \
  -H 'Content-Type: application/json' \
  -d '{"on": false}'   # back to auto.m3u shuffle
```

## Tagging the library

The picker is most useful with mood-tagged tracks. The tagger walks every album in Navidrome, sends each track's metadata to Ollama with a constrained prompt, stores `{ moods, energy }` in `state/moods.json`.

```bash
# Try 50 tracks first to sanity-check tag quality
docker exec sub-wave-controller npm run tag -- --limit 50

# Full library
docker exec sub-wave-controller npm run tag
```

Resumable — already-tagged tracks are skipped. Saves to disk every 25 tags, so Ctrl-C is safe.

Mood vocabulary (`tag-library.js`):
> energetic, calm, reflective, celebratory, romantic, spiritual, focus, workout, driving, cooking, rainy, sunny, night, morning, evening, festival, cultural

Energy: `low | medium | high`

Tag stats (count by mood, count by energy) appear on `/debug` once at least one track is tagged.

## Listener requests

POST a request, get a track + on-air acknowledgement:

```bash
curl -X POST http://localhost:4000/request \
  -H 'Content-Type: application/json' \
  -d '{"text": "something for late-night driving", "name": "klair"}'
```

Flow: Ollama parses intent → searches Navidrome → picks the best match → generates a contextual DJ intro → Piper renders the intro WAV → both intro and track are pushed to Liquidsoap. The intro plays over the track's first few seconds (sidechain-ducked by `smooth_add`).

User requests jump to the front of the controller's `upcoming` queue. **One known v1 caveat:** an LLM pre-pick already sitting in Liquidsoap's `dj_queue` will still play before your request — it can't be cancelled from outside without telnet/server hooks. Fix planned: two-queue priority (`user_queue` / `auto_pick_queue`).

## Scheduler segments

| When | What |
|---|---|
| Top of every hour | Time-check segment, in character |
| `:15` and `:45` past every hour | Station ID |
| Every 30 min (when condition changes) | Weather update |
| Every 10 min | `auto.m3u` refresh (mood + starred + random, 30 tracks) |
| Hourly | Old DJ-voice WAV cleanup |

All speak through the same `voice_queue`, which ducks the music briefly via `smooth_add(p=0.25)`.

## Endpoints (controller, port 4000)

| Method | Path | What |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/now-playing` | `{ nowPlaying, context }` — what's on air + DJ context |
| GET | `/state` | Queue snapshot — `{ current, upcoming, history, djLog }` |
| POST | `/request` | Submit a listener request — `{ text, name? }` |
| POST | `/auto-pick` | Toggle LLM picker — `{ on: true|false }` |
| GET | `/debug` | Everything-at-a-glance JSON (used by the web `/debug` page) |

## Customisation

- **DJ voice / personality** — edit `DJ_SYSTEM` in `controller/src/ollama.js`. Currently: late-night BBC 6 Music presenter — dry, understated, never corny.
- **Mood vocabulary** — `MOOD_VOCAB` in `controller/src/tag-library.js` (and the matching `mood` enum in the request-matcher's system prompt).
- **Picker behaviour** — `PICKER_SYSTEM` in `controller/src/ollama.js` defines the selection criteria.
- **Show clock** — `getTimeContext()` in `controller/src/context.js` maps hour-of-day to mood/vibe.
- **Weather location** — `config.weather.lat/lng/locationName` in `controller/src/config.js`. Defaults to Wolverhampton.
- **Bitrate / format** — `output.icecast(%mp3(bitrate=192, ...))` in `liquidsoap/radio.liq`.

## Stopping it

```bash
cd docker && docker compose down
```

State (`auto.m3u`, `moods.json`, voice WAVs, archives) is persisted in `./state/`. Restart anytime with `docker compose up -d`.

## Known caveats

- **Containers run linux/amd64 under Rosetta on Apple Silicon.** Fine for testing; for production switch to native arm64 base images. Piper has no official arm64 binary release as of writing — would need to build from source.
- **Pre-picked AI tracks play before subsequent listener requests** (see [Listener requests](#listener-requests)).
- **Mood biasing only works after `npm run tag`.** Until then the picker uses starred + random.
- **Liquidsoap log can grow unbounded.** `state/logs/radio.log` has no rotation configured.
- **`/skip` endpoint is not implemented** — Liquidsoap controls pacing. Track-end is currently the only natural transition point.

## Tooling references

- [Liquidsoap docs](https://www.liquidsoap.info/doc-2.2.5/) — `crossfade`, `smooth_add`, `request.queue`, `playlist`
- [Icecast 2.4 docs](https://icecast.org/docs/icecast-2.4.1/)
- [Subsonic API](http://www.subsonic.org/pages/api.jsp) — Navidrome implements `1.16.1`
- [Piper TTS](https://github.com/rhasspy/piper)
- [Open-Meteo](https://open-meteo.com/) — free, no API key
