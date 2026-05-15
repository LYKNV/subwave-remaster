# SUB/WAVE

A real internet radio station. Single Icecast stream — every listener hears the same broadcast at the same time. An LLM-driven DJ picks tracks based on what just played, the time of day, weather, festivals, and listener requests; TTS (Piper or Kokoro) speaks intros, links, and time-checks between tracks. The DJ has a name, a rotating pool of personas, and a configurable talk frequency — all editable from a web Settings panel under `/admin`.

```
                    ┌─────────────────────────────────────────┐
                    │           Listeners (browsers)          │
                    │      <audio src="…/stream.mp3">         │
                    │      PWA-installable; lock-screen       │
                    │      controls via MediaSession API      │
                    └────────────────────┬────────────────────┘
                                         │ HTTP audio
                    ┌────────────────────▼────────────────────┐
                    │              ICECAST                    │
                    │       (broadcast endpoint, CORS on)     │
                    └────────────────────▲────────────────────┘
                                         │ source connection
                    ┌────────────────────┴────────────────────┐
                    │           LIQUIDSOAP                    │
                    │  • polls next.txt / say.txt / intro.txt │
                    │  • smart crossfade w/ full-buffer fade  │
                    │  • dual ducking: heavy (voice) + light  │
                    │    (talk-over links) via smooth_add     │
                    │  • mic chain: compress → echo on TTS    │
                    │  • on_metadata → now-playing.json       │
                    │  • auto.m3u + emergency.mp3 fallback    │
                    │  • brick-wall limiter only (−1 dBFS) —  │
                    │    masters otherwise pass untouched     │
                    │  • hourly archive output                │
                    └────────────────────▲────────────────────┘
                                         │ writes URIs + WAV paths
                    ┌────────────────────┴────────────────────┐
                    │         CONTROLLER (Node.js)            │
                    │  • Express API (admin gate optional in  │
                    │    dev, mandatory in production)        │
                    │  • now-playing watcher (1.5s)           │
                    │  • LLM via AI SDK: request match, DJ    │
                    │    scripts, mood tagging, track picker  │
                    │  • TTS dispatcher (Piper + Kokoro) with │
                    │    per-kind engine override + fallback  │
                    │  • Scheduler: auto.m3u, time/weather/   │
                    │    station-ID — gated by DJ frequency   │
                    │  • settings.json (DJ persona, souls[],  │
                    │    mixer, weather, TTS routing)         │
                    │  • /cover/:id proxy for MediaSession    │
                    └─┬──────────┬──────────┬──────────────┬──┘
                      │          │          │              │
                  ┌───▼───┐  ┌───▼────┐ ┌───▼────────┐  ┌──▼──────────┐
                  │  LLM  │  │Navidrm │ │Piper+Kokoro│  │ Open-Meteo  │
                  │       │  │Subsonic│ │   TTS      │  │  (weather)  │
                  └───────┘  └────────┘ └────────────┘  └─────────────┘

                    ┌─────────────────────────────────────────┐
                    │       NEXT.JS WEB UI (App Router)       │
                    │  • /        — listener page OR landing  │
                    │               (SUBWAVE_HOMEPAGE flag)   │
                    │  • /listen  — always the player         │
                    │  • /landing — always the broadsheet     │
                    │  • /admin   — settings + debug          │
                    │               (single sign-in gate)     │
                    │  • PWA: installable, lock-screen        │
                    │    media controls, real cover art       │
                    └─────────────────────────────────────────┘
```

### Marketing landing vs player

`web/app/page.js` reads the `SUBWAVE_HOMEPAGE` env var at request time:

- `SUBWAVE_HOMEPAGE=landing` → renders the broadsheet landing with the live player embedded inline. Set this on the public marketing host.
- `SUBWAVE_HOMEPAGE=player` (default) → renders the fullscreen listener UI directly. Use this on private/Tailscale-only instances that don't need marketing.

The landing fetches a public `/api/dj` endpoint for the DJ's name and persona; everything else (now-playing, history, booth log) comes through the same 5-second polling used by the player.

## Why this architecture

