# SUB/WAVE — terminal player

A terminal listener for the SUB/WAVE radio station. It's the listener side of
the web player (`web/app/listen`) rendered in a TUI: now-playing, the
timeline, the live booth feed, and track requests. No admin, no settings.

It targets the same public controller API and the same Icecast stream as the
web player, so it needs **no controller changes**.

## Prerequisites

- Node.js ≥ 18
- For audio: [`mpv`](https://mpv.io) (preferred — supports live volume control)
  or `ffplay` (from FFmpeg). With neither installed the TUI still runs as a
  read-only dashboard.

## Install & run

```bash
cd tui
npm install
npm start                 # or: node bin/subwave-tui.js
```

Defaults point at the dev stack (controller on `:7701`, Icecast on `:7702`).

```bash
# Production — one origin behind Caddy:
node bin/subwave-tui.js --api https://your.host/api --stream https://your.host/stream.mp3

# Or via environment:
SUBWAVE_API_URL=https://your.host/api \
SUBWAVE_STREAM_URL=https://your.host/stream.mp3 \
  node bin/subwave-tui.js
```

## Keys

| Key       | Action                |
|-----------|-----------------------|
| `space`   | tune in / out         |
| `↑` / `↓` | volume (mpv only)     |
| `m`       | mute / unmute         |
| `1`       | timeline panel        |
| `2`       | booth feed panel      |
| `3` / `r` | request panel         |
| `?`       | shortcuts             |
| `q`       | quit                  |

In the request panel, `Enter` advances fields and sends; `Esc` closes it.

## Building a standalone binary

For shipping with the `subwave` CLI to operators who don't have Node, the TUI
also compiles to a single Bun binary (no Node, no `node_modules`, ~100MB).
Same matrix as the CLI; binaries land in `tui/dist/`:

```bash
cd tui
bun install
bun run build:all          # all 4 platforms
bun run build:linux-x64    # single target
```

The compiled binary is what `subwave play` fetches on demand from GitHub
releases for standalone-CLI installs; the cloned-repo path still runs the
`tsx`-loader version directly via `node bin/subwave-tui.js`.

`react-devtools-core` lives in `dependencies` only because Ink statically
imports it from `build/reconciler.js`; the import is gated by `DEV=true` at
runtime, but `bun build --compile` eagerly resolves the path, so the dep
must be installable to produce a working binary. ~1MB cost, no runtime effect.

## Notes

- Audio is played by an external `mpv`/`ffplay` child process pointed at the
  Icecast stream. Volume can only be changed live under `mpv`.
- No waveform or cover art — a child-process player exposes no PCM, and
  terminal image protocols are inconsistent. A progress bar stands in.
- The JSX modules under `src/` are transformed at import time by the `tsx`
  loader, so there is no build step for the Node entry point. The compiled
  Bun binary bundles them at build time instead.
- The classic-Winamp visuals are intentionally **static** (no animation
  tick) to avoid frame-flash in Ink — the marquee and faux spectrum
  refresh on the 5s station-feed poll, in lockstep with the elapsed
  clock. The Winamp palette + glyphs live in `src/theme.js`.
