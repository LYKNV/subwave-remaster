// News feed helpers — fetch BBC News RSS (configurable via NEWS_FEED_URL) and
// hash headlines for dedup. These back the `getHeadlines` segment tool
// (llm/segment-tools.js); there is no standalone "news skill" object — the
// segment-director agent (skills/_agent.js) decides when a headline airs.
//
// Dependency-free RSS parsing: the BBC feed is RSS 2.0 with shallow <item>
// blocks containing <title> and <description>. We regex-extract those two
// fields and that's all we need. If a richer feed surfaces, swap in
// fast-xml-parser as a follow-up.

import { config } from '../config.js';

const ITEM_RE = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
const TITLE_RE = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
const DESC_RE = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;

function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashHeadline(title) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = ((h << 5) - h + title.charCodeAt(i)) | 0;
  return h.toString(36);
}

export async function fetchHeadlines() {
  const res = await fetch(config.news.feedUrl);
  if (!res.ok) throw new Error(`News feed HTTP ${res.status}`);
  const xml = await res.text();
  const items = [];
  let m;
  ITEM_RE.lastIndex = 0;
  while ((m = ITEM_RE.exec(xml)) !== null && items.length < config.news.maxItems) {
    const body = m[1];
    const title = stripHtml((body.match(TITLE_RE) || [, ''])[1]);
    const description = stripHtml((body.match(DESC_RE) || [, ''])[1]);
    if (title) items.push({ title, description });
  }
  return items;
}
