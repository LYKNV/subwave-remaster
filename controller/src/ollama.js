// Ollama client — handles two distinct LLM tasks:
//   1. Request matching: natural language → search params (structured output)
//   2. DJ script generation: context → spoken segment (creative output)

import { config } from './config.js';
import * as settings from './settings.js';

function djSystem() {
  const s = settings.get();
  return settings.renderDjPrompt(s.dj, {
    station: 'SUB/WAVE',
    location: s.weather?.locationName,
  });
}

// Ring buffer of recent LLM calls for the /debug endpoint
export const recentCalls = [];
function record(call) {
  recentCalls.unshift(call);
  if (recentCalls.length > 30) recentCalls.length = 30;
}

async function ollamaChat(messages, { format = null, temperature = 0.7, kind = 'chat' } = {}) {
  const body = {
    model: config.ollama.model,
    messages,
    stream: false,
    options: { temperature },
  };
  if (format === 'json') body.format = 'json';

  const started = Date.now();
  try {
    const res = await fetch(`${config.ollama.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`);
    const data = await res.json();
    const content = data.message?.content || '';
    record({
      kind, ok: true, ms: Date.now() - started,
      model: config.ollama.model, temperature,
      systemPreview: messages.find(m => m.role === 'system')?.content?.slice(0, 200),
      user: messages.find(m => m.role === 'user')?.content,
      response: content,
      t: new Date().toISOString(),
    });
    return content;
  } catch (err) {
    record({
      kind, ok: false, ms: Date.now() - started,
      model: config.ollama.model,
      user: messages.find(m => m.role === 'user')?.content,
      error: err.message,
      t: new Date().toISOString(),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// REQUEST MATCHING — strict JSON schema
// ---------------------------------------------------------------------------

const REQUEST_SYSTEM = `You are the music librarian for a personal Navidrome library that runs an AI radio station. A listener sends a request; you turn it into structured search parameters.

You MUST respond with a JSON object containing ALL of these keys, in this exact order. Do not omit any key. Use null where a value does not apply.

{
  "search_terms": [array of 1-3 strings to search the library — ARTIST NAMES, SONG TITLES, or REAL GENRES like "punjabi", "lofi", "jazz". NEVER mood/vibe words like "calm", "rainy", "overcast" — those go in the "mood" field],
  "artist": string or null — the artist name if the listener named one (use the artist's common name, e.g. "Diljit Dosanjh"),
  "sort": one of "latest" | "oldest" | "popular" | null — set to "latest" for words like latest/new/newest/recent, "oldest" for old/classic, "popular" for popular/best/top. Otherwise null,
  "scope": one of "album" | "song" — what the listener wants. Default "song",
  "mood": one of energetic|calm|reflective|celebratory|romantic|spiritual|focus|workout|driving|cooking|rainy|sunny|night|morning|evening|festival|cultural — or null. ALWAYS set this for vibe/feeling requests (e.g. "overcast mood" → calm or reflective, "cosy" → calm, "pumped up" → energetic, "late night drive" → night+driving — pick the strongest single match),
  "intent": one short sentence describing what the listener wants,
  "ack": short on-air acknowledgment the DJ reads aloud, max 20 words, sounds like a real radio DJ — no "thank you for listening" or self-intros
}

Vibe-to-mood mapping (use these when the request describes a feeling, weather, or moment rather than naming an artist/song):
- overcast, cloudy, grey day, drizzly → calm or reflective
- rainy day, downpour → rainy + calm
- sunny, golden hour → sunny
- cosy, comfy, blanket, fireside → calm
- late night, midnight, after hours → night
- morning coffee, breakfast, sunrise → morning
- evening, golden hour, sundown → evening
- working out, gym, run → workout
- focus, deep work, study → focus
- driving, road trip, motorway → driving
- party, celebrating, friends → celebratory
- heartbreak, melancholy, longing → reflective
- love, romance, slow dance → romantic
- diwali, vaisakhi, holi → festival + cultural
- shabad, kirtan, devotional → spiritual

Worked examples (your output must mirror this structure exactly):

"<artist> latest album"
{"search_terms":["<artist>"],"artist":"<artist>","sort":"latest","scope":"album","mood":null,"intent":"Wants a track from the newest album.","ack":"Pulling their latest for you now."}

"old <artist> track"
{"search_terms":["<artist>"],"artist":"<artist>","sort":"oldest","scope":"song","mood":null,"intent":"Wants an early track.","ack":"Going back in the catalogue for you."}

"something romantic"
{"search_terms":[],"artist":null,"sort":null,"scope":"song","mood":"romantic","intent":"Wants a romantic track.","ack":"Slowing things down for you."}

"overcast mood"
{"search_terms":[],"artist":null,"sort":null,"scope":"song","mood":"calm","intent":"Wants something to match an overcast feel.","ack":"Something to sit under the grey with."}

"rainy day"
{"search_terms":[],"artist":null,"sort":null,"scope":"song","mood":"rainy","intent":"Wants weather-appropriate calm music.","ack":"Soundtrack for the rain, coming up."}

"late-night driving"
{"search_terms":[],"artist":null,"sort":null,"scope":"song","mood":"driving","intent":"Wants night-drive music.","ack":"Keep the road quiet — this one's for you."}

"play <title> by <artist>"
{"search_terms":["<title>","<artist>"],"artist":"<artist>","sort":null,"scope":"song","mood":null,"intent":"Wants a specific song by a specific artist.","ack":"Coming right up."}`;

export async function matchRequest(userQuery, { listenerName = null, nowPlaying = null } = {}) {
  const ctxLines = [];
  if (nowPlaying?.title) {
    ctxLines.push(`Currently playing: "${nowPlaying.title}"${nowPlaying.artist ? ` by ${nowPlaying.artist}` : ''}.`);
  }
  const userPrompt = [
    listenerName ? `Listener "${listenerName}" requests:` : `Anonymous request:`,
    userQuery,
    ctxLines.length ? `\n[Context for resolving references like "similar", "more like this", "match this vibe":\n${ctxLines.join('\n')}]` : '',
  ].filter(Boolean).join(' ');

  const text = await ollamaChat(
    [
      { role: 'system', content: REQUEST_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    { format: 'json', temperature: 0.4, kind: 'matchRequest' }
  );

  try {
    return JSON.parse(text);
  } catch (err) {
    // Best-effort recovery
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Failed to parse Ollama response: ${text.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// DJ SCRIPTS — creative spoken segments
// ---------------------------------------------------------------------------

// Append a recent-on-air recap to the user prompt so the DJ stops repeating
// phrasing across consecutive segments. The recap text is built by
// queue.getDjRecap() — passing null is a no-op.
function withRecap(prompt, recap) {
  if (!recap) return prompt;
  return `${prompt}\n\nYou said these things on-air recently (do not repeat phrasing or topics):\n${recap}`;
}

export async function generateIntro({ track, context, requestedBy = null, recap = null }) {
  const ctxLines = [];
  if (context.time) ctxLines.push(`Time: ${context.time.period} (${context.time.vibe})`);
  if (context.weather) ctxLines.push(`Weather in ${context.weather.location}: ${context.weather.condition}, ${context.weather.temp}°C`);
  if (context.festival) ctxLines.push(`Festival: ${context.festival.name}`);
  if (requestedBy) ctxLines.push(`Requested by: ${requestedBy}`);
  ctxLines.push(`Coming up: "${track.title}" by ${track.artist}${track.album ? ` from ${track.album}` : ''}${track.year ? ` (${track.year})` : ''}`);

  const prompt = `Write a brief intro for this track.\n\n${ctxLines.join('\n')}`;

  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: withRecap(prompt, recap) },
    ],
    { temperature: 0.85, kind: 'generateIntro' }
  );
}

export async function generateWeatherSegment(weather, time, { recap = null } = {}) {
  const prompt = `It's ${time.period} in ${weather.location}. Conditions: ${weather.condition}, ${weather.temp}°C. Write a brief weather check, in character. 1-2 sentences.`;
  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: withRecap(prompt, recap) },
    ],
    { temperature: 0.85, kind: 'generateWeatherSegment' }
  );
}

export async function generateStationId({ recap = null } = {}) {
  const djName = settings.get().dj?.name || 'your host';
  const prompt = `Write a 1-sentence station ident. Format: "You're listening to SUB/WAVE with ${djName}..." or similar. Be brief and a little understated.`;
  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: withRecap(prompt, recap) },
    ],
    { temperature: 0.9, kind: 'generateStationId' }
  );
}

