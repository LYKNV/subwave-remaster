import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Served by Next at /sitemap.xml. Public, indexable routes only — the
// admin console (/admin/*) is intentionally excluded.
const ROUTES = [
  '/',
  '/listen',
  '/landing',
  '/manual',
  '/manual/getting-started',
  '/manual/requests',
  '/manual/dj',
  '/manual/admin',
  '/manual/shortcuts',
  '/manual/cli',
  '/manual/llm',
  '/manual/mcp',
  '/manual/clients',
  '/manual/faq',
  '/docs/setup',
  '/docs/setup/prerequisites',
  '/docs/setup/quick-start',
  '/docs/setup/manual',
  '/docs/setup/development',
  '/docs/setup/updates',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
    changeFrequency: route === '/' || route === '/listen' ? 'daily' : 'monthly',
    priority: route === '/' ? 1 : route === '/listen' ? 0.9 : 0.6,
  }));
}
