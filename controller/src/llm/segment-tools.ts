// AI SDK tool library — real-world data tools the segment-director agent
// (skills/_agent.js) calls before deciding whether to air a between-track
// segment. The counterpart of llm/tools.js (music discovery): that set lets
// the DJ agent explore the library, this one lets it look at the world.
//
// Tools are built per tick and scoped to the capabilities currently on offer
// (off-cooldown, enabled, in-window) — a tool the agent shouldn't use simply
// isn't in the set. The shared `state` object carries dedup memory between
// ticks: seen headline hashes, the last weather condition aired, the last
// artist searched.

import { tool } from 'ai';
import { z } from 'zod';
import { queue } from '../broadcast/queue.js';
import { fetchHeadlines, hashHeadline } from '../skills/news.js';
import { searchWeb, searchReady } from '../skills/web-search.js';

// `caps` is the list of capabilities offered this tick (see skills/_agent.js).
// Only data-backed kinds get a tool — traffic and random-facts are pure
// generation and need none.
export function buildSegmentTools(ctx: any, state: any, caps: any[]) {
  const kinds = new Set(caps.map((c: any) => c.kind));
  const tools: any = {};

  if (kinds.has('weather')) {
    tools.checkWeather = tool({
      description: 'Get the current weather and whether it has changed since the DJ last spoke about weather on air. Dull or unchanged weather is usually not worth airing.',
      inputSchema: z.object({}),
      execute: async () => {
        const w = ctx.weather;
        if (!w || !w.condition || w.condition === 'unknown') return { available: false };
        return {
          available: true,
          location: w.location,
          condition: w.condition,
          temp: w.temp ?? null,
          changedSinceLastMention: w.condition !== state.lastWeatherCondition,
        };
      },
    });
  }

  if (kinds.has('news')) {
    tools.getHeadlines = tool({
      description: 'Fetch current news headlines from the configured feed. Returns only headlines not already read on air.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const items = await fetchHeadlines();
          const fresh = items.filter((it: any) => !state.seenHeadlines.has(hashHeadline(it.title)));
          // Mark surfaced headlines as seen so a later tick doesn't re-offer
          // them — same "burn on read" approach as the old news skill.
          for (const it of fresh.slice(0, 6) as any[]) state.seenHeadlines.add(hashHeadline(it.title));
          if (state.seenHeadlines.size > 120) {
            state.seenHeadlines = new Set(Array.from(state.seenHeadlines).slice(-60));
          }
          if (!fresh.length) return { headlines: [] };
          return { headlines: fresh.slice(0, 6).map((it: any) => ({ title: it.title, detail: it.description || null })) };
        } catch (err) {
          return { error: err.message };
        }
      },
    });
  }

  if (kinds.has('web-search') && searchReady()) {
    tools.searchArtistNews = tool({
      description: 'Search the web for something recent about the artist currently on air.',
      inputSchema: z.object({}),
      execute: async () => {
        const artist = queue.current?.track?.artist;
        if (!artist || /^unknown/i.test(artist)) return { available: false };
        const alreadySearched = artist === state.lastSearchedArtist;
        try {
          const data = await searchWeb(`${artist} musician latest news`);
          state.lastSearchedArtist = artist;
          const answer = (data.answer || '').trim();
          const sources = (data.results || [])
            .slice(0, 3)
            .map(r => `${r.title}: ${(r.content || '').replace(/\s+/g, ' ').trim().slice(0, 240)}`);
          if (!answer && sources.length === 0) return { available: false };
          return { artist, alreadySearched, answer, sources };
        } catch (err) {
          return { error: err.message };
        }
      },
    });
  }

  return tools;
}
