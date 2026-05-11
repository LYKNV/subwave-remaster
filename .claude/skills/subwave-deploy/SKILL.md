---
name: subwave-deploy
description: Pull the latest changes for SUB/WAVE (personal radio station at /home/klair/Projects/subwave), rebuild only the Docker services whose code actually changed, recreate them, and verify the stream is on-air. Use this skill any time the user wants to update, deploy, sync, redeploy, refresh, restart, or "pull and restart" SUB/WAVE — including phrases like "pull subwave", "update the radio", "deploy subwave", "rebuild controller", "restart sub-wave", "redeploy after pull", "git pull and restart as needed", "check if the stream is healthy", "is subwave up", or simply "deploy" while in the subwave repo. Trigger proactively whenever the user is working in /home/klair/Projects/subwave and mentions deploying, updating, rebuilding, restarting, or checking the running stack — even if they don't name the skill. Free to pull, rebuild, recreate, and run health probes; confirm before destructive ops like wiping `state/`, removing volumes, or full `down -v`.
---

# SUB/WAVE deploy

Bring the running SUB/WAVE radio stack up to whatever's on `main` with minimum churn: pull, rebuild only the services whose source actually changed, recreate them, and verify the stream is on-air. A clean pull-and-verify (no rebuild) should take seconds; a full rebuild a minute or two.

The user has authorised free action on this hot path — `git pull`, `docker compose build`, `up -d`, log scans, health probes. Pause and confirm only for the genuinely destructive moves listed at the bottom.

## The five facts the workflow turns on

1. **Two compose files, two shapes.**
   - `docker/docker-compose.yml` — dev variant (Mac smoke-test): Icecast + Liquidsoap + Controller only. Web runs separately via `npm run dev`. State at `../state`.
   - `docker/docker-compose.prod.yml` — production single-host: adds `web` and `caddy`. **Only Caddy binds a host port.** State at `${STATE_DIR:-/var/lib/subwave}`.
   - Detect which is up from `docker compose -f <file> ps`. On this host, prod is the live one and Caddy is mapped to host port `4800` (`0.0.0.0:4800->80/tcp`), not `80` as the README suggests — always read the port from `ps`, never hardcode.

2. **Controller and Liquidsoap COPY source at build time, they do not bind-mount it.** `docker compose restart <svc>` reruns the *same baked-in code* and does nothing for source changes. Source changes need `up -d --build <svc>`. This is the single most common deploy mistake.

3. **Web in dev is hot-reloaded** (Next.js `npm run dev`); web in prod is a built standalone image and needs `--build` on any `web/**` change.

4. **The IPC between Controller and Liquidsoap is file-based** through the shared `state/` (mounted at `/var/sub-wave`). When you recreate one of them, in-flight `next.txt`/`say.txt`/`now-playing.json` may be mid-write — accept a few-second blip; don't keep recreating to "fix" it.

5. **Compose dependency ordering will recreate more than you asked for.** Asking to recreate `controller` and `web` will also recreate `liquidsoap` because of the `depends_on` graph. That's fine — same image, no source change means no behaviour change. Don't be surprised by it and don't fight it.

## Workflow

### Step 1 — Locate the repo and detect the stack

```bash
cd /home/klair/Projects/subwave

# Which compose file is live? Whichever has containers up.
docker compose -f docker/docker-compose.prod.yml ps
docker compose -f docker/docker-compose.yml      ps
```

If neither shows running containers, the stack is down — surface that to the user and stop. Don't auto-start it; bringing the radio up is a deliberate action, not an idle deploy.

For the rest of this skill, `COMPOSE` means whichever file is live. Almost always `docker/docker-compose.prod.yml`.

### Step 2 — See what's incoming

```bash
git fetch
git status -sb                          # branch tracking + dirty files
git log HEAD..@{u} --oneline            # commits about to be pulled
git diff --name-only HEAD..@{u}         # files about to change
```

- Local clean and zero incoming commits → skip to Step 5 (verify only).
- Uncommitted local changes → `git status` will show them. Don't `git pull` blindly over them. Surface to the user and ask whether to stash, commit, or abort.
- Diverged history (local ahead AND behind) → pause and ask; don't auto-merge or rebase.

### Step 3 — Map changed files to services

Run through the diff and bucket files into actions. Mapping table (paths are relative to repo root):

