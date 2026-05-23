# Deploying SUB/WAVE

Two modes (**dev** and **prod**), two install styles per mode (**no-clone** and
**cloned**), and two wizards (**browser** and **CLI**) that finish the job.
This doc shows every combination and when to use which.

---

## The 30-second version

| You want… | Run |
|---|---|
| **Hack on the code locally** (Mac smoke test, branch testing) | `git clone … && cd subwave && npm install && npm run setup` → pick **dev** |
| **Run a public station** on a Linux box, no source clone | `mkdir subwave && cd subwave && curl -O .../docker-compose.prod.yml && curl -O .../.env.example && mv .env.example .env && $EDITOR .env && docker compose -f docker-compose.prod.yml up -d && open https://your-host/onboarding` |
| **Run a public station** but you already have Traefik / nginx / your own Caddy | Same as above, but `docker-compose.byo-proxy.yml` |

Everything below is the longer version of those three rows.

---

## Modes: dev vs prod vs prod-byo

The three compose files at the repo root.

### `docker-compose.yml` — dev

For local hacking. Spins up **3 containers** (Icecast + Liquidsoap + Controller).
The web UI runs **outside Docker** as a Next.js dev server (`npm run dev` on
:7700) so JSX edits hot-reload instantly. `radio.liq` and `sounds/` are
**bind-mounted** so editing the mixer script or dropping in new audio
doesn't need a rebuild.

```bash
docker compose up -d                # icecast + liquidsoap + controller
cd web && npm run dev               # web UI on :7700, separate process
```

State lives at `./state/` (repo-local).

### `docker-compose.prod.yml` — production with bundled Caddy

For a public single-host deploy. Spins up **5 containers** (Caddy + Icecast +
Liquidsoap + Controller + Web). **Only Caddy binds a host port** (default
`:7700`); everything else is internal to the docker network and reachable
through Caddy's reverse proxy. Cloudflare is expected to terminate TLS in
front. `radio.liq`, `sounds/`, and the Caddyfile are **baked into images** —
no bind mounts, no clone needed.

```bash
docker compose -f docker-compose.prod.yml up -d
```

### `docker-compose.byo-proxy.yml` — production, your own reverse proxy

Same as prod, but **without the bundled Caddy**. If you already run Traefik,
nginx, your own Caddy, etc., use this variant. Web (`:7700`), Controller
(`:7701`), and Icecast (`:7702`) bind directly to host ports for your proxy
to front. Use `docker/Caddyfile` as the reference route table to replicate.

```bash
docker compose -f docker-compose.byo-proxy.yml up -d
```

---

## Install styles: no-clone vs cloned

Both prod modes work either way. Dev mode needs a clone (you're writing
code; the source has to live somewhere).

### No-clone install (prod / prod-byo)

The headline path. Two `curl`s, three env vars, then a browser wizard.

```bash
mkdir subwave && cd subwave
curl -O https://raw.githubusercontent.com/perminder-klair/subwave/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/perminder-klair/subwave/main/.env.example
mv .env.example .env
$EDITOR .env                                  # set ADMIN_USER, ADMIN_PASS, SITE_URL
docker compose -f docker-compose.prod.yml up -d
open https://your-host/onboarding             # browser wizard finishes setup
```

The browser wizard at `/onboarding` collects Navidrome, LLM, TTS engine,
DJ persona, and offers to render jingles. It writes:

- `state/setup-config.json` — Navidrome creds + the "setup complete" timestamp
- `state/secrets.env` (mode 0600) — cloud LLM/TTS API keys
- `state/settings.json` — DJ persona, jingle ratio, TTS choices (via the
  existing admin settings flow)

Env vars in `.env` always win when set — the wizard surfaces only fill in
fields env doesn't supply.

### Cloned install (any mode)

When you want the operator console (`npm start`), scripts (`update.sh`,
`generate-jingles.sh`, `health-check.sh`), or the terminal wizard. Same end
result, more tooling.

```bash
git clone https://github.com/perminder-klair/subwave.git
cd subwave
npm install
npm run setup                                 # terminal wizard, walks every step
```

The CLI wizard prompts for mode (dev / prod / prod-byo), runs preflight
(node, docker), collects Navidrome + LLM + admin creds + SITE_URL (prod
only) + timezone, then brings the stack up and renders jingles. Writes the
same `state/setup-config.json` + `state/secrets.env` the browser wizard
writes — both flows converge on the same files.

---

## The two wizards

| | CLI wizard (`npm run setup`) | Browser wizard (`/onboarding`) |
|---|---|---|
| Where it runs | Your terminal | A browser, anywhere |
| Requires | Node 20+, npm | A browser |
| Collects | Mode + Navidrome + LLM + admin + SITE_URL + TZ | Navidrome + LLM + TTS + DJ persona + jingles |
| Probes | Live (Navidrome ping, LLM tag call) | Live (via controller endpoints) |
| Persists to | `state/setup-config.json`, `state/secrets.env`, `.env`, POST `/settings` | Same |
| Renders jingles | Optional final step | One-click button on the Jingles step |
| Bypass with | `node bin/subwave setup` (skips npm) | Visit `/onboarding` after the stack is up |

