# jamendo-pull

Bulk-download **license-clear (Creative Commons)** tracks from the [Jamendo](https://www.jamendo.com)
v3 API for a SUB/WAVE demo library. Downloads MP3s, writes ID3 tags (so the
library tagger + Observatory have genre/mood signal), lays them out as
`Artist/Album/Track` for Navidrome, and emits a `CREDITS.md` attribution page.

Standalone — it imports nothing from the controller. Only dependency is
[`node-id3`](https://www.npmjs.com/package/node-id3).

## Why CC / Jamendo

A station **rebroadcasts** music as its content (public performance +
redistribution). Creative Commons and public-domain licenses explicitly permit
that; "royalty-free" stock libraries (Pixabay, Bensound, Uppbeat) usually only
cover *background in your own video* — wrong license shape for a radio station.
So this tool keeps strictly to CC. By default it accepts **BY, BY-SA, BY-NC,
BY-NC-ND**, all fine for a non-commercial demo that streams tracks unmodified.

Almost all CC tracks are **BY** → attribution is required. That's what
`CREDITS.md` is for: ship it as a credits page, and the DJ can read artist names
in the booth between tracks.

## Setup

```bash
cd tools/jamendo
npm install
```

Register a free app to get a `client_id`: https://developer.jamendo.com/v3.0/apps

## Usage

```bash
JAMENDO_CLIENT_ID=xxxxxxxx node pull.mjs [options]
```

Options (CLI flags override env):

| Flag | Default | Notes |
| --- | --- | --- |
| `--out <dir>` | `./jamendo-music` | Output library root. |
| `--limit <N>` | `2000` | Total tracks to end up with (counts what you already have). |
| `--licenses <list>` | `ccby,ccbysa,ccbync,ccbyncnd` | Comma list. Also: `ccbyncsa`, `ccbynd`, `cc0`. |
| `--tags <list>` | — | Exact Jamendo tags, e.g. `chill,electronic`. |
| `--fuzzytags <list>` | — | Looser tag match. |
| `--order <field>` | `popularity_total` | e.g. `releasedate_desc`, `downloads_total`. |
| `--concurrency <n>` | `4` | Parallel downloads. |

`JAMENDO_CLIENT_ID` can also be passed as `--client-id xxxx`.

### Examples

```bash
# Quick smoke test — 10 tracks
JAMENDO_CLIENT_ID=xxxx node pull.mjs --limit 10 --out ./test-out

# A few thousand chill/electronic tracks for the demo
JAMENDO_CLIENT_ID=xxxx node pull.mjs --limit 3000 --fuzzytags "chill electronic ambient"
```

## What you get

```
jamendo-music/
  Artist Name/
    Album Name/
      01 - Track Title.mp3   # ID3: title, artist, album, year, genre,
                             #      comment(license + jamendo id), TXXX tags, cover
  CREDITS.md                 # attribution table (drop-in credits page)
  credits.csv                # same, machine-readable
  _manifest.json             # downloaded ids — re-runs skip these (resumable)
```

Each ID3 `comment` records the exact license URL and Jamendo id; the `TAGS`
TXXX frame carries genres/instruments/vibes.

## Resumability & safety

- **Resumable**: re-running the same command skips anything already downloaded
  (by file presence and `_manifest.json`). The manifest + credits are flushed
  every 50 tracks, so a crash mid-run loses almost nothing.
- **License filter is client-side**: every track is checked against
  `license_ccurl` *and* `audiodownload_allowed` before it touches disk, so
  nothing un-redistributable can slip through even if a server-side param drifts.
- **Rate limits**: 429 / 5xx responses back off and retry (honouring
  `Retry-After`). The Jamendo free tier has a monthly request cap — a few
  thousand tracks is well within it.

## Getting it into Navidrome

This tool stops at a tagged local folder. Navidrome here is remote
(`music.klair.co`), so move the library onto its host and rescan, e.g.:

```bash
rsync -av jamendo-music/ user@navidrome-host:/path/to/music/jamendo/
# then trigger a scan in the Navidrome UI (or its scan API)
```

Keep this folder **outside** `state/archive` so SUB/WAVE's own hourly archive
mixdowns and this catalogue never get confused.
