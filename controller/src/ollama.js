// Ollama client — handles two distinct LLM tasks:
//   1. Request matching: natural language → search params (structured output)
//   2. DJ script generation: context → spoken segment (creative output)

import { config } from './config.js';
import * as settings from './settings.js';

// Random micro-persona per call so the DJ shifts register across segments.
// Always includes the user-configured dj.soul so custom personas stay in
// rotation. Picks a fresh one every call — the named DJ stays constant,
// only their tone for this line wobbles.
function djSystem() {
  const s = settings.get();
  const pool = [];
  const userSoul = (s.dj?.soul || '').trim();
  if (userSoul) pool.push(userSoul);
  for (const soul of settings.DJ_SOULS) {
    if (soul !== userSoul) pool.push(soul);
  }
  const soul = pool[Math.floor(Math.random() * pool.length)];
  return settings.renderDjPrompt({ ...s.dj, soul }, {
    station: 'SUB/WAVE',
    location: s.weather?.locationName,
  });
}

// Narrative angles per call type. One is picked at random and injected into
// the user prompt as "Tone for this segment:" so consecutive generations
// don't fall back to the same shape. Add freely — the more variety here,
// the less the DJ repeats itself.
const ANGLES = {
  intro: [
    'Open with one specific image from right now (weather, time, day, season) and slide into the track.',
    'Mention the artist in passing — one detail (era, scene, mood) — not a full title-and-artist back-announce.',
    'Skip the introduction entirely and start mid-thought, as if continuing a conversation.',
    'React to the request itself — what kind of request it is, what mood it suggests — before mentioning the track.',
    'Use a short personal observation about the moment (Tuesday energy, the rain holding off, etc.) as the doorway.',
    'Lean into contrast: how this track sits against what came before, or against the time of day.',
    'Just say one true sentence and let the music start.',
  ],
  link: [
    'Comment on a contrast or similarity between the two tracks (era, mood, instrumentation, tempo).',
    'Tie the next track to the time of day, weather, or season — specifically, not generically.',
    'Mention something small and tactile about right now (the rain, the dark, the smell of coffee, the day of the week).',
    'Reference the previous artist or song obliquely — one detail, no full back-announce.',
    'Skip the back-announce entirely and just open a small thought about what is next.',
    'Acknowledge a listener-shaped moment (commute, late shift, weekend, midweek lull) without naming any listener.',
    'Make one quiet observation that has nothing to do with either track and let the next song answer it.',
  ],
  station_id: [
    'Plain ident — say the station name and the DJ name, nothing else.',
    'Anchor the ident to the current moment (a Tuesday afternoon, a foggy evening, the slow part of Sunday).',
    'Make it a near-aside: like someone reminding themselves where they are.',
    'Open with the time or weather, then drop the station name in the middle of the sentence.',
    'A single observation about broadcasting from a homelab, with the station name woven in.',
  ],
  weather: [
    'One concrete sensory detail about the weather, no temperature recital.',
    'Compare it to what it was earlier, or what it might be tonight — give it a small arc.',
    'Tie the weather to a recommendation about how to spend the next hour.',
    'Skip the forecast voice — just say what it actually feels like outside right now.',
    'Acknowledge weather as a co-conspirator with the music, not as a news item.',
  ],
  hourly: [
    'State the time as a small fact, then anchor it with one observation about the day.',
    'Treat the hour mark like a quiet check-in, not a bulletin.',
    'Open with where in the day we are (mid-afternoon lull, evening getting started, etc.) before the actual time.',
    'Just one short sentence that happens to mention the time.',
    'Acknowledge what kind of listener might be tuning in at this exact hour, without naming them.',
  ],
};

