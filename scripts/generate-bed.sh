#!/usr/bin/env bash
# Generates state/bed.mp3 — a soft continuous "studio room tone" loop that
# Liquidsoap mixes under the broadcast. Masked by music when music is loud,
# becomes audible under ducked music when the DJ talks. Stops segments from
# feeling like dead-air-then-voice-then-dead-air.
#
# Replace state/bed.mp3 with your own ambient loop any time — Liquidsoap
# reloads on container restart. Recommended length 60-120s; format mp3.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${STATE_DIR:-$REPO_DIR/state}"
OUT="$STATE_DIR/bed.mp3"

# ffmpeg is borrowed from the Liquidsoap image (which already ships it) so the
# host needs no ffmpeg install — only Docker, which the stack requires anyway.
LIQUIDSOAP_IMAGE="savonet/liquidsoap:v2.2.5"

if ! command -v docker &>/dev/null; then
  echo "docker not on PATH" >&2
  exit 1
fi

mkdir -p "$STATE_DIR"

echo "==> Rendering $OUT (60s warm pink-noise bed) via the Liquidsoap image"
# Pink noise → highpass (kills sub mud) → lowpass (kills harsh top) → soft volume.
# The result sounds like a warm, distant studio hum — neutral enough to sit
# under anything without competing. STATE_DIR is mounted at /out.
docker run --rm --entrypoint ffmpeg \
  -v "$STATE_DIR":/out "$LIQUIDSOAP_IMAGE" \
  -hide_banner -loglevel error -y \
  -f lavfi -i "anoisesrc=color=pink:duration=60:amplitude=0.4" \
  -af "highpass=f=80,lowpass=f=700,volume=0.5" \
  -codec:a libmp3lame -b:a 128k /out/bed.mp3

echo "Done. Restart Liquidsoap to load it:"
echo "  cd docker && docker compose restart liquidsoap"