Real radio = one stream, synced listeners. That needs a server-side audio mixer. Liquidsoap is the standard tool — what college radio, every small internet station uses. Icecast is the broadcast layer listeners connect to. The controller is the only bespoke piece; Liquidsoap and Icecast just do their well-understood jobs.

## What runs where

- **Icecast / Liquidsoap / Controller / Web / Caddy** — Docker Compose stack. Defaults assume `host.docker.internal` for the local Ollama.
- **LLM** — every model call goes through the Vercel AI SDK, so the provider is swappable from the admin Settings UI: Ollama (homelab default, no key), Anthropic, OpenAI, or the Vercel AI Gateway. Ollama runs on the host or any reachable host; default model `qwen2.5:7b`. Cloud API keys are read from the standard env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`) — see `controller/.env.example`.
- **Navidrome** — anywhere reachable. Controller talks Subsonic API.
- **Piper** — baked into the controller image, CPU-only. Default voice: `en_GB-alan-medium`.
- **Kokoro** — also baked into the controller image. Slower (~300–800 ms/line on CPU) but much more natural. British voice subset surfaced in Settings; default `bf_isabella`.
- **Web UI** — Next.js dev server on port 7700 (dev) or behind Caddy as part of the prod compose file.

## Directory layout

```
sub-wave/
├── controller/
│   ├── src/
│   │   ├── server.js          # Express entry: middleware + route mounting
│   │   ├── settings.js        # Durable settings (DJ persona/souls, mixer,
│   │   │                      # weather, TTS routing) + renderDjPrompt
│   │   ├── config.js          # Env-derived config (single source of truth)
│   │   ├── context.js         # Time / weather / festival → dominantMood;
│   │   │                      # getDateContext / getClockContext helpers
│   │   ├── routes/            # Express routers by surface: public, request,
│   │   │                      # settings, jingles, debug
│   │   ├── middleware/        # cors, admin auth, request rate-limiting
│   │   ├── music/             # subsonic client, moods.json store, LLM picker,
│   │   │                      # standalone library tagger
│   │   ├── broadcast/         # queue + watcher, scheduler, jingles, dj-gate,
│   │   │                      # liquidsoap telnet control, tagger process
│   │   ├── audio/             # TTS dispatcher + Piper / Kokoro engines
│   │   ├── llm/               # AI SDK layer: provider registry, sdk
│   │   │                      # primitives, DJ prompts, tools, speech, log
│   │   └── skills/            # DJ skills (weather, news, traffic, facts)
│   ├── scripts/
│   │   └── kokoro_worker.py   # Long-lived Python worker (model resident)
│   ├── package.json           # npm run tag → src/music/tag-library.js
│   └── .env.example
├── web/                       # Next.js 15 App Router (PWA)
│   ├── app/
│   │   ├── page.js            # Listener page OR landing (SUBWAVE_HOMEPAGE)
│   │   ├── listen/page.js     # Always the listener
│   │   ├── landing/page.js    # Always the broadsheet
│   │   ├── setup/             # Interactive onboarding walkthrough
│   │   ├── admin/             # Settings + debug, behind one sign-in gate
│   │   │   ├── page.js              # Overview
│   │   │   ├── settings/page.js     # SettingsPanel
│   │   │   └── debug/page.js        # DebugPanel
│   │   ├── manifest.js        # PWA manifest (icons, screenshots, display)
│   │   ├── icon.js / apple-icon.js  # Static launcher tiles
│   │   ├── icons/[size]/route.js    # Adaptive PNG icons
│   │   ├── screenshots/[variant]/route.js  # Install-dialog previews
│   │   └── layout.js          # Viewport-fit cover, Apple PWA metas
│   ├── components/
│   │   ├── PlayerApp.jsx      # Listener shell (audio + drawers)
│   │   ├── TopBar.jsx         # SUB/WAVE · with {djName} · time · weather
│   │   ├── CenterStage.jsx    # Now-playing title block
│   │   ├── Waveform.jsx       # Web Audio analyser, 120-bar render
│   │   ├── TransportBar.jsx   # Tune-in toggle, volume, elapsed, ticker
│   │   ├── DotRail.jsx        # Right-edge rail → queue/history/booth drawers
│   │   ├── BroadcastTicker.jsx # Inline voice+playing transcript
│   │   ├── ServiceWorkerRegister.jsx
│   │   ├── Landing.jsx        # Broadsheet wrapper
│   │   ├── landing/*          # Marketing sections (Masthead, Hero, …)
│   │   ├── admin/             # AdminShell, SettingsPanel, DebugPanel, SignInForm
│   │   ├── setup/             # Setup wizard UI
│   │   ├── drawers/           # Queue · History · Booth · Request
│   │   └── ui/                # Sheet, Toaster, primitives
│   ├── hooks/
│   │   ├── useStationFeed.js  # 5-s polling on /now-playing + /state
│   │   ├── usePlayer.js       # Audio el wrapper, tune in/out, volume
│   │   └── useMediaSession.js # OS lock screen / headphone / car controls
│   ├── public/sw.js           # Minimal service worker (avoids /sw.js 404)
│   └── .env.local             # NEXT_PUBLIC_API_URL / NEXT_PUBLIC_STREAM_URL
├── liquidsoap/
│   └── radio.liq              # Liquidsoap broadcast script (bind-mounted)
├── docker/
│   ├── docker-compose.yml         # Dev variant (no web container, no edge)
│   ├── docker-compose.prod.yml    # Prod (adds web + Caddy, host port 4800)
│   ├── Caddyfile                  # /api → controller, /stream.mp3 → icecast, else → web
│   ├── icecast.xml.template       # Rendered by setup.sh with random passwords
│   ├── Dockerfile.controller      # Node 22 + Piper + Kokoro (Python venv)
│   └── Dockerfile.liquidsoap
├── bin/
│   └── subwave                # `npm run setup` entry — interactive TUI
├── package.json               # Root manifest: wizard + dev/down/logs/rebuild aliases
├── scripts/
│   ├── setup.mjs              # Interactive setup wizard (@clack/prompts)
│   ├── setup.sh               # Idempotent, no-sudo: state dirs, .env, emergency.mp3
│   ├── generate-jingles.sh    # Render default station idents via Piper
│   ├── generate-bed.sh        # Render warm pink-noise studio bed loop
│   ├── health-check.sh        # On-air probe
│   └── update.sh              # Prod: git pull + rebuild + rolling recreate
└── state/                     # Bind-mounted shared volume
    ├── settings.json          # DJ persona + souls[], mixer, weather, TTS routing
    ├── auto.m3u               # Fallback playlist, refreshed every 60 min by default
    ├── jingles.m3u + jingles/ # Pre-recorded TTS stingers
    ├── emergency.mp3          # Pink-noise safety net
    ├── bed.mp3                # Continuous low-level studio bed (optional)
    ├── now-playing.json       # Written by Liquidsoap on every track change
    ├── moods.json             # LLM-tagged library (after running `npm run tag`)
    ├── liquidsoap_*.txt       # Tiny settings files Liquidsoap re-reads on start
    ├── voice/                 # TTS WAVs (auto-cleaned hourly)
    ├── archive/               # Hourly broadcast archives
    └── logs/radio.log
```

## Quick start (dev)

### Easy way — interactive wizard

Requires Node 20+ and Docker on the host — nothing else.

```bash
npm install
npm run setup
```

The wizard prompts for your Navidrome and Ollama details, writes `controller/.env`, runs `scripts/setup.sh` (icecast.xml, emergency.mp3, bed.mp3, docker/.env), brings up the dev docker stack, installs the web dependencies, waits for the controller to report on-air, optionally renders jingles, and optionally launches `next dev` on :7700 in the foreground.

Other npm scripts wrap the common loops:

| Script | What |
|---|---|
| `npm run setup` | Run the wizard end-to-end (alias: `npm run dev`) |
| `npm run dev:docker` | `docker compose up -d` in `docker/` |
| `npm run dev:web` | `next dev` on :7700 (in `web/`) |
| `npm run rebuild` | `docker compose up -d --build` (after controller source edits) |
| `npm run down` | Stop the docker stack |
| `npm run logs` | Tail docker compose logs |
| `npm run jingles` | Render station idents via Piper (dev compose) |

### Manual

```bash
# 1. Configure + state dir + emergency audio (idempotent)
./scripts/setup.sh
#   → creates state/, generates docker/.env with random Icecast passwords,
#     seeds controller/.env from .env.example, renders state/icecast.xml,
#     generates state/emergency.mp3 (ffmpeg borrowed from the Liquidsoap image)
# Edit controller/.env: NAVIDROME_URL / USER / PASS, OLLAMA_URL / MODEL

# 2. Web dev env (so the Next.js dev server hits the right hosts)
cat > web/.env.local <<EOF
NEXT_PUBLIC_API_URL=http://localhost:7701
NEXT_PUBLIC_STREAM_URL=http://localhost:7702/stream.mp3
EOF

# 3. Bring up the stack
cd docker && docker compose up -d --build

# 4. Web UI
cd ../web && npm install && npm run dev

# 5. Optional — render station idents
./scripts/generate-jingles.sh
```

Open:
- **Listener** — http://localhost:7700
- **Admin (settings + debug)** — http://localhost:7700/admin (admin-gated if `ADMIN_USER`/`ADMIN_PASS` are set)
- **Raw stream** — http://localhost:7702/stream.mp3
- **Icecast status** — http://localhost:7702/status-json.xsl

### Rebuild vs restart

- `controller`'s Dockerfile `COPY`s its source — source edits need `up -d --build controller`.
- `liquidsoap/radio.liq` is **bind-mounted** in both compose files, so script edits only need `docker compose restart liquidsoap` (no rebuild). A rebuild is only needed when `Dockerfile.liquidsoap` itself changes.
- `web` is hot-reloaded by `next dev` in development. The prod image is a Next.js standalone build — rebuild after web changes.

```bash
cd docker && docker compose up -d --build controller     # after controller/src/** edits
cd docker && docker compose restart liquidsoap           # after radio.liq edits
cd docker && docker compose up -d --build liquidsoap     # only if Dockerfile.liquidsoap changes
```

Note: `restart` keeps the existing container's env vars from creation time. For env changes use `up -d` to recreate and re-read `env_file`.

## Production (single host, Caddy edge)

```bash
sudo STATE_DIR=/var/lib/subwave ./scripts/setup.sh
docker compose -f docker/docker-compose.prod.yml up -d
./scripts/generate-jingles.sh
./scripts/update.sh   # git pull + rebuild + rolling recreate
```

Only Caddy binds a host port (`4800:80`); Icecast, Controller, Liquidsoap, and Web are internal. Cloudflare is expected in front for TLS (`auto_https off` in the Caddyfile).

**Production hardens the admin gate**: the controller image runs with `NODE_ENV=production`, which makes `ADMIN_USER` + `ADMIN_PASS` mandatory. The controller will refuse to boot without them — `/admin`, `/settings`, `/jingles`, `/debug`, and the tagger endpoint are too revealing to leave unauthenticated on a public deploy.

## PWA / mobile

The web app ships as an installable PWA:

- **Add to home screen / Install** works on iOS and Chromium — comes from `app/manifest.js`, `app/icon.js`, `app/apple-icon.js`, `app/icons/[size]/route.js`, and `app/screenshots/[variant]/route.js` (ImageResponse-rendered install-dialog previews).
- **OS media controls** are wired via the MediaSession API in `useMediaSession`. Lock screen, AirPods, CarPlay, and Bluetooth headphones get the current title / artist / **real album cover art** (proxied through the controller's `/cover/:id` so Subsonic credentials stay server-side). Play/pause toggle tunes the stream in/out. Skip is intentionally omitted on the public listener — a stray AirPods double-tap shouldn't skip the song for every other listener.
- **Safe-area handling** — `viewport-fit: cover` plus `env(safe-area-inset-*)` padding on the top/transport bars, so installed mode on notched iPhones clears the Dynamic Island and home indicator.
- **Service worker** — minimal stub at `web/public/sw.js` so installs don't 404 on `/sw.js`.

## Admin (`/admin`)

Everything used to live in an in-player modal + a standalone `/debug` route. As of `19e9514`, both are now under `/admin` behind a single sign-in gate (`AdminShell` + `useAdminAuth`):

- `/admin` — overview
- `/admin/settings` — DJ persona, mixer, weather, TTS routing, library tagger, jingles
- `/admin/debug` — live diagnostics: queue snapshot, recent LLM calls, library stats, scheduler info

### DJ persona

- **Name** — shown in the TopBar (`SUB/WAVE with <name>`) and injected into LLM prompts as `{name}`. Required.
- **Souls** — a list of 1–10 short persona descriptions. The DJ picks one at random per spoken line, layered with a random narrative "angle" (and opener-anti-repeat using recent on-air history), so back-to-back segments differ in register as well as content. Legacy single-`soul` settings.json files are migrated forward on load.
- **Talk frequency** — `quiet` / `moderate` / `aggressive`. Maps to:
  - DJ link interval between auto-played tracks (`pickLinkInterval` in `queue.js`).
  - Station ID cadence (once/twice/four times an hour).
  - Hourly time-check and weather-update gating in `scheduler.js`.
  - **Music selection is untouched** — frequency only controls how chatty the DJ is.
- **System prompt template (advanced)** — full editable template. Placeholders: `{name}` (required), `{soul}`, `{station}`, `{location}`. "Reset to default" restores the original.

All persona changes apply live — no mixer restart needed.

### TTS routing

- **Default engine** — Piper or Kokoro. Piper is the fast path (~30 ms/word). Kokoro is slower but more natural.
- **Per-kind override** — pin a specific engine for any of: `dj-speak`, `link`, `station-id`, `hourly-check`, `weather`, `jingle`. `null` (the default) falls back to the default engine.
- **Kokoro voice** — picker pre-loaded with the British subset (`bf_isabella`, `bm_george`, etc.). Any valid Kokoro voice id (`<lang><gender>_<name>`) is accepted.
- **Automatic failure fallback** — if the chosen engine errors out (e.g. Python worker crash), `tts.speak` retries on the other engine so the DJ never goes silent.

### Mixer settings (require Liquidsoap restart)

- **Crossfade duration** (sec) — feeds the full-buffer fade.in / fade.out used in the `cross` operator.
- **Jingle ratio** — 1 jingle every N music tracks.
- **Weather location** — lat / lng / display name (applies live; only crossfade + jingles need the restart).

### Library mood tags

- Track count by mood, last-update timestamp
- Run the tagger with an optional `--limit` ceiling
- Tagger log preview

### Jingles

- Create new TTS stingers from text (engine = whatever is selected for `jingle`)
- List + delete (built-in default ident is protected)

## Admin auth

The admin surface is open by default in dev — fine for local iteration on a private network. To require Basic auth, set both env vars in `controller/.env`:

```
ADMIN_USER=admin
ADMIN_PASS=<something good>
```

Then `docker compose up -d controller` (not `restart`). The prod compose file forces `NODE_ENV=production`, which makes both vars mandatory — the controller exits on startup if either is missing.

What's protected: `/settings` GET+POST, `/restart-mixer`, `/jingles` GET+POST+DELETE, `/auto-pick`, `/tag-library`, `/debug`.

What stays public: `/now-playing`, `/state`, `/request`, `/dj`, `/cover/:id`, `/health`.

The `/admin` UI shows an in-app sign-in form on 401 and caches `base64(user:pass)` in `localStorage`. There's a sign-out control inside the shell.

## How the auto-DJ picks tracks

The picker runs **once per track change**, fired by the now-playing watcher. By the time the current track ends, the next one is already sitting in Liquidsoap's `dj_queue`.

Candidate pool (mixed and capped at 18, then de-duped):

1. **Similar songs from the current track** — strongest contextual signal (`getSimilarSongs2`, Last.fm adjacency)
2. **Mood-tagged library** — tracks matching `dominantMood` from `state/moods.json`
3. **Mood-matched Navidrome playlists** — operator's hand curation (any playlist whose name contains the mood word)
4. **Recently-added albums** — surfaces new music without needing tags
5. **Frequent albums** — scrobble-backed favourites
6. **Similar-artist top songs** — adjacency through Last.fm artist graph (`getArtistInfo2` → `getTopSongs`)
7. **Starred + random** — final fallback if everything above is empty

Recently-played track IDs (last 25) are filtered out everywhere. Expensive lookups (playlists, recent/frequent albums, similar-artist) are memoised for 30 min so the per-pick load stays in single digits.

The LLM gets the last 8 plays (title, artist, moods, energy), the current context, and the candidate pool, and returns `{ id, reason }`. The reason and the candidate source label are both logged and visible on `/admin/debug`. An opt-in **agent path** (`settings.llm.pickerAgent`) instead hands the LLM the music-discovery tools in `llm/tools.js` and lets it search the library itself, falling back to the pool path on any failure.

If the LLM is down or returns garbage, the controller logs the error and does nothing — Liquidsoap falls back to `auto.m3u` (refreshed every 60 min by default from the same broad source mix) so audio never stops.

Toggle the LLM picker:

```bash
curl -X POST http://localhost:7701/auto-pick \
  -H 'Content-Type: application/json' \
  -u admin:secret \                          # only if admin auth is on
  -d '{"on": false}'
```

## Tagging the library

```bash
# Try 50 tracks first to sanity-check tag quality
docker exec sub-wave-controller npm run tag -- --limit 50

# Full library
docker exec sub-wave-controller npm run tag
```

Resumable; saves every 25 tags. Mood vocabulary:

> energetic, calm, reflective, celebratory, romantic, spiritual, focus, workout, driving, cooking, rainy, sunny, night, morning, evening, festival, cultural

Energy: `low | medium | high`. Stats appear on `/admin/debug` once at least one track is tagged.

## Listener requests

```bash
curl -X POST http://localhost:7701/request \
  -H 'Content-Type: application/json' \
  -d '{"text": "something for late-night driving", "name": "Alex"}'
```

Flow: the LLM parses intent → resolves it across several pick strategies (artist+sort like "latest album by X", search-term match, mood library, similar-to-current, dominant-mood, starred) → generates a contextual DJ intro that can weave the listener's own words into the announcement → TTS renders the intro WAV → both pushed to Liquidsoap. The intro plays through the heavy-duck `voice_queue` so the music drops well underneath.

Special cases handled directly: `more like this` plays another track by the current artist; rate-limiting returns a friendly 429 with `Retry-After`.

User requests jump to the front of the controller's `upcoming` queue. **Caveat:** an LLM pre-pick already sitting in Liquidsoap's `dj_queue` will still play before your request — it can't be cancelled from outside without telnet/server hooks.

The web Request drawer renders a success card on match (with the DJ's ack + queue position) and auto-closes after ~2.8 s; on no-match it shows an inline error so you can retry without losing the textbox contents.

## Scheduler segments

The DJ talk-frequency setting gates these (`quiet`/`moderate`/`aggressive`):

| When | What | quiet | moderate | aggressive |
|---|---|---|---|---|
| Top of every hour | Time-check | every 2nd hour | every hour | every hour |
| `:00`/`:15`/`:30`/`:45` | Station ID | `:45` only | `:15` + `:45` | all four |
| Every 15 min (on change) | Weather update | `:00` only | `:00` + `:30` | every 15 min |
| Every `AUTO_QUEUE_REFRESH_MINUTES` (default 60) | `auto.m3u` refresh | always | always | always |
| Hourly | Old voice WAV cleanup | always | always | always |

Plus randomised DJ links between auto-played tracks — interval scales with frequency (`quiet` 8-20 tracks, `moderate` 1-9 / 10-15, `aggressive` 1-3).

Voice routing:
- **Solo voice** (station ID, hourly, weather, listener-request intros) goes through `voice_queue` → **heavy duck** (`smooth_add` p=0.25, music drops to ~25%).
- **Talk-over links** between auto tracks go through `intro_queue` → **light duck** (p=0.40, ~40%) so the song you just queued stays audibly underneath.

## Endpoints (controller, port 7701)

Public:

| Method | Path | What |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/now-playing` | `{ nowPlaying, context, dj: { name }, listeners }` |
| GET | `/dj` | Public DJ + station info for the landing page |
| GET | `/state` | Queue snapshot — `{ current, upcoming, history, djLog }` |
| GET | `/cover/:id` | Cached proxy for Subsonic cover art (MediaSession) |
| POST | `/request` | Listener request — `{ text, name? }` |

Admin (gated when `ADMIN_USER`/`ADMIN_PASS` are set; mandatory in production):

| Method | Path | What |
|---|---|---|
| GET / POST | `/settings` | Read or update DJ persona / souls / mixer / weather / TTS routing |
| POST | `/restart-mixer` | Telnet → Liquidsoap shutdown → container restart |
| GET / POST / DELETE | `/jingles[/:filename]` | Manage pre-rendered TTS stingers |
| POST | `/auto-pick` | Toggle the LLM picker |
| POST | `/tag-library` | Kick off the mood tagger as a background process |
| GET | `/debug` | Everything-at-a-glance JSON |

## Stopping it

```bash
npm run down
# or, manually:
cd docker && docker compose down
```

State (`settings.json`, `moods.json`, voice WAVs, archives) is persisted in `./state/` (dev) or `${STATE_DIR:-/var/lib/subwave}` (prod). Restart anytime with `npm run dev:docker` (or `docker compose up -d`).

## Known caveats

- **Pre-picked AI tracks play before subsequent listener requests** (see [Listener requests](#listener-requests)).
- **Mood biasing only works after `npm run tag`.** Until then the picker pulls from similar-songs, recently-added, frequent, similar-artist, and starred without a tag filter.
- **Liquidsoap log can grow unbounded.** `state/logs/radio.log` has no rotation configured.
- **No `/skip` endpoint** — Liquidsoap controls pacing. Track-end is the only natural transition.
- **Admin auth uses Basic auth over HTTP** — fine behind Cloudflare/Caddy with TLS, but don't expose port 7701 raw to the internet.
- **Kokoro adds ~30 s of cold-start latency** on the first segment after a controller boot while the model loads in the Python worker. Subsequent calls reuse the resident process.

## Customisation (code-level, beyond Settings)

Things you can change without touching code now live in the Settings dialog (DJ name, souls, mixer, TTS routing, weather, jingles). Everything below still requires editing source:

- **Mood vocabulary** — `MOOD_VOCAB` in `controller/src/music/tag-library.js` (and the matching `mood` enum in the request-matcher's system prompt).
- **Picker behaviour** — `PICKER_SYSTEM` in `controller/src/llm/dj.js` defines the selection criteria; per-source caps (`CAP_SIMILAR`, `CAP_MOOD_LIBRARY`, …) live at the top of `controller/src/music/picker.js`.
- **Show clock** — `getTimeContext()` in `controller/src/context.js` maps hour-of-day to mood/vibe; `getDateContext` / `getClockContext` expose day/season/commute flags to the DJ prompts.
- **Festival calendar** — hardcoded list in `controller/src/context.js`.
- **Bitrate / format** — `output.icecast(%mp3(bitrate=192, …))` in `liquidsoap/radio.liq`.
- **Mic chain / ducking / broadcast bus** — all in `liquidsoap/radio.liq`. Bind-mounted, so changes only need `docker compose restart liquidsoap`.
- **Piper voice** — `PIPER_VOICE` / `PIPER_VOICE_CONFIG` env in `controller/.env` (paths inside the container).
- **Kokoro defaults** — `KOKORO_*` env in `controller/.env` (model, voices, default voice, speed). The Settings UI overrides the voice per-station.

## Tooling references

- [Liquidsoap docs](https://www.liquidsoap.info/doc-2.2.5/) — `crossfade`, `smooth_add`, `request.queue`, `playlist`
- [Icecast 2.4 docs](https://icecast.org/docs/icecast-2.4.1/)
- [Subsonic API](http://www.subsonic.org/pages/api.jsp) — Navidrome implements `1.16.1`
- [Piper TTS](https://github.com/rhasspy/piper)
- [Kokoro TTS](https://github.com/thewh1teagle/kokoro-onnx)
- [Open-Meteo](https://open-meteo.com/) — free, no API key

## Contributing

Bug reports, ideas, and pull requests are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).
Security issues should be reported privately per [`SECURITY.md`](SECURITY.md).

## License

SUB/WAVE is released under the [MIT License](LICENSE).
