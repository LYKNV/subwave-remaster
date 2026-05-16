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
// The skill modules in this directory are still used: their fetch helpers
// back the tools, and _registry.js keeps running them for the /dj/skill
// manual-override route. Only the autonomous tick is now agentic.
//
// Guard rails the agent cannot talk its way past:
//   - per-kind hard cooldown (CAPABILITIES below, mirrors the skill modules)
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

// Capability table — kind, the skill module it maps to (for the enable
// toggle), its hard cooldown, and the one-line description shown to the agent.
// Cooldowns mirror the cooldownMs of the matching skill module.
const CAPABILITIES = [
  { kind: 'weather',      skill: 'weather',      cooldownMs: 25 * 60 * 1000,
    desc: 'A short weather check — only worth airing when conditions have genuinely changed.' },
  { kind: 'news',         skill: 'news',         cooldownMs: 45 * 60 * 1000,
    desc: 'Read one fresh headline in a half-distracted BBC 6 Music tone — never an anchor voice.' },
  { kind: 'traffic',      skill: 'traffic',      cooldownMs: 90 * 60 * 1000,
    desc: 'A tongue-in-cheek made-up "traffic" gag for the listening room (a cat on the cable, a queue at the kettle).' },
  { kind: 'random-facts', skill: 'random-facts', cooldownMs: 60 * 60 * 1000,
    desc: 'A single oddly-specific "did you know" line, lightly themed to the hour.' },
  { kind: 'web-search',   skill: 'web-search',   cooldownMs: 60 * 60 * 1000,
    desc: 'Work one genuine, recent detail about the artist on air into a line.' },
];

const SEGMENT_SCHEMA = z.object({
  segment: z.object({
    kind: z.enum(['weather', 'news', 'traffic', 'random-facts', 'web-search']),
    text: z.string().describe('the spoken line — one sentence, in the DJ voice'),
  }).nullable().describe('the segment to air, or null to stay silent'),
  reason: z.string().describe('one short internal sentence on the decision'),
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
    if (cap.kind === 'web-search' && !config.search.apiKey) continue;
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
function buildSituation(ctx) {
  const lines = ['The current moment:'];
  const ctxLines = buildContextLines(ctx);
  if (ctxLines.length) lines.push(...ctxLines);
  const cur = queue.current?.track;
  if (cur) lines.push(`On air now: "${cur.title}" by ${cur.artist || 'unknown'}`);
  const recap = queue.getDjRecap();
  if (recap) {
    lines.push(`\nWhat you have already said on air recently (do NOT repeat these topics or phrasing):\n${recap}`);
  }
  lines.push('\nDecide now: air one segment, or stay silent.');
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
