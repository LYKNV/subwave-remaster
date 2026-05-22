#!/usr/bin/env bash
# prep-worktree.sh — stage a SUB/WAVE git worktree so it can run the dev stack.
#
# A git worktree checks out every TRACKED file, but the dev stack also needs
# a handful of gitignored files that do NOT travel with the checkout:
#   - controller/.env   (Navidrome + Ollama config; dev compose env_file)
#   - web/.env.local    (dev API/stream URL overrides for the web UI)
#   - docker/.env       (compose variable substitution)
#   - web/node_modules  (needed by `npm run dev`)
#   - state/            (bind-mounted into the containers)
#
# This copies the env files from the main working tree, runs npm install, and
# scaffolds a FRESH state/ directory — structure only. It deliberately does NOT
# copy settings.json, session.json, queue.json, moods.json, or any archived
# sessions/jingles/voice files, so the worktree station boots clean and the
# controller writes its own defaults. The one exception is state/icecast.xml:
# that is a rendered config (carries the Icecast passwords) and cannot be
# regenerated without the operator's inputs, so it is copied as-is.
#
# Usage:
#   prep-worktree.sh [worktree-path]   # worktree-path defaults to $PWD
#   prep-worktree.sh --reset-state     # wipe + re-scaffold state/ first
#   prep-worktree.sh --skip-npm        # skip the npm install step

set -euo pipefail

WORKTREE=""
RESET_STATE=0
SKIP_NPM=0
for arg in "$@"; do
  case "$arg" in
    --reset-state) RESET_STATE=1 ;;
    --skip-npm)    SKIP_NPM=1 ;;
    -h|--help)     grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)            echo "unknown flag: $arg" >&2; exit 2 ;;
    *)             WORKTREE="$arg" ;;
  esac
done

WORKTREE="${WORKTREE:-$PWD}"
[ -d "$WORKTREE" ] || { echo "error: no such directory: $WORKTREE" >&2; exit 1; }
WORKTREE="$(cd "$WORKTREE" && pwd)"

# The main working tree is the parent of the shared (common) .git directory.
# For a linked worktree, --git-common-dir points back at the main repo's .git.
GIT_COMMON="$(git -C "$WORKTREE" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || {
  echo "error: $WORKTREE is not inside a git repository" >&2; exit 1; }
MAIN="$(cd "$(dirname "$GIT_COMMON")" && pwd)"

if [ "$MAIN" = "$WORKTREE" ]; then
  echo "error: $WORKTREE IS the main working tree — there is nothing to prep." >&2
  echo "       Use the subwave-control skill to start the stack directly." >&2
  exit 1
fi

echo "[prep] main working tree: $MAIN"
echo "[prep] target worktree:   $WORKTREE"

# ── env files ───────────────────────────────────────────────────────────────
copy_env() {
  local rel="$1"
  local src="$MAIN/$rel"
  local dst="$WORKTREE/$rel"
  if [ ! -e "$src" ]; then
    echo "[prep] skip   $rel — not present in main; the stack may not work without it"
    return
  fi
  if [ -e "$dst" ]; then
    echo "[prep] keep   $rel — already in worktree (left untouched)"
    return
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "[prep] copied $rel"
}

copy_env controller/.env
copy_env web/.env.local
copy_env docker/.env

# ── fresh state/ scaffold ───────────────────────────────────────────────────
STATE="$WORKTREE/state"
if [ "$RESET_STATE" = 1 ] && [ -d "$STATE" ]; then
  echo "[prep] --reset-state: removing $STATE"
  rm -rf "$STATE"
fi

mkdir -p "$STATE"/logs "$STATE"/voice "$STATE"/jingles "$STATE"/sessions "$STATE"/archive "$STATE"/sfx

# icecast.xml — rendered config with the Icecast source/admin passwords.
# Regenerating it needs the operator's password inputs (subwave-deploy /
# setup.sh territory), so copy main's. The icecast container bind-mounts this
# file directly; if it is missing the container cannot boot.
if [ ! -f "$STATE/icecast.xml" ]; then
  if [ -f "$MAIN/state/icecast.xml" ]; then
    cp "$MAIN/state/icecast.xml" "$STATE/icecast.xml"
    echo "[prep] copied state/icecast.xml (rendered config — required by the icecast container)"
  else
    echo "[prep] WARNING: $MAIN/state/icecast.xml is missing — run setup.sh in main first (subwave-deploy)" >&2
  fi
fi

# Liquidsoap starts BEFORE the controller, so these must exist at boot or
# radio.liq errors on the missing read. The controller would otherwise write
# them on startup (see controller/src/settings.ts). Values are the code
# defaults: jingleRatio 30, crossfadeDuration 10.0.
[ -f "$STATE/liquidsoap_jingle_ratio.txt" ] || { echo 30   > "$STATE/liquidsoap_jingle_ratio.txt"; echo "[prep] wrote state/liquidsoap_jingle_ratio.txt (30)"; }
[ -f "$STATE/liquidsoap_crossfade.txt" ]    || { echo 10.0 > "$STATE/liquidsoap_crossfade.txt";    echo "[prep] wrote state/liquidsoap_crossfade.txt (10.0)"; }

# Playlists liquidsoap watches with reload_mode="watch" — must exist as files.
[ -f "$STATE/auto.m3u" ]    || { : > "$STATE/auto.m3u";    echo "[prep] touched state/auto.m3u (empty — controller refills it)"; }
[ -f "$STATE/jingles.m3u" ] || { : > "$STATE/jingles.m3u"; echo "[prep] touched state/jingles.m3u (empty — run generate-jingles.sh later if wanted)"; }

echo "[prep] state/ scaffolded fresh — no settings/sessions/queue/moods copied; the controller writes defaults on first boot."

# ── web dependencies ────────────────────────────────────────────────────────
if [ "$SKIP_NPM" = 1 ]; then
  echo "[prep] --skip-npm: leaving web/node_modules as-is"
elif [ -d "$WORKTREE/web/node_modules" ]; then
  echo "[prep] web/node_modules already present — skipping npm install"
else
  echo "[prep] installing web dependencies (npm install — can take a few minutes)…"
  ( cd "$WORKTREE/web" && npm install )
  echo "[prep] web dependencies installed"
fi

cat <<EOM

[prep] done. Start the dev stack from the worktree:
  cd "$WORKTREE/docker" && docker compose up -d --build   # --build bakes worktree controller changes into the image
  cd "$WORKTREE/web"    && npm run dev                     # web hot-reloads — run this in the background

Verify on-air (give Liquidsoap ~5s to connect):
  curl -sf http://localhost:7701/health    # expect {"status":"on-air"}
  curl -sf -o /dev/null -w '%{http_code}\\n' http://localhost:7700   # expect 200
EOM
