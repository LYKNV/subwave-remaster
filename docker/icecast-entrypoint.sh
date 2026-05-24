#!/bin/sh
# SUB/WAVE Icecast bootstrap.
#
# On first boot, generates three random passwords (mode 0600) into
# /var/sub-wave/icecast-secrets.env so that liquidsoap and the controller can
# source the same values. On every boot, renders icecast.xml from the baked-in
# template using whichever passwords are now in scope:
#
#   1. Env vars set on the container (operator override via root .env) win.
#   2. Otherwise the previously-generated values in icecast-secrets.env win.
#   3. Otherwise we generate fresh ones and write them.
#
# Reset path: delete state/icecast-secrets.env AND restart all three of
# icecast, liquidsoap, and controller. The latter two cache the env at
# process start, so an icecast-only restart leaves them on the old secrets.

set -eu

SECRETS=/var/sub-wave/icecast-secrets.env
TEMPLATE=/etc/icecast2/icecast.xml.template
RENDERED=/etc/icecast2/icecast.xml

# ---- Bootstrap shared state dirs --------------------------------------------
# Containers run as different UIDs (root, icecast2, liquidsoap@10000) and all
# need to read+write the shared state volume. Icecast is first via the compose
# health gate, so it pre-creates the subdirs with mode 777 before liquidsoap
# and controller mount over them. Saves operators from running setup.sh just
# to fix perms on the bind-mount source dirs.

mkdir -p /var/sub-wave \
         /var/sub-wave/voice \
         /var/sub-wave/archive \
         /var/sub-wave/jingles \
         /var/sub-wave/logs \
         /var/sub-wave/sessions \
         /var/sub-wave/sfx
chmod 777 /var/sub-wave \
          /var/sub-wave/voice \
          /var/sub-wave/archive \
          /var/sub-wave/jingles \
          /var/sub-wave/logs \
          /var/sub-wave/sessions \
          /var/sub-wave/sfx
# Bootstrap empty m3u files Liquidsoap's reload_mode="watch" needs to see.
touch /var/sub-wave/auto.m3u /var/sub-wave/jingles.m3u
chmod 666 /var/sub-wave/auto.m3u /var/sub-wave/jingles.m3u

# ---- Resolve passwords ------------------------------------------------------
# Precedence: env override > persisted secrets file > freshly generated.
# Capture env values FIRST so sourcing the secrets file can't clobber them.

ENV_SRC="${ICECAST_SOURCE_PASSWORD:-}"
ENV_ADM="${ICECAST_ADMIN_PASSWORD:-}"
ENV_REL="${ICECAST_RELAY_PASSWORD:-}"

if [ -f "$SECRETS" ]; then
    # shellcheck disable=SC1090
    . "$SECRETS"
fi

# Env values win when present (operator override via root .env).
[ -n "$ENV_SRC" ] && ICECAST_SOURCE_PASSWORD="$ENV_SRC"
[ -n "$ENV_ADM" ] && ICECAST_ADMIN_PASSWORD="$ENV_ADM"
[ -n "$ENV_REL" ] && ICECAST_RELAY_PASSWORD="$ENV_REL"

# Anything still empty gets a fresh random value.
[ -z "${ICECAST_SOURCE_PASSWORD:-}" ] && ICECAST_SOURCE_PASSWORD="$(openssl rand -hex 16)"
[ -z "${ICECAST_ADMIN_PASSWORD:-}"  ] && ICECAST_ADMIN_PASSWORD="$(openssl rand -hex 16)"
[ -z "${ICECAST_RELAY_PASSWORD:-}"  ] && ICECAST_RELAY_PASSWORD="$(openssl rand -hex 16)"

# ---- Persist resolved values for liquidsoap + controller --------------------
# We rewrite the file every boot so an operator who later sets env overrides in
# the root .env sees those values propagated to the other containers without
# having to delete state.
#
# Mode is 0644 so the liquidsoap container (uid 10000) can also source it. The
# state/ directory on the host is what gates external access; container-internal
# readability isn't the threat model here (anyone with `docker exec` can already
# read everything).

cat > "$SECRETS" <<EOF
ICECAST_SOURCE_PASSWORD=$ICECAST_SOURCE_PASSWORD
ICECAST_ADMIN_PASSWORD=$ICECAST_ADMIN_PASSWORD
ICECAST_RELAY_PASSWORD=$ICECAST_RELAY_PASSWORD
EOF
chmod 644 "$SECRETS"

export ICECAST_SOURCE_PASSWORD ICECAST_ADMIN_PASSWORD ICECAST_RELAY_PASSWORD

# ---- Render icecast.xml -----------------------------------------------------
# Plain sed is enough for three placeholders; the secrets are hex so there's
# no escaping risk. Using `|` as the sed delimiter keeps slashes safe.

sed \
    -e "s|\${ICECAST_SOURCE_PASSWORD}|$ICECAST_SOURCE_PASSWORD|g" \
    -e "s|\${ICECAST_ADMIN_PASSWORD}|$ICECAST_ADMIN_PASSWORD|g" \
    -e "s|\${ICECAST_RELAY_PASSWORD}|$ICECAST_RELAY_PASSWORD|g" \
    "$TEMPLATE" > "$RENDERED"
chown icecast2 "$RENDERED" 2>/dev/null || true

exec sudo -Eu icecast2 icecast2 -n -c "$RENDERED"