**They write the same files.** Use whichever fits the situation — terminal
during a remote SSH session, browser when you'd rather click than type.

---

## Day-to-day

Once installed, these are the everyday commands:

```bash
# Operator console (cloned installs)
npm start                       # status + menu
npm start -- status             # snapshot of stack + now-playing + recent events
npm start -- doctor             # full diagnostic sweep
npm start -- logs controller    # tail one service
npm start -- restart liquidsoap # plain restart (radio.liq is bind-mounted in dev)
npm start -- restart controller # rebuild + recreate (source is COPY-d at build)

# Updates (cloned prod installs)
./scripts/update.sh             # git pull + rebuild changed services + recreate

# Render station idents
./scripts/generate-jingles.sh   # writes WAVs into state/jingles/

# Health probe (cron-friendly, exits 0/1)
./scripts/health-check.sh
```

For no-clone installs, the equivalents are:

```bash
docker compose -f docker-compose.prod.yml logs -f controller   # logs
docker compose -f docker-compose.prod.yml up -d                # restart after .env edit
docker compose -f docker-compose.prod.yml pull                 # pull newer images
docker compose -f docker-compose.prod.yml up -d                # recreate with new images
```

…or visit `/admin` (after signing in with `ADMIN_USER` / `ADMIN_PASS`) for
the graphical operator UI.

---

## State layout

Everything that survives `docker compose down` lives in `state/`:

| File / dir | Written by | What it's for |
|---|---|---|
| `setup-config.json` | Wizards | Navidrome creds + setup-complete timestamp |
| `secrets.env` (0600) | Wizards | Cloud LLM/TTS API keys, sourced into the controller's `process.env` on boot |
| `settings.json` | Admin UI / wizard | DJ personas, shows, schedule, TTS choices, weather location |
| `icecast-secrets.env` | `subwave-icecast` image | Auto-generated Icecast passwords on first boot (mode 0644 so liquidsoap can source) |
| `session.json` + `sessions/` | Controller | Live DJ session + archived past sessions |
| `queue.json` | Controller | Track queue snapshot (survives a controller restart) |
| `jingles/`, `jingles.m3u`, `jingles.json` | Controller / `generate-jingles.sh` | Rendered station idents |
| `voice/` | Controller | TTS WAVs rendered for each spoken segment |
| `archive/` | Liquidsoap | Hourly MP3 archive (`YYYY-MM-DD/HH-00.mp3`) |
| `logs/` | Controller + Liquidsoap | Event logs |
| `next.txt`, `say.txt`, `intro.txt`, `auto.m3u`, `now-playing.json` | Controller ⇄ Liquidsoap | File-based IPC (see `CLAUDE.md`) |

Back up `state/` to back up everything. Don't `git clean -dffx` without
checking — `state/` lives inside the repo by default (`STATE_DIR=./state`)
and contains all of the above.

---

## Configuration precedence

Three places config can come from. They win in this order:

1. **Env vars in the root `.env`** — `NAVIDROME_URL=…`, `ANTHROPIC_API_KEY=…`, etc.
2. **`state/setup-config.json`** (Navidrome) and **`state/secrets.env`** (API keys) — what the wizards write
3. **Built-in defaults** in `controller/src/config.ts`

So an operator who wants 12-factor-style deploys can put everything in
`.env` and never run a wizard. The wizard exists for everyone else.

For runtime config (DJ personas, jingle ratio, crossfade duration, TTS
engines, shows, schedule) — that's `state/settings.json`, edited live via
the admin UI at `/admin/settings`. No env-var equivalent for those; they
need to be UI-managed because the schema is too rich for env vars.

---

## When to pick what

| You're… | Use |
|---|---|
| Bootstrapping a new homelab box | No-clone prod install, browser wizard |
| Demoing on a Mac before a real deploy | Cloned dev, `npm run setup` |
| Adding a feature to the controller | Cloned dev, `npm run dev` for web hot-reload |
| Already running Traefik / nginx / Caddy | No-clone byo-proxy install |
| Want every config knob in env files for CI | Cloned prod, hand-edit `.env`, skip the wizard |
| Recovering a backup | Restore `state/` first, then `docker compose up -d` — wizards detect setup-config.json and skip themselves |

---

## What's intentionally not included

- **A `curl | sh` installer.** The two-file install (`curl docker-compose.prod.yml` + `curl .env.example`) is the deliberate "as simple as it can be without piping random scripts into your shell" line.
- **Multi-arch (arm64) images.** Piper, Kokoro, and Chatterbox wheels are amd64-only. Pin a Linux/amd64 host.
- **Multi-host / k8s.** SUB/WAVE is a personal radio station — one Icecast mount, one broadcast. Scaling horizontally would mean per-listener streams, which defeats the design.
