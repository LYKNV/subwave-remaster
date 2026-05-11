// Ollama client — handles two distinct LLM tasks:
//   1. Request matching: natural language → search params (structured output)
//   2. DJ script generation: context → spoken segment (creative output)

import { config } from './config.js';

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

const REQUEST_SYSTEM = `You are the music librarian for a personal Navidrome library that runs an AI radio station. A listener has sent in a request. Translate it into search parameters.

Respond with ONLY a JSON object, no other text:
{
  "search_terms": ["1-3 strings to search the library — artist names, song titles, or genres"],
  "mood": "one of: energetic, calm, reflective, celebratory, romantic, spiritual, focus, workout, driving, cooking, rainy, sunny, night, morning, evening, festival, cultural — or null if not applicable",
  "intent": "one short sentence describing what the listener wants",
  "ack": "a short on-air acknowledgment the DJ will read aloud, max 20 words, sounds like a real radio DJ. Don't introduce yourself, don't say 'thank you for listening', just acknowledge the request naturally."
}`;

export async function matchRequest(userQuery, { listenerName = null } = {}) {
  const userPrompt = listenerName
    ? `Listener "${listenerName}" requests: ${userQuery}`
    : `Anonymous request: ${userQuery}`;

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

const DJ_SYSTEM = `You are the on-air DJ for SUB/WAVE, a personal radio station broadcasting from a homelab in Wolverhampton, UK. You are warm, slightly understated, never corny. You sound like a late-night BBC 6 Music presenter — observant, dry humour, specific.

Hard rules:
- Output ONLY the words to be spoken aloud. No stage directions, no asterisks, no quotes around your dialogue.
- Keep it to 2-4 sentences unless asked for longer.
- Never say "and now", "next up", "coming up next" — those are tells. Be more natural.
- Don't repeat the artist and title robotically. Reference them in passing if at all.
- Reference the actual context (time, weather, what's coming) naturally.`;

export async function generateIntro({ track, context, requestedBy = null }) {
  const ctxLines = [];
  if (context.time) ctxLines.push(`Time: ${context.time.period} (${context.time.vibe})`);
  if (context.weather) ctxLines.push(`Weather in ${context.weather.location}: ${context.weather.condition}, ${context.weather.temp}°C`);
  if (context.festival) ctxLines.push(`Festival: ${context.festival.name}`);
  if (requestedBy) ctxLines.push(`Requested by: ${requestedBy}`);
  ctxLines.push(`Coming up: "${track.title}" by ${track.artist}${track.album ? ` from ${track.album}` : ''}${track.year ? ` (${track.year})` : ''}`);

  const prompt = `Write a brief intro for this track.\n\n${ctxLines.join('\n')}`;

  return ollamaChat(
    [
      { role: 'system', content: DJ_SYSTEM },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.85, kind: 'generateIntro' }
  );
}

export async function generateWeatherSegment(weather, time) {
  const prompt = `It's ${time.period} in ${weather.location}. Conditions: ${weather.condition}, ${weather.temp}°C. Write a brief weather check, in character. 1-2 sentences.`;
  return ollamaChat(
    [
      { role: 'system', content: DJ_SYSTEM },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.85, kind: 'generateWeatherSegment' }
  );
}

export async function generateStationId() {
  const prompt = `Write a 1-sentence station ident. Format: "You're listening to SUB/WAVE..." or similar. Be brief and a little understated.`;
  return ollamaChat(
    [
      { role: 'system', content: DJ_SYSTEM },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.9, kind: 'generateStationId' }
  );
}

export async function generateHourlyTime(time, weather) {
  const prompt = `It's the top of the hour. Time is ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })} in ${weather.location}. ${weather.condition}, ${weather.temp}°C. Brief time check, in character. 1 sentence.`;
  return ollamaChat(
    [
      { role: 'system', content: DJ_SYSTEM },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.85, kind: 'generateHourlyTime' }
  );
}
