#!/usr/bin/env bash
# One-time setup — creates state dirs, downloads emergency audio, etc.
set -euo pipefail

STATE_DIR="${STATE_DIR:-/var/lib/subwave}"

echo "Creating state dir: $STATE_DIR"
sudo mkdir -p "$STATE_DIR"/{voice,archive,jingles,logs}
sudo chmod -R 777 "$STATE_DIR"

# Touch the files Liquidsoap and the controller share
touch "$STATE_DIR/auto.m3u"
touch "$STATE_DIR/jingles.m3u"

# Emergency fallback — generate 30s of low pink noise so dead air never happens
if [[ ! -f "$STATE_DIR/emergency.mp3" ]] && command -v ffmpeg &>/dev/null; then
  echo "Generating emergency audio..."
  ffmpeg -f lavfi -i "anoisesrc=color=pink:duration=30:amplitude=0.05" \
    -codec:a libmp3lame -b:a 128k "$STATE_DIR/emergency.mp3" -y
fi

echo "Done."
echo "  Dev:   cd docker && docker compose up -d"
echo "  Prod:  docker compose -f docker/docker-compose.prod.yml up -d"
