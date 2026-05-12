# How SUB/WAVE Works — In Simple Language

A plain-English walkthrough of how music travels from Navidrome to the listener's
browser, how the AI DJ decides when to talk, and what each piece does.

---

## The Mental Model

Think of SUB/WAVE like a real radio station with these roles:

| Component | Role | What it does |
|---|---|---|
| **Controller** (Node.js) | The DJ — the brain | Picks songs, decides when to talk, writes scripts |
| **Liquidsoap** | The DJ deck / mixing console — the hands | Crossfades, ducks music for voice, runs effects, sends to transmitter |
| **Icecast** | The transmitter tower | Takes the mixed signal and broadcasts it to all listeners |
| **Navidrome** | The record crate | The music library the DJ digs through |
| **Piper** | The DJ's voice / microphone | Turns text into spoken WAV files |
| **Ollama** | The DJ's inner monologue | The LLM that writes the actual words and picks tracks |
| **Caddy** | The front desk | Routes incoming web traffic to the right backend |
| **Shared folder `/var/sub-wave/`** | The DJ booth | Where the brain and hands pass notes to each other |

The Controller is "smart but slow." Liquidsoap is "dumb but reliable." They talk
to each other by leaving little text files in a shared folder — no sockets, no
APIs, no fancy wiring. Just notes slid across the desk.

---

## How Music Travels from Navidrome to `stream.mp3`

### 1. The Controller picks a song
A Node.js app talks to Navidrome's Subsonic API (using salt+token MD5 auth, never
plaintext) and asks for a song — via search, random pick, genre, or LLM-driven
mood matching. Navidrome returns the song's metadata and a streamable URL.

### 2. The URL gets wrapped with metadata
The Controller wraps the URL in Liquidsoap's `annotate:` syntax so the title,
artist, album, and Subsonic ID are baked in up front:

```
annotate:title="Song",artist="Band",album="Record",subsonic_id="123":subhttp:https://navidrome/...
```

This means the "now playing" data is correct *immediately* — Liquidsoap doesn't
have to wait for ID3 tags to arrive in the stream.

### 3. The Controller writes a note
It scribbles the annotated URL into `/var/sub-wave/next.txt`.

### 4. Liquidsoap reads the note
Liquidsoap checks `next.txt` every 1.0 seconds. When it sees the file, it reads
it, **deletes it**, and adds the song to its play queue.

### 5. Liquidsoap fetches the actual audio
The URL starts with `subhttp:`, a custom protocol defined in `radio.liq`. It
shells out to `curl` to download the MP3. (We use curl instead of Liquidsoap's
built-in fetcher because Cloudflare-fronted Navidrome was returning spurious 522
errors against the built-in client.) If `MUSIC_LIBRARY_PATH` is set, it reads
from a local file path instead — much faster than streaming over HTTP.

### 6. Liquidsoap mixes it like a real radio
The audio flows through this pipeline:

```
dj_queue (Controller-fed)
  ↓ fallback to
auto_playlist (auto.m3u, mood-based)
  ↓
smart crossfade (4–10s, loudness-aware)
  ↓
smooth_add voice over music (sidechain duck)
  ↓
studio bed mixed underneath (low-volume room tone)
  ↓
rotate jingles (1 jingle per ~30 tracks)
  ↓
fallback to emergency.mp3 (if everything fails)
  ↓
blank.skip (skip on >5s of silence)
  ↓
normalize to -14 LUFS
  ↓
bus compressor (gentle glue)
  ↓
brick-wall limiter at -1 dBFS
```

### 7. Out to Icecast
`output.icecast` encodes the final mix as MP3 (192 kbps, 44.1 kHz stereo) and
pushes it to the `icecast:8000` container on mount `/stream.mp3`. In parallel,
`output.file` writes hourly archive MP3s to `archive/YYYY-MM-DD/HH-00.mp3`.

### 8. Caddy hands it to the listener
The listener's browser requests `/stream.mp3`. Caddy proxies it to
`icecast:8000` with `flush_interval -1` so audio isn't buffered. Icecast fans
out the same live stream to every connected listener — everyone hears exactly
the same thing at the same moment.

### 9. Metadata flows back the other way
Liquidsoap's `music.on_metadata(on_meta)` hook fires on every track change and
writes `/var/sub-wave/now-playing.json`. The Controller polls this every 1.5s
and uses it to update the web UI's "now playing" display.

---

## How the AI DJ Speaks Perfectly Over Music

### The core trick: `smooth_add` with sidechain ducking

Two audio sources mixed together — one automatically dips in volume when the
other speaks:

```liquidsoap
radio = smooth_add(p=0.15, normal=music, special=voice)
radio = smooth_add(p=0.40, normal=radio, special=intro)
```

- `normal` = the music (always playing underneath)
- `special` = the DJ voice (only plays sometimes)
- `p` = how much the music gets ducked when the voice speaks
  - `p=0.15` → music drops to 15% (heavy duck — voice dominates, used for
    station IDs, weather, hourly time)
  - `p=0.40` → music drops to 40% (light duck — talk-over feel, used for DJ
    links between songs)

When the voice file finishes, the music smoothly rises back to full volume. No
abrupt cuts.

### The "mic chain" — why it doesn't sound robotic

Raw Piper TTS output is flat and dry. Before mixing, the voice goes through a
simulated broadcast studio mic chain:

1. **Compressor** — fast attack, gentle 4:1 ratio. Squashes peaks, brings the
   body of the voice forward.
