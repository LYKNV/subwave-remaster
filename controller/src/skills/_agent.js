// Segment-director agent — the agentic replacement for the registry's old
// filter-and-random-pick skills tick.
//
// The 5-minute cron (scheduler.skillsTick) calls agenticTick(). Instead of
// mechanically picking an eligible skill, it hands a focused snapshot of the
// moment (what's on air, what the DJ has already said recently) plus a set of
// real-world data tools (llm/segment-tools.js) to a tool-loop agent and asks
// one question: "is there anything worth saying between tracks right now —
// and if so, what?" The agent may look at the weather, the headlines, or
// artist news, then either writes ONE spoken line or stays silent.
//
// It is deliberately NOT given the full track-pick session history: that
// history is mostly "pick the next song" chatter, which small models latch
// onto and start reasoning about music instead of the segment decision. The
// anti-repeat context it needs is queue.getDjRecap() — what actually aired.
//
// Both the autonomous tick AND the operator override now run through this
// agent. `agenticTick()` is the 5-minute cron; `runCapability()` is the
// /dj/skill manual override — same tool-loop, but forced to one capability
// with cooldowns bypassed. The CAPABILITIES table below is the single source
// of truth, and also backs the admin catalogue via `skillCatalog()`. The only
// skill modules left in this directory — news.js, web-search.js — are pure
// fetch helpers that back the segment tools (llm/segment-tools.js).
//
// Guard rails the autonomous tick cannot talk its way past (the operator
// override bypasses all of them — when the operator asks, they get a segment):
//   - per-kind hard cooldown (CAPABILITIES below)
//   - a frequency-derived floor on the gap between ANY two segments
//   - capabilities the operator disabled, or the on-air persona doesn't own,
//     are never offered
//   - traffic is only offered during commute hours; web-search only with a key

import { z } from 'zod';
import { config } from '../config.js';
import { queue } from '../broadcast/queue.js';
import * as settings from '../settings.js';
import { djAgent } from '../llm/sdk.js';
import { buildContextLines } from '../llm/dj.js';
import { buildSegmentTools } from '../llm/segment-tools.js';

// Capability table — the single source of truth for the DJ's between-track
// segment capabilities. Each entry carries:
//   kind        — the queue.announce kind
//   skill       — the operator enable-toggle slug (kept identical to `kind`)
//   label       — human label for the admin command-center UI
//   cooldownMs  — hard minimum gap between autonomous firings of this kind
//   desc        — the one-line briefing shown BOTH to the agent (per-capability
//                 guidance — for traffic/random-facts, which have no data tool,
//                 this is the agent's ONLY brief) and to the admin UI
//   requiresKey — (optional) env key the capability needs
//   keyUrl      — (optional) where the operator obtains that key
//   ready       — (optional) () => boolean; false when the env key is missing
// CAPABILITIES backs the agentic tick, the operator override (runCapability),
// and the admin catalogue (skillCatalog).
const CAPABILITIES = [
  {
    kind: 'weather', skill: 'weather', label: 'Weather',
    cooldownMs: 25 * 60 * 1000,
    desc: 'A short weather check, in character — one or two sentences. Only worth airing when conditions have genuinely changed.',
  },
  {
    kind: 'news', skill: 'news', label: 'News headlines',
    cooldownMs: 45 * 60 * 1000,
    desc: 'Read one fresh headline in a single sentence — half-distracted BBC 6 Music tone, never an anchor voice, no editorialising, no "in other news".',
  },
  {
    kind: 'traffic', skill: 'traffic', label: 'Traffic',
    cooldownMs: 90 * 60 * 1000,
    desc: 'A tongue-in-cheek made-up "traffic update for the listening area" — one absurd, small-scale sentence (a cat on the cable, a queue at the kettle, slow buffering on the M6). Never a real road incident.',
  },
  {
    kind: 'random-facts', skill: 'random-facts', label: 'Random facts',
    cooldownMs: 60 * 60 * 1000,
    desc: 'One concrete, oddly-specific "did you know" line, lightly themed to the hour or season — not Wikipedia-rote. Never say "fun fact" or "interestingly".',
  },
  {
    kind: 'web-search', skill: 'web-search', label: 'Web search',
    cooldownMs: 60 * 60 * 1000,
    requiresKey: 'SEARCH_API_KEY',
    keyUrl: 'https://app.tavily.com/home',
    ready: () => !!config.search.apiKey,
    desc: 'Work one genuine, recent detail about the artist on air into a single conversational line — no "I read online", no URLs, no list.',
  },
];

const SEGMENT_SCHEMA = z.object({
  segment: z.object({
    kind: z.enum(['weather', 'news', 'traffic', 'random-facts', 'web-search']),
    text: z.string().describe('the spoken line — one sentence, in the DJ voice'),
  }).nullable().describe('the segment to air, or null to stay silent'),
  reason: z.string().describe('one short internal sentence on the decision'),
});