// ---------------------------------------------------------------------------
// LLM PICKER — choose the next track from a candidate pool
// ---------------------------------------------------------------------------

const PICKER_SYSTEM = `You are the DJ for SUB/WAVE, a personal internet radio station.
Pick the single best NEXT track to play, given recent plays, current context, and a candidate pool.

Selection criteria, in order:
1. FLOW — does it transition naturally from what just played (energy, mood, tempo)?
2. CONTEXT — does it fit the time of day, weather, and dominant mood?
3. VARIETY — avoid same artist back-to-back; rotate energy levels; don't be predictable.
4. INTEREST — prefer something that creates a moment, not the most generic option.

You MUST pick from the candidates only. Output JSON only:
{ "id": "<exact id from candidates>", "reason": "<one short sentence why this one>" }`;

export async function pickNextTrack({ candidates, recentPlays, context }) {
  const user = JSON.stringify({
    now: {
      time: context.time?.period,
      vibe: context.time?.vibe,
      mood: context.dominantMood,
      weather: context.weather?.condition,
      festival: context.festival?.name,
    },
    recentPlays,
    candidates,
  }, null, 2);

  const text = await ollamaChat(
    [
      { role: 'system', content: PICKER_SYSTEM },
      { role: 'user', content: user },
    ],
    { format: 'json', temperature: 0.5, kind: 'pickNextTrack' }
  );

  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`picker response not JSON: ${text.slice(0, 200)}`);
  }
}

export async function generateLink({ previous, current, context, recap = null }) {
  const ctxLines = [];
  if (context?.time) ctxLines.push(`Time: ${context.time.period} (${context.time.vibe})`);
  if (context?.weather) ctxLines.push(`Weather in ${context.weather.location}: ${context.weather.condition}, ${context.weather.temp}°C`);
  if (context?.festival) ctxLines.push(`Festival: ${context.festival.name}`);
  if (previous?.title) ctxLines.push(`Just played: "${previous.title}" by ${previous.artist || 'unknown'}`);
  if (current?.title) ctxLines.push(`Now playing: "${current.title}" by ${current.artist || 'unknown'}`);

  const prompt = `Write a short DJ link between tracks. Back-announce what just played and ease into what's playing now. 1-2 sentences, conversational, don't list both titles like a robot — pick one to mention specifically and treat the other lightly.\n\n${ctxLines.join('\n')}`;

  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: withRecap(prompt, recap) },
    ],
    { temperature: 0.85, kind: 'generateLink' }
  );
}

export async function generateHourlyTime(time, weather, { recap = null } = {}) {
  const prompt = `It's the top of the hour. Time is ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })} in ${weather.location}. ${weather.condition}, ${weather.temp}°C. Brief time check, in character. 1 sentence.`;
  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: withRecap(prompt, recap) },
    ],
    { temperature: 0.85, kind: 'generateHourlyTime' }
  );
}
