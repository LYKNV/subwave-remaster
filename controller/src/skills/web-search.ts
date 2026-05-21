// Web search helper — queries the Tavily API. Backs the `searchArtistNews`
// segment tool (llm/segment-tools.js); there is no standalone "web-search
// skill" object — the segment-director agent (skills/_agent.js) decides when
// artist news airs.
//
// Needs a Tavily key (SEARCH_API_KEY). The agent only offers the web-search
// capability — and only builds the searchArtistNews tool — when the key is
// set (see CAPABILITIES.ready in skills/_agent.js).

import { config } from '../config.js';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

export async function tavilySearch(query) {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.search.apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      topic: 'general',
      include_answer: true,
      max_results: 5,
    }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  return res.json();
}