// Operator-override schema: the segment is mandatory, the kind is already
// known, so the agent only returns the spoken line.
const FORCED_SCHEMA = z.object({
  text: z.string().describe('the spoken line — one sentence, in the DJ voice'),
});

let tickBusy = false;
const lastFired = new Map(); // kind → ms timestamp of last aired segment

// Dedup memory carried across ticks — passed straight into the segment tools.
const segmentState = {
  seenHeadlines: new Set(),
  lastWeatherCondition: null,
  lastSearchedArtist: null,
  lastAnySegment: 0,
};

// Minimum gap between ANY two segments, by station frequency. The cron fires
// every 5 min; aggressive stations get no extra floor.
function frequencyFloorMs(freq) {
  if (freq === 'quiet') return 30 * 60 * 1000;
  if (freq === 'aggressive') return 0;
  return 15 * 60 * 1000; // moderate
}

// Capabilities on offer this tick: enabled, owned by the on-air persona,
// off-cooldown, and in-window.
function availableCapabilities(ctx, now) {
  const s = settings.get();
  const enabled = s.skills?.enabled || {};
  const persona = settings.getEffectivePersona(now);
  const out = [];
  for (const cap of CAPABILITIES) {
    if (enabled[cap.skill] === false) continue;
    if (persona?.skills && !persona.skills.includes(cap.skill)) continue;
    if (now.getTime() - (lastFired.get(cap.kind) || 0) < cap.cooldownMs) continue;
    if (cap.kind === 'traffic' && !ctx.clock?.isCommute) continue;
    if (cap.ready && !cap.ready()) continue;
    out.push(cap);
  }
  return out;
}

function directorSystem(persona, caps, freq) {
  const name = persona?.name || 'the DJ';
  const soul = persona?.soul || '';
  const capList = caps.map(c => `- ${c.kind}: ${c.desc}`).join('\n');
  const tone = freq === 'quiet'
    ? 'This is a quiet station — speak rarely; silence should be your default.'
    : freq === 'aggressive'
      ? 'This is a lively station — a more frequent presence is welcome, but never filler for its own sake.'
      : 'This is a measured station — speak when there is something worth saying, not on a timer.';

  return `You are ${name}, the on-air DJ for SUB/WAVE, a personal internet radio station. ${soul}

YOUR ONLY JOB right now: decide whether to air ONE short spoken segment between tracks, or to stay silent. You are NOT choosing music — track selection is handled by another part of the station. Do not reason about which song should play next; that is not your decision.

Staying silent is a perfectly good — often the best — answer. Only speak when there is something genuinely fresh and worth a listener's attention.

Capabilities available to you this tick (you may air at most ONE):
${capList}

Use the tools to look at the real data before you decide. If the data is dull, stale, unchanged, or you have nothing fresh to add, return null and stay silent. ${tone}

Respond with a JSON object only — no prose, no markdown:
{ "segment": { "kind": "<one of: ${caps.map(c => c.kind).join(', ')}>", "text": "<one spoken sentence in your voice>" } or null, "reason": "<one short internal sentence about the SEGMENT decision — not about music>" }`;
}

// The concrete situation handed to the agent as its single user turn. Built
// from what is on air and queue.getDjRecap() (what actually aired recently) —
// NOT the track-pick session history, which derails small models.
function buildSituation(ctx, { forced = false } = {}) {
  const lines = ['The current moment:'];
  const ctxLines = buildContextLines(ctx);
  if (ctxLines.length) lines.push(...ctxLines);
  const cur = queue.current?.track;
  if (cur) lines.push(`On air now: "${cur.title}" by ${cur.artist || 'unknown'}`);
  const recap = queue.getDjRecap();
  if (recap) {
    lines.push(`\nWhat you have already said on air recently (do NOT repeat these topics or phrasing):\n${recap}`);
  }
  lines.push(forced
    ? '\nWrite the segment the operator has asked for now.'
    : '\nDecide now: air one segment, or stay silent.');
  return lines.join('\n');
}