function pickAngle(kind) {
  const list = ANGLES[kind];
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

// Build the shared "right now" context block fed to every generate* call.
// Pulled out so all five DJ functions show the model the same picture.
function buildContextLines(context, { recentTracks } = {}) {
  const lines = [];
  if (context?.date) {
    lines.push(`Day: ${context.date.dayLabel}, ${context.date.dayOfMonth} ${context.date.monthLabel} (${context.date.season})`);
  }
  if (context?.clock) {
    const tags = [];
    if (context.clock.isWeekend) tags.push('weekend');
    if (context.clock.isLateNight) tags.push('late night');
    if (context.clock.isCommute) tags.push('commute hour');
    lines.push(`Local time: ${context.clock.hhmm}${tags.length ? ' · ' + tags.join(' · ') : ''}`);
  }
  if (context?.time) lines.push(`Period: ${context.time.period} (${context.time.vibe})`);
  if (context?.weather && context.weather.condition && context.weather.condition !== 'unknown') {
    lines.push(`Weather in ${context.weather.location}: ${context.weather.condition}${context.weather.temp != null ? `, ${context.weather.temp}°C` : ''}`);
  }
  if (context?.festival) lines.push(`Festival: ${context.festival.name}`);
  if (recentTracks && recentTracks.length) {
    const list = recentTracks.slice(0, 5).map(t => `"${t.title}" by ${t.artist || 'unknown'}`).join('; ');
    lines.push(`Recently played (do not mention these artists or titles): ${list}`);
  }
  return lines;
}

// Append rotating angle + recap + opener blocklist to the user prompt.
function decoratePrompt(prompt, { kind, recap, recentOpeners }) {
  const out = [prompt];
  const angle = pickAngle(kind);
  if (angle) out.push(`\nTone for this segment: ${angle}`);
  if (recap) out.push(`\nYou said these things on-air recently (do not repeat phrasing or topics):\n${recap}`);
  if (recentOpeners && recentOpeners.length) {
    const list = recentOpeners.slice(0, 6).map(o => `"${o}…"`).join(', ');
    out.push(`\nDo not start your line with any of these openers (vary the first words): ${list}`);
  }
  return out.join('\n');
}

// Ring buffer of recent LLM calls for the /debug endpoint
export const recentCalls = [];
function record(call) {
  recentCalls.unshift(call);
  if (recentCalls.length > 30) recentCalls.length = 30;
}

async function ollamaChat(messages, {
  format = null,
  temperature = 0.7,
  topP = null,
  repeatPenalty = null,
  seed = null,
  kind = 'chat',
} = {}) {
  const options = { temperature };
  if (topP != null) options.top_p = topP;
  if (repeatPenalty != null) options.repeat_penalty = repeatPenalty;
  if (seed != null) options.seed = seed;
  const body = {
    model: config.ollama.model,
    messages,
    stream: false,
    options,
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
      model: config.ollama.model,
      sampling: { temperature, top_p: options.top_p, repeat_penalty: options.repeat_penalty, seed: options.seed },
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

export async function generateIntro({ track, context, requestedBy = null, recap = null, recentTracks = null, recentOpeners = null }) {
  const ctxLines = buildContextLines(context, { recentTracks });
  if (requestedBy) ctxLines.push(`Requested by: ${requestedBy}`);
  ctxLines.push(`Coming up: "${track.title}" by ${track.artist}${track.album ? ` from ${track.album}` : ''}${track.year ? ` (${track.year})` : ''}`);

  const prompt = `Write a brief intro for this track.\n\n${ctxLines.join('\n')}`;

  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: decoratePrompt(prompt, { kind: 'intro', recap, recentOpeners }) },
    ],
    { temperature: 0.95, topP: 0.92, repeatPenalty: 1.2, seed: randomSeed(), kind: 'generateIntro' }
  );
}

export async function generateWeatherSegment(weather, time, { recap = null, context = null, recentOpeners = null } = {}) {
  const ctx = context || { weather, time };
  const ctxLines = buildContextLines(ctx);
  ctxLines.push(`Task: a brief weather check, in character. 1-2 sentences.`);
  const prompt = ctxLines.join('\n');
  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: decoratePrompt(prompt, { kind: 'weather', recap, recentOpeners }) },
    ],
    { temperature: 0.9, topP: 0.95, repeatPenalty: 1.15, seed: randomSeed(), kind: 'generateWeatherSegment' }
  );
}

export async function generateStationId({ recap = null, context = null, recentOpeners = null } = {}) {
  const djName = settings.get().dj?.name || 'your host';
  const ctxLines = buildContextLines(context);
  ctxLines.push(`Task: a 1-sentence station ident for SUB/WAVE with ${djName}. Brief, a little understated.`);
  const prompt = ctxLines.join('\n');
  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: decoratePrompt(prompt, { kind: 'station_id', recap, recentOpeners }) },
    ],
    { temperature: 1.0, topP: 0.9, repeatPenalty: 1.25, seed: randomSeed(), kind: 'generateStationId' }
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

export async function generateLink({ previous, current, context, recap = null, recentTracks = null, recentOpeners = null }) {
  const ctxLines = buildContextLines(context, { recentTracks });
  if (previous?.title) ctxLines.push(`Just played: "${previous.title}" by ${previous.artist || 'unknown'}`);
  if (current?.title) ctxLines.push(`Now playing: "${current.title}" by ${current.artist || 'unknown'}`);

  const prompt = `Write a short DJ link between tracks. Back-announce what just played and ease into what's playing now. 1-2 sentences, conversational, don't list both titles like a robot — pick one to mention specifically and treat the other lightly.\n\n${ctxLines.join('\n')}`;

  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: decoratePrompt(prompt, { kind: 'link', recap, recentOpeners }) },
    ],
    { temperature: 0.95, topP: 0.92, repeatPenalty: 1.2, seed: randomSeed(), kind: 'generateLink' }
  );
}

export async function generateHourlyTime(time, weather, { recap = null, context = null, recentOpeners = null } = {}) {
  const ctx = context || { time, weather };
  const ctxLines = buildContextLines(ctx);
  ctxLines.push(`Task: a brief top-of-the-hour time check, in character. 1 sentence.`);
  const prompt = ctxLines.join('\n');
  return ollamaChat(
    [
      { role: 'system', content: djSystem() },
      { role: 'user', content: decoratePrompt(prompt, { kind: 'hourly', recap, recentOpeners }) },
    ],
    { temperature: 0.9, topP: 0.95, repeatPenalty: 1.15, seed: randomSeed(), kind: 'generateHourlyTime' }
  );
}
