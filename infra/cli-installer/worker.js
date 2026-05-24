// Cloudflare Worker — serves install.sh at cli.getsubwave.com.
//
// Behaviour:
//   - GET /            → install.sh body (cached at the edge, 5 min TTL)
//   - GET /install.sh  → same
//   - GET anything else with a browser User-Agent → 302 redirect to the
//     setup-guide quick-start page, so a curious human visiting the URL
//     lands on docs instead of a wall of shell script
//   - HEAD             → just the headers (used by some installers / curl)
//
// Source of truth is the script committed to the main branch of the repo
// at https://github.com/perminder-klair/subwave/blob/main/install.sh.
//
// Future-proofing knobs left commented:
//   - Path passthrough (e.g. /v1.2.3 → install.sh + --version v1.2.3
//     baked into the response) — useful once we want a stable URL for
//     CI-pinning. Holding off until there's demand; --version flag on the
//     installer covers it for now.
//   - A POST endpoint to receive install telemetry. Not adding without
//     explicit opt-in.

const SOURCE_URL = 'https://raw.githubusercontent.com/perminder-klair/subwave/main/install.sh';
const DOCS_URL = 'https://www.getsubwave.com/setup/quick-start';
// 5 minute edge cache. Short enough that a fix to install.sh propagates
// quickly; long enough that a popular tweet doesn't melt the origin.
const EDGE_CACHE_TTL = 300;

export default {
  /**
   * @param {Request} request
   * @param {object}  env       (unused — no secrets / KV bindings yet)
   * @param {object}  ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Browser-like UA on any path → push to the docs page. The intent test is
    // intentionally loose: anything that smells like a real browser gets
    // redirected; everything else (curl, wget, fetch libs, GitHub Actions)
    // gets the script.
    if (request.method === 'GET' && looksLikeBrowser(request.headers.get('user-agent'))) {
      return Response.redirect(DOCS_URL, 302);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    // Only the root and /install.sh serve the script. Everything else 404s
    // so we don't accidentally proxy arbitrary GitHub paths.
    if (url.pathname !== '/' && url.pathname !== '/install.sh') {
      return new Response('not found', { status: 404 });
    }

    return await fetchInstallScript(request, ctx);
  },
};

/**
 * Fetch install.sh from GitHub raw, cache the result at the edge, and return
 * it with shell-friendly headers. Uses Cloudflare's built-in cache via the
 * cf.cacheTtl option — no Cache API dance needed.
 */
async function fetchInstallScript(request, ctx) {
  const upstream = await fetch(SOURCE_URL, {
    cf: {
      // Edge-cache by GitHub's ETag. cacheEverything forces caching of
      // non-default content types; cacheTtl pins the duration.
      cacheEverything: true,
      cacheTtl: EDGE_CACHE_TTL,
    },
    headers: {
      // Identify ourselves so a GitHub abuse-detection sweep can find a
      // contact path (the User-Agent shows up in their raw-content logs).
      'User-Agent': 'subwave-cli-installer-worker (+https://github.com/perminder-klair/subwave)',
    },
  });

  if (!upstream.ok) {
    // Don't pass GitHub's HTML 404 through verbatim — the installer is
    // piping us into `sh`, and an HTML 404 body would parse as garbage
    // shell. Keep it text/plain so curl-piped-to-sh produces a clean error.
    return new Response(
      `# install.sh upstream fetch failed: ${upstream.status} ${upstream.statusText}\n` +
      `# expected: ${SOURCE_URL}\n` +
      `exit 1\n`,
      {
        status: 502,
        headers: { 'Content-Type': 'text/x-shellscript; charset=utf-8' },
      },
    );
  }

  // Re-emit the body with our own headers — GitHub serves raw.githubusercontent
  // content with Content-Type: text/plain, which works for curl-pipe-sh but
  // looks ugly in a terminal preview tool. text/x-shellscript is more honest
  // and still passes through `sh` cleanly.
  const headers = new Headers();
  headers.set('Content-Type', 'text/x-shellscript; charset=utf-8');
  // Honour the upstream ETag so a 304 round-trip works for CDN-aware clients.
  const etag = upstream.headers.get('etag');
  if (etag) headers.set('ETag', etag);
  // Tell the world we're cacheable, with the same TTL we asked Cloudflare for.
  headers.set('Cache-Control', `public, max-age=${EDGE_CACHE_TTL}`);
  // Discourage curl from streaming through some kind of accumulating buffer.
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(upstream.body, { status: 200, headers });
}

/**
 * Loose browser detection. The point is "this looks like a human pasted the
 * URL into their address bar," not "did we conclusively prove a browser."
 * Anything starting with "Mozilla/" (essentially every real browser) gets
 * redirected; everything else (curl, wget, libraries, GitHub Actions,
 * Node fetch, Python requests) is treated as a programmatic client.
 */
function looksLikeBrowser(ua) {
  if (!ua) return false;
  return /^Mozilla\//i.test(ua);
}