| Changed path                              | Action                                    |
|-------------------------------------------|-------------------------------------------|
| `controller/src/**`                       | rebuild + recreate `controller`           |
| `controller/Dockerfile*`                  | rebuild + recreate `controller`           |
| `controller/package*.json`                | rebuild + recreate `controller`           |
| `liquidsoap/radio.liq`                    | rebuild + recreate `liquidsoap`           |
| `liquidsoap/Dockerfile*`                  | rebuild + recreate `liquidsoap`           |
| `web/**` (prod stack)                     | rebuild + recreate `web`                  |
| `web/**` (dev stack, separate `npm run dev`) | no docker action — hot-reloads in user's terminal |
| `docker/Caddyfile`                        | `docker compose ... restart caddy` (no rebuild — Caddy reloads from mount) |
| `docker/docker-compose*.yml`              | `docker compose ... up -d` (compose re-applies; will only recreate what diff-affected services) |
| `docker/icecast.xml*` or its template     | `docker compose ... up -d --force-recreate icecast` (it's a config-file change, image is upstream) |
| `scripts/**`, `state/**` (excluding code), `*.md`, `README.md`, `CLAUDE.md`, `.env.example`, `TODO.md` | no action needed |
| `.env` at repo root                       | `docker compose ... up -d` to pick up new env values (compose detects env-changes and recreates affected services) |

If the diff is empty after categorising (e.g. only README + TODO changed), the right answer is `git pull` and *no* docker action. Pull anyway so the working tree matches `origin` — it makes the next deploy faster.

### Step 4 — Pull, rebuild, recreate

```bash
git pull --ff-only
```

If `--ff-only` refuses (non-fast-forward), pause and ask — don't auto-rebase.

Then rebuild **only** the services from the mapping. Pass them all in one `up -d --build` call so compose orders them correctly:

```bash
# Example: controller and web both changed in prod stack
docker compose -f docker/docker-compose.prod.yml up -d --build controller web
```

Do not use `docker compose restart` for code changes — it will appear to succeed and silently run the old code (see Fact #2).

If you only need to apply a config change (Caddyfile, compose YAML, env), prefer the minimal command:

```bash
# Caddyfile edited - Caddy reloads via mount, just bounce it
docker compose -f docker/docker-compose.prod.yml restart caddy

# Compose YAML edited - let compose figure out what to recreate
docker compose -f docker/docker-compose.prod.yml up -d
```

### Step 5 — Verify

Run the bundled health-check script — it batches the canonical probes:

```bash
.claude/skills/subwave-deploy/scripts/health-check.sh
```

What healthy looks like:

- All five containers (`caddy`, `controller`, `icecast`, `liquidsoap`, `web` in prod; the dev subset otherwise) `Up` with no `(unhealthy)` or restarting.
- `GET /api/health` → `{"status":"on-air"}`.
- `GET /api/now-playing` → an object with `nowPlaying.title` and `nowPlaying.artist` populated (silence is a yellow flag, not necessarily failed — the stream may just be between tracks), `context.dominantMood` set, and a sane `weather` block.
- No `error|fail|exception` lines in `docker compose logs --since 2m` for any service.

Things that look like failure but aren't:
- `HEAD /stream.mp3` returns `400 Bad Request`. That's normal — Icecast only answers `GET`, not `HEAD`. Use `curl -sI` only to confirm the route exists; don't treat `400` as broken.
- Liquidsoap also gets recreated when you only asked for controller/web. That's compose dependency ordering, not a regression (see Fact #5).
- A few seconds of "Empty queue" or silence right after recreating Liquidsoap — the controller will re-feed `next.txt` on the next 1-second poll.

If a container is restarting, fetch its last ~80 log lines and report the failure. Don't auto-recreate; the user wants to see the error, not a flapping container.

### Step 6 — Report back

Keep the summary tight. A good shape:

- What was pulled (commit range or "already up to date").
- What was rebuilt (or "no rebuild needed").
- Health status: containers up + endpoint outputs + the live track / DJ name from `/api/now-playing` (this proves the full pipeline end-to-end, not just that the container is running).
- Any anomalies surfaced in the log scan.

## When to pause and ask

Free to act on: `git fetch`, `git pull --ff-only`, `docker compose build`, `up -d`, `restart`, `logs`, all health probes, log scans.

**Confirm first** before any of these:

- `git pull` refusing fast-forward (merge/rebase needed) — diverged history is a human decision.
- Local uncommitted changes that would conflict with the pull.
- `docker compose down` of any kind, especially `down -v` (volumes wipe).
- Force-recreating the whole stack (`up -d --force-recreate` with no service argument).
- Removing or pruning `state/` contents — that directory carries the IPC files, voice WAVs, jingles, and the hourly archive. Losing it is a real loss.
- Removing named volumes or running `docker system prune`.
- Editing the live Caddyfile / compose / `.env` in place when the diff didn't ask for it.
- Running `scripts/setup.sh` — it expects to be a fresh setup, not a re-run on a live host.

## Helper

`scripts/health-check.sh` (relative to this skill folder) runs the standard probes and emits a compact report. It auto-detects which compose file is live and which host port Caddy is mapped to, so it works whether the user has Caddy on `:80` or `:4800`.

## Notes for working on the project (worth carrying forward)

- `radio.liq`'s `on_track_change` hook is attached to the `music` source, not to a downstream stage. If a deploy edits that hook to a different source, metadata fidelity drops — surface it as a yellow flag.
- The controller is the single writer of `next.txt` and `say.txt` (via `queue.serveNext()`). A diff that adds a second writer is a red flag.
- Voice WAV is written ~200 ms before the track URI; that ordering is load-bearing. A diff that reorders it is a red flag.
- Festivals in `controller/src/context.js` are operator-specific (Sikh/UK calendar). Mention but don't push back on edits there.
