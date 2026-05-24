---
name: subwave-control
description: Start or stop the SUB/WAVE radio stack (a personal internet radio station) in dev or production mode — no builds, no rebuilds, no config rendering. Use this skill any time the user wants to "start subwave", "stop subwave", "bring up the radio", "shut down the radio", "boot subwave in dev/prod", "turn subwave on/off", "is subwave running?", or otherwise just power the stack up or down. Detects which compose file (dev vs prod) is already running and matches it; if nothing is running, asks dev or prod. Dev mode also launches the Next.js web dev server on :7700 in the background. Always verifies the stream is on-air after a start. Do NOT use this skill for first-time setup, `git pull` + rebuilds, jingle generation, or config changes — that's `subwave-deploy`. If the user asks for any of those, hand off rather than starting.
---

# SUB/WAVE control

Bring the SUB/WAVE stack up or down. Nothing more. No builds, no pulls, no setup — if any of those are needed, hand off to the `subwave-deploy` skill.

This skill is checked into the SUB/WAVE repo. The repo root is the git
repository that contains this skill — derive it once, don't hardcode it:

```bash
REPO=$(git -C "<this skill's base directory>" rev-parse --show-toplevel)
```

`<this skill's base directory>` is the absolute path shown as "Base directory
for this skill" when the skill loads. All `docker compose` invocations run from
`docker/` inside `$REPO`. Shell state does not persist between commands, so
re-derive `$REPO` (or substitute its value) in each command block below.

## The three things you need to know

1. **Two compose files = two modes.**
   - **Dev** — `docker-compose.dev.yml`: Icecast + Liquidsoap + Controller only. Web runs separately as `npm run dev` on the host (port `7700`).
   - **Prod** — `docker-compose.yml`: adds `web` (built image) and `caddy` (edge router). Only Caddy binds a host port. State defaults to `<repo>/state` (override with the `STATE_DIR` env).

2. **Service ports (post-renumber):** Web `7700`, Controller `7701`, Icecast `7702`. The controller's `/health` endpoint returns `{"status":"on-air"}` once Liquidsoap is connected to Icecast — that's the canonical "is it up?" check.

3. **Web dev is hot-reloaded but must be launched separately in dev mode.** `npm run dev` in `web/` is a long-running foreground process; in this skill, always run it as a background task. The Next.js port `7700` collides with macOS AirPlay Receiver in some setups — if you get `EADDRINUSE` on `:7700`, check `lsof -nP -iTCP:7700 -sTCP:LISTEN` and surface the conflict to the user rather than guessing.

## Workflow

### Step 0 — Detect what's running

```bash
cd "$REPO"
RUNNING_DEV=$(docker compose -f docker-compose.dev.yml ps -q 2>/dev/null)
RUNNING_PROD=$(docker compose -f docker-compose.yml ps -q 2>/dev/null)
WEB_DEV_PID=$(lsof -nP -iTCP:7700 -sTCP:LISTEN -t 2>/dev/null | head -1)
```

| State | RUNNING_DEV | RUNNING_PROD | WEB_DEV_PID |
|---|---|---|---|
| Nothing up | empty | empty | maybe (AirPlay) |
| Dev up | non-empty | empty | non-empty (next dev) |
| Prod up | empty | non-empty | empty |
| Both up | non-empty | non-empty | — (anomaly; ask user) |

For start: if neither is up, ask the user which mode. If one is already up, treat the request as a no-op and just verify health.

For stop: target whichever is currently up. If nothing is up, say so and stop.

### Step 1 — Start (dev)

```bash
cd "$REPO/docker" && docker compose up -d
```

Then start the web dev server (run it in the background — do not block waiting for it):

```bash
cd "$REPO/web" && npm run dev
```

If `web/node_modules` is missing, run `npm install` first. If `:7700` is already taken by something other than a prior `next dev` (e.g. macOS `ControlCenter` for AirPlay), surface the conflict to the user — do not try to kill ControlCenter.

### Step 1 — Start (prod)

```bash
cd "$REPO"
docker compose -f docker-compose.yml up -d
```

State goes to `<repo>/state` unless `docker/.env` (or the environment) sets `STATE_DIR` — compose picks that up on its own, no need to pass it.

No host-side web dev server in prod — Caddy serves the built `web` container.

### Step 2 — Verify on-air

Give Liquidsoap ~5 seconds to connect to Icecast, then probe the controller:

```bash
sleep 5
curl -sf http://localhost:7701/health    # dev — controller exposed directly
# or, in prod, via the Caddy port (read from `docker compose -f docker-compose.yml port caddy 80`)
```

Expect `{"status":"on-air"}`. In dev also verify the web UI: `curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:7700` → expect `200`.

If the health probe fails, peek at `docker compose logs --tail=30 controller liquidsoap` and surface the relevant error. Do **not** rebuild — that's `subwave-deploy`'s territory.

### Step 1 — Stop (dev)

```bash
# Stop the web dev server first (it holds :7700)
WEB_DEV_PID=$(lsof -nP -iTCP:7700 -sTCP:LISTEN -t 2>/dev/null | head -1)
[ -n "$WEB_DEV_PID" ] && kill "$WEB_DEV_PID"
cd "$REPO/docker" && docker compose down
```

If `:7700` is held by `ControlCenter` (AirPlay) and not `node`, skip the kill — don't kill ControlCenter. Confirm with `lsof -nP -iTCP:7700 -sTCP:LISTEN` and check the COMMAND column before sending the signal.

### Step 1 — Stop (prod)

```bash
cd "$REPO" && docker compose -f docker-compose.yml down
```

Do **not** add `-v` (would wipe the named volumes for Caddy data/config) unless the user explicitly asks. State at `${STATE_DIR}` is a host bind mount and is not affected by `down` either way.

## Allowed without confirmation

- `docker compose up -d` and `docker compose down` against either compose file
- `npm run dev` / killing the foreground `next dev` process on `:7700`
- `npm install --prefix web` if `node_modules` is missing
- Reading logs, running `curl` health probes

## Confirm before running

- `docker compose down -v` (wipes volumes — Caddy data/config in prod)
- Any `rm`/`docker volume rm`/`docker system prune`
- Killing a non-`node` process holding `:7700`
- Anything that touches `state/`, `controller/.env`, `docker/.env`, or the rendered `icecast.xml`

## When to hand off to `subwave-deploy`

If the user wants any of these, this skill is not the right one — invoke `subwave-deploy` instead:

- First-time setup, `scripts/setup.sh`, rendering `icecast.xml`
- `git pull` + rebuild + recreate
- Source changes in `controller/`, `liquidsoap/`, or `web/` that need `up -d --build`
- Generating jingles
- Editing env or config
