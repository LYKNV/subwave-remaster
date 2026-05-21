import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Served by Next at /robots.txt. The admin console and the API proxy are
// disallowed — the admin auth gate is client-side only, so the shell HTML is
// still served and would otherwise be crawlable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
