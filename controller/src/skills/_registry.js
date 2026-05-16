// Skills registry — the catalogue of DJ "segment" capabilities (weather,
// news, traffic, random facts, web search).
//
// Each skill is a default-export object:
//   {
//     name:       string, unique slug for logging
//     label:      string, human label for the admin UI
//     description:string, one-line summary for the admin UI / the agent
//     kind:       string, queue.announce kind
//     cooldownMs: number, minimum gap between firings of this skill
//     fetchData:  (ctx, state) => Promise<any>   (optional, defaults to null)
//     script:     (ctx, data, helpers) => Promise<string>
//     ready:      () => boolean             (optional — false when an env key is missing)
//     requiresKey:string                    (optional — names that env key)
//   }
//
// Autonomous firing is NOT driven from here. The segment-director agent
// (skills/_agent.js) decides what airs on each scheduler tick, and the skill
// modules' fetch helpers back its tools. This module now serves two things:
//   - skillCatalog() — skill metadata for the admin command-center UI
//   - runSkill()     — operator-triggered one-off firing via the /dj/skill route
//
// `state` is a per-skill object passed through to fetchData/script; skills
// mutate it freely. It lives in memory only — restarts wipe it, that's fine.

import { queue } from '../broadcast/queue.js';
import * as settings from '../settings.js';

import weather from './weather.js';
import news from './news.js';
import traffic from './traffic.js';
import randomFacts from './random-facts.js';
import webSearch from './web-search.js';

const SKILLS = [weather, news, traffic, randomFacts, webSearch];

const state = new Map();   // name → per-skill state object

for (const s of SKILLS) {
  if (!s?.name || !s?.kind || typeof s.script !== 'function') {
    throw new Error(`Skill registry: invalid skill ${s?.name || '(unnamed)'}`);
  }
  state.set(s.name, {});
}

export function listSkills() {
  return SKILLS.map(s => s.name);
}

// Skill metadata for the admin command-center UI.
export function skillCatalog() {
  const enabledMap = settings.get().skills?.enabled || {};
  return SKILLS.map(s => ({
    name: s.name,
    label: s.label || s.name,
    description: s.description || '',
    kind: s.kind,
    cooldownMs: s.cooldownMs || 0,
    enabled: enabledMap[s.name] !== false,
    // `ready` is false when the skill needs an env key that isn't set.
    // `requiresKey` names that key so the admin UI can tell the operator.
    ready: typeof s.ready === 'function' ? !!s.ready() : true,
    requiresKey: s.requiresKey || null,
  }));
}

// Run a named skill on demand — operator override from the /dj/skill route.
// Unconditional: when the operator asks for a segment, they get one — no
// cooldown, no frequency floor. Returns the spoken text.
export async function runSkill(name, ctx) {
  const skill = SKILLS.find(s => s.name === name);
  if (!skill) throw new Error(`unknown skill: ${name}`);

  let data = null;
  if (typeof skill.fetchData === 'function') {
    data = await skill.fetchData(ctx, state.get(skill.name));
  }
  const text = await skill.script(ctx, data, {
    state: state.get(skill.name),
    recap: queue.getDjRecap(),
    recentOpeners: queue.getRecentOpeners(),
  });
  if (!text || !text.trim()) throw new Error(`skill "${name}" produced no text`);

  await queue.announce(text.trim(), skill.kind);
  return text.trim();
}
