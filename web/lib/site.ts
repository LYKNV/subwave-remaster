// Public site origin — the single source of truth for absolute URLs in
// metadata, Open Graph / Twitter cards, robots, and the sitemap.
//
// IMPORTANT: SITE_URL must be set both at BUILD time and at RUNTIME.
//  - Build: the statically-rendered routes (robots.txt, sitemap.xml, /listen,
//    /landing, /manual, /setup) bake their share tags at build.
//  - Runtime: the homepage (/) is force-dynamic, so its share tags render
//    per-request and read the live container env.
// The production Docker setup wires it through both (web/Dockerfile build arg
// + docker-compose.yml `environment`); define SITE_URL once in
// .env. NEXT_PUBLIC_SITE_URL is accepted as a fallback for older
// configs. Defaults to the dev origin so local builds still produce a valid
// `metadataBase` without Next's warning.
export const SITE_URL = (
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:7700'
).replace(/\/$/, '');