2. **Makeup gain** — lifts the voice ~3 dB so it sits clearly above the ducked
   music bed.
3. **Slap echo** (40 ms delay) — adds a tiny bit of room so the voice doesn't
   feel "stuck on top" of the music.

The result sounds like a DJ in a real broadcast booth instead of a TTS bot
floating in space.

---

## How the DJ Knows *When* to Talk

Liquidsoap doesn't decide *when* — the **Controller** does. Liquidsoap just plays
whatever WAV path shows up in its voice files.

### 1. Scheduled events (`controller/src/scheduler.js`)
Uses **node-cron** to fire at fixed times:
- **Every hour at `:00`** — speak the time + optional weather snippet
- **At `:15` and `:45`** — station ID ("You're listening to SUB/WAVE…")
- **Every 30 min** — check weather, only speak if conditions changed
- **Every 10 min** — refresh the auto playlist for the current mood

Each of these calls `queue.announce(text, kind)` → generates a WAV via Piper →
writes the WAV's path into `say.txt`.

### 2. DJ links between songs (`queue.js`)
After every song, a counter (`tracksUntilLink`) ticks down. When it hits zero:
- The LLM (Ollama) generates a short script referencing the previous and next track
- Piper renders it to a WAV
- Path goes into `intro.txt` (talk-over channel — light duck)
- Counter resets to a new random gap

Frequency settings:
- `quiet` → 8–20 tracks between links
- `moderate` → mostly 1–9, occasionally 10–15
- `aggressive` → 1–3 tracks

### 3. Listener requests
When someone requests a track:
1. Controller writes the intro WAV path to `say.txt` **first**
2. Waits 200–250 ms
3. Then writes the song URL to `next.txt`

This ordering guarantees the DJ speaks the intro *before* the song starts.

### End-to-end: one DJ moment

When the Controller wants the DJ to say "It's 3 PM on SUB/WAVE…":

1. Controller asks Ollama to generate the script text
2. Controller calls `piper.speak(text)` → spawns Piper CLI → writes
   `/var/sub-wave/voice/abc123.wav`
3. Controller writes the path `/var/sub-wave/voice/abc123.wav` into `say.txt`
4. Liquidsoap's `poll_voice()` fires (every 0.5 s), sees the file, reads it,
   **deletes** `say.txt`
5. Liquidsoap pushes the WAV onto `voice_queue`
6. The WAV runs through `mic_chain` (compressor + gain + echo)
7. `smooth_add(p=0.15, …)` ducks the music to 15%, plays the voice
8. WAV finishes → music smoothly rises back to 100%
9. WAVs older than 1 hour get cleaned up by a scheduled job

---

## All the Files Liquidsoap Uses

Everything lives in the shared `/var/sub-wave/` folder.

### Files Liquidsoap reads (input)

| File | Purpose | Poll interval |
|---|---|---|
| `next.txt` | Next song URL to play | 1.0 s |
| `say.txt` | WAV path for solo DJ voice (heavy duck) — station ID, hourly time, weather | 0.5 s |
| `intro.txt` | WAV path for talk-over DJ links between songs (light duck) | 0.5 s |
| `auto.m3u` | Fallback playlist used when nothing's queued | Auto-reload on change |
| `jingles.m3u` | List of station jingles | Auto-reload on change |
| `emergency.mp3` | "Technical difficulties" loop if everything else fails | On demand |
| `bed.mp3` | Optional low-volume ambient room tone under the mix | At startup |
| `liquidsoap_jingle_ratio.txt` | One number: how often to play a jingle | At startup |
| `liquidsoap_crossfade.txt` | One number: crossfade length in seconds | At startup |

### Files Liquidsoap writes (output)

| File | Purpose |
|---|---|
| `now-playing.json` | Current song info (title, artist, album, ID) for the web UI |
| `archive/YYYY-MM-DD/HH-00.mp3` | Hourly recordings of the broadcast |
| `/var/log/liquidsoap/radio.log` | Liquidsoap's own log file |

### How the file handoff works

1. Controller drops a file in `/var/sub-wave/`
2. Liquidsoap notices it on the next poll
3. Liquidsoap reads the contents
4. Liquidsoap **deletes the file** so it doesn't reprocess
5. Liquidsoap acts on the contents (queue the track, speak the voice, etc.)

This is the entire "messaging system" between the two processes. No sockets,
no RPC, no API calls. Just notes slid across the booth.

---

## What Language Is Liquidsoap Written In?

Two layers here:

- **Liquidsoap itself** (the program) is written in **OCaml**.
- **`radio.liq`** (the script in this repo) is written in **Liquidsoap's own
  scripting language** — a small custom DSL designed just for describing audio
  pipelines. It looks a bit like a mix of OCaml and a config file: `def`, `fun`,
  `ref`, function chaining, etc. Things like `fallback(...)`, `crossfade(...)`,
  `smooth_add(...)`, `output.icecast(...)` are all built-in operators in that DSL.

So: the engine is OCaml, but you don't write OCaml to use it — you write `.liq`
scripts.

---

## TL;DR

- **Controller = DJ** (decides what and when)
- **Liquidsoap = DJ deck** (mixes and plays)
- **Icecast = transmitter** (broadcasts to everyone)
- **They communicate by leaving text files in a shared folder** — that's the
  whole IPC system, and it's why the system is easy to debug: just `cat` the
  files.
