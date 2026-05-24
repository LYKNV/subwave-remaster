# cli.getsubwave.com — installer Worker

Cloudflare Worker that serves `install.sh` at `https://cli.getsubwave.com`,
which is the URL the project's curl-pipe-sh installer uses:

```bash
curl -fsSL https://cli.getsubwave.com | sh
```

## How it works

The Worker fetches the canonical `install.sh` from the repo's `main` branch
on every miss, caches the result at the edge for 5 minutes, and re-emits it
with a `text/x-shellscript` content type so `sh` parses it cleanly.

```
curl  →  cli.getsubwave.com  (Worker, edge-cached 5 min)
              │
              └──> raw.githubusercontent.com/perminder-klair/subwave/main/install.sh
```

Browser-like User-Agents (anything matching `Mozilla/*`) get a 302 redirect
to <https://www.getsubwave.com/setup/quick-start> so a human visiting the
URL lands on docs instead of a wall of shell. Programmatic clients (curl,
wget, GH Actions, fetch libs) get the script.

## Deploy

One-off, locally:

```bash
cd infra/cli-installer
npx wrangler@latest login   # one-time; opens browser to auth
npx wrangler@latest deploy
```

You need:

- A Cloudflare account that owns the `getsubwave.com` zone.
- A DNS record routing `cli.getsubwave.com` to this Worker. Wrangler creates
  the route automatically based on `routes` in `wrangler.toml`. The DNS
  record itself is an orange-cloud "AAAA → 100::" placeholder or the Worker
  Routes UI auto-creates one — either is fine, the Worker intercepts before
  any origin lookup.

## Verify

After deploy:

```bash
# Programmatic: should return the install script.
curl -fsSL https://cli.getsubwave.com | head -20

# Browser: should redirect to /setup/quick-start.
curl -sSI -A 'Mozilla/5.0' https://cli.getsubwave.com | head -5
```

## Updating install.sh

Don't edit the script here — edit the canonical copy at `<repo>/install.sh`
and merge to `main`. The Worker picks up the change within 5 minutes (the
edge cache TTL). To force an immediate refresh:

```bash
# Purge the cached response from Cloudflare's dashboard, or:
npx wrangler@latest deploy   # any deploy invalidates the per-Worker cache
```

## What's deliberately out of scope

- **No telemetry.** Counting installs would mean dropping anonymous logs
  somewhere (KV / D1 / a separate ingest), which is a separable decision.
- **No version pinning via path.** `curl ...com/v1.2.3 | sh` would be nice
  but we'd have to verify the script body itself supports that target;
  today the installer accepts a `--version <tag>` flag instead.
- **No build-time injection.** The Worker just proxies; the script's
  release-resolution logic talks to GitHub directly.
