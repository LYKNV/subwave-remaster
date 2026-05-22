---
name: subwave-worktree-dev
description: >-
  Stage a SUB/WAVE git worktree so the dev stack can run from it, then start it.
  A git worktree only checks out tracked files — the dev stack also needs
  gitignored files (controller/.env, web/.env.local, docker/.env, web/node_modules,
  and a state/ directory) that this skill copies or scaffolds from the main
  working tree. Use this skill whenever the user wants to test branch changes in
  a worktree, run subwave from a worktree, "prep"/"set up" a worktree for dev
  mode, or asks to copy env files / node_modules / state into a worktree —
  phrases like "test this worktree in dev mode", "start subwave from the
  worktree", "prep the worktree", "run my branch locally", "copy the required
  files into the worktree". Do NOT use it for the main checkout (that's
  subwave-control) or for production.
---

# SUB/WAVE worktree dev setup

Get the SUB/WAVE dev stack running from inside a **git worktree** so branch
changes can be tested without touching the main checkout.

## Why a worktree needs prep

A worktree checks out every **tracked** file, so all source is already there.
But the dev stack also depends on **gitignored** files that do not travel with
a worktree checkout:

| File | Why the stack needs it |
|---|---|
| `controller/.env` | Dev compose declares `env_file: ../controller/.env` — the controller container will not start without it. Holds Navidrome + Ollama config. |
| `web/.env.local` | Dev API/stream URL overrides (`NEXT_PUBLIC_API_URL` etc.). Without it the web UI defaults to same-origin `/api` and cannot reach the controller. |
| `docker/.env` | Compose variable substitution. |
| `web/node_modules` | Needed by `npm run dev`. |
| `state/` | Bind-mounted into the containers; `state/icecast.xml` is mounted straight into the icecast container. A worktree's `state/` is empty. |

`state/` is scaffolded **fresh** — directory structure only. Settings, sessions,
queue, and library mood data are *not* copied, so the worktree station boots
clean and the controller writes its own defaults. The sole copied file is
`state/icecast.xml`: it is a rendered config carrying the Icecast passwords and
cannot be regenerated without the operator's inputs.

## Two load-bearing facts

1. **One stack at a time.** Both compose files use fixed container names
   (`sub-wave-icecast`, …) and host ports (Web `7700`, Controller `7701`,
   Icecast `7702`). A worktree stack and the main-checkout stack collide — stop
   whatever is running before starting another.
2. **Controller changes need `--build`, web changes do not.** The `controller`
   image `COPY`s its source at build time, so testing worktree controller code
   requires `docker compose up -d --build`. The web dev server (`npm run dev`)
   hot-reloads from the worktree filesystem, so UI changes appear with no build.

## Workflow

### Step 0 — Identify the worktree

The target worktree is usually the session's current directory. Confirm it is a
linked worktree and not the main checkout:

```bash
git rev-parse --absolute-git-dir          # a worktree's is <main>/.git/worktrees/<name>
git worktree list                         # shows the main tree + every linked worktree
```

If the user named a specific worktree path, use that.

### Step 1 — Stop any running stack

Only one stack can run. Stop whatever is up (it may be the main checkout's):

```bash
# Kill the web dev server if it holds :7700 — but only if it is `node`,
# never macOS ControlCenter/AirPlay.
WEB_PID=$(lsof -nP -iTCP:7700 -sTCP:LISTEN -t 2>/dev/null | head -1)
[ -n "$WEB_PID" ] && ps -p "$WEB_PID" -o comm= | grep -qi node && kill "$WEB_PID"

# Bring down whichever dev stack is up (run from any checkout's docker/ dir —
# same compose project name, so this targets the running containers).
docker compose -f <some-checkout>/docker/docker-compose.yml down
```

### Step 2 — Prep the worktree

Run the bundled script. It copies the env files, scaffolds a fresh `state/`,
and runs `npm install` for the web app. `<skill base directory>` is the
absolute path shown as "Base directory for this skill" when the skill loads.

```bash
bash "<skill base directory>/scripts/prep-worktree.sh" <worktree-path>
```

Flags: `--reset-state` wipes and re-scaffolds `state/` (use when the user wants
a clean slate); `--skip-npm` skips the dependency install (use when
`node_modules` is already good). The script is idempotent — re-running it only
fills in what is missing.

### Step 3 — Start the stack from the worktree

```bash
cd <worktree-path>/docker && docker compose up -d --build
```

`--build` is required so the worktree's controller source is baked into the
image. The first build is slow (all services); later builds only rebuild
changed layers. Then start the web dev server **in the background** (it is a
long-running foreground process):

```bash
cd <worktree-path>/web && npm run dev
```

### Step 4 — Verify on-air

Give Liquidsoap ~5s to connect to Icecast, then probe the controller:

```bash
sleep 5
curl -sf http://localhost:7701/health                               # expect {"status":"on-air"}
curl -sf -o /dev/null -w '%{http_code}\n' http://localhost:7700      # expect 200
```

If `/health` fails, peek at `docker compose logs --tail=30 controller liquidsoap`
and surface the error. A fresh `state/` is normal — an empty queue and default
settings on first boot are expected, not faults.

## Iterating

- **Web/UI change** — nothing to do; `npm run dev` hot-reloads it.
- **Controller source change** — rebuild just that service:
  `cd <worktree-path>/docker && docker compose up -d --build controller`.
- **`liquidsoap/radio.liq` change** — it is bind-mounted; just
  `docker compose restart liquidsoap`.

## Allowed without confirmation

- Running `scripts/prep-worktree.sh` (copies env files, scaffolds `state/`, `npm install`)
- `docker compose up -d --build` / `down` against a worktree's dev compose file
- `npm run dev` / killing a `node` process on `:7700`
- Reading logs, `curl` health probes

## Confirm before running

- `--reset-state` when `state/` already has real data the user may want
- `docker compose down -v` (wipes volumes)
- Killing a non-`node` process on `:7700`
- Touching the **main checkout's** `controller/.env`, `state/`, or config

## When NOT to use this skill / hand off

- **Main checkout**, not a worktree → use `subwave-control` to start/stop.
- **Production** (`docker-compose.prod.yml`) → use `subwave-control`.
- First-time repo setup, `git pull` + rebuild, jingle generation, config
  changes → use `subwave-deploy`.