// Called by the scheduler's 5-minute cron. Picks at most one segment to air,
// or stays silent. Never throws — failures are logged and the tick ends.
export async function agenticTick(ctx) {
  if (tickBusy) return;

  const now = new Date();
  const persona = settings.getEffectivePersona(now);
  const freq = persona?.frequency || 'moderate';

  // Floor on the gap between any two segments.
  if (now.getTime() - segmentState.lastAnySegment < frequencyFloorMs(freq)) return;

  const caps = availableCapabilities(ctx, now);
  if (caps.length === 0) return;

  // Cheap skip: if weather is the only thing on offer and it hasn't changed,
  // there is provably nothing to say — don't spend an LLM call to learn that.
  if (caps.length === 1 && caps[0].kind === 'weather'
      && ctx.weather?.condition && ctx.weather.condition === segmentState.lastWeatherCondition) {
    return;
  }

  tickBusy = true;
  try {
    const tools = buildSegmentTools(ctx, segmentState, caps);
    const { object } = await djAgent({
      system: directorSystem(persona, caps, freq),
      messages: [{ role: 'user', content: buildSituation(ctx) }],
      tools,
      schema: SEGMENT_SCHEMA,
      kind: 'djAgentSegment',
    });

    const seg = object?.segment;
    if (!seg || !seg.text || !seg.text.trim()) {
      queue.log('scheduler', `Segment agent stayed silent — ${object?.reason || 'nothing to add'}`);
      return;
    }

    // The agent must pick a kind it was actually offered (off-cooldown etc.).
    const cap = caps.find(c => c.kind === seg.kind);
    if (!cap) {
      queue.log('error', `Segment agent returned unoffered kind "${seg.kind}" — dropping`);
      return;
    }

    lastFired.set(seg.kind, Date.now());
    segmentState.lastAnySegment = Date.now();
    if (seg.kind === 'weather' && ctx.weather?.condition) {
      segmentState.lastWeatherCondition = ctx.weather.condition;
    }

    // queue.announce appends the segment turn into the live session.
    await queue.announce(seg.text.trim(), seg.kind);
  } catch (err) {
    queue.log('error', `Segment agent failed: ${err.message}`);
  } finally {
    tickBusy = false;
  }
}

// Operator-override variant of directorSystem: exactly one capability, and the
// segment is mandatory — the agent does not get the option to stay silent.
function forcedSystem(persona, cap) {
  const name = persona?.name || 'the DJ';
  const soul = persona?.soul || '';

  return `You are ${name}, the on-air DJ for SUB/WAVE, a personal internet radio station. ${soul}

The operator has asked you to air ONE ${cap.kind} segment right now. You are NOT choosing music — track selection is handled by another part of the station. Your only job is to write the spoken line.

What this segment is:
${cap.desc}

Use any tools available to you to look at the real data first, then write the line. You MUST produce a segment — staying silent is not an option here. If the data is thin, do the best you can with what you have.

Respond with a JSON object only — no prose, no markdown:
{ "text": "<one spoken sentence in your voice>" }`;
}

// Operator override — fire one capability on demand, bypassing cooldowns, the
// frequency floor, persona ownership and the enable toggle. Backs POST
// /dj/skill. `which` is a kind or skill slug (kept identical). Returns the
// spoken text; throws on an unknown/unready capability or empty output.
export async function runCapability(which, ctx) {
  const cap = CAPABILITIES.find(c => c.kind === which || c.skill === which);
  if (!cap) throw new Error(`unknown skill: ${which}`);
  if (cap.ready && !cap.ready()) {
    throw new Error(`skill "${cap.skill}" is not ready${cap.requiresKey ? ` — set ${cap.requiresKey}` : ''}`);
  }

  const persona = settings.getEffectivePersona(new Date());
  const tools = buildSegmentTools(ctx, segmentState, [cap]);
  const { object } = await djAgent({
    system: forcedSystem(persona, cap),
    messages: [{ role: 'user', content: buildSituation(ctx, { forced: true }) }],
    tools,
    schema: FORCED_SCHEMA,
    kind: 'djAgentSegment',
  });

  const text = object?.text?.trim();
  if (!text) throw new Error(`skill "${cap.skill}" produced no text`);

  // Update cooldown/dedup memory so a follow-up autonomous tick doesn't
  // immediately repeat what the operator just fired.
  lastFired.set(cap.kind, Date.now());
  segmentState.lastAnySegment = Date.now();
  if (cap.kind === 'weather' && ctx.weather?.condition) {
    segmentState.lastWeatherCondition = ctx.weather.condition;
  }

  await queue.announce(text, cap.kind);
  return text;
}

// Skill metadata for the admin command-center UI — derived straight from
// CAPABILITIES. Previously lived in the now-deleted skills/_registry.js.
export function skillCatalog() {
  const enabledMap = settings.get().skills?.enabled || {};
  return CAPABILITIES.map(c => ({
    name: c.skill,
    label: c.label || c.skill,
    description: c.desc || '',
    kind: c.kind,
    cooldownMs: c.cooldownMs || 0,
    enabled: enabledMap[c.skill] !== false,
    // `ready` is false when the capability needs an env key that isn't set;
    // `requiresKey` names it and `keyUrl` links the operator to its source.
    ready: typeof c.ready === 'function' ? !!c.ready() : true,
    requiresKey: c.requiresKey || null,
    keyUrl: c.keyUrl || null,
  }));
}
