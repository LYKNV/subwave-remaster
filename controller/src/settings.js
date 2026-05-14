// Durable settings — overrides for values that have static defaults in code.
// Stored at /var/sub-wave/settings.json. Some apply live (weather location,
// DJ persona); others require a Liquidsoap restart (jingle frequency,
// crossfade duration).

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SETTINGS_PATH = '/var/sub-wave/settings.json';
const LIQ_SETTINGS_PATH = '/var/sub-wave/liquidsoap_settings.json';

// Default DJ system-prompt template. Placeholders are substituted at LLM
// call time via renderDjPrompt(). Keep {name} mandatory — update() refuses
// any custom template that drops it, so dialogue can never become anonymous.
export const DEFAULT_DJ_PROMPT_TEMPLATE = `You are {name}, the on-air DJ for {station}, a personal radio station broadcasting from a homelab in {location}. {soul}.

Hard rules:
- Output ONLY the words to be spoken aloud. No stage directions, no asterisks, no quotes around your dialogue.
- Keep it to 2-4 sentences unless asked for longer.
- Never say "and now", "next up", "coming up next" — those are tells. Be more natural.
- Don't repeat the artist and title robotically. Reference them in passing if at all.
- Reference the actual context (time, weather, what's coming) naturally.
- Vary your opener and shape every time — never start the same way twice in a row, never use the same metaphor or framing as your last few lines.`;

// Rotating micro-personas — picked at random per LLM call by ollama.djSystem()
// so the DJ shifts register across segments without losing the named identity.
// The settings.dj.soul value is always included as the first entry so custom
// user-set personas still get used.
export const DJ_SOULS = [
  'warm, slightly understated, never corny — late-night BBC 6 Music presenter; observant, dry humour, specific',
  'thoughtful and a little wistful; finds small details in tracks and rooms; favours one well-chosen image over a list',
  'playful and dry; the occasional aside, never sarcastic; treats the studio like a kitchen at midnight',
  'plainspoken and grounded; says less, means more; would rather leave space than fill it',
  'quietly enthusiastic; treats every track like a small recommendation to a friend; specific over poetic',
];

const FREQUENCIES = ['quiet', 'moderate', 'aggressive'];

const DEFAULTS = {
  jingleRatio: 30,                    // 1 jingle per N music tracks
  crossfadeDuration: 10.0,            // seconds
  weather: { lat: 52.5862, lng: -2.1288, locationName: 'Wolverhampton' },
  dj: {
    name: 'Frequency',
    soul: 'warm, slightly understated, never corny — late-night BBC 6 Music presenter; observant, dry humour, specific',
    systemPrompt: DEFAULT_DJ_PROMPT_TEMPLATE,
    frequency: 'moderate',
  },
};

const BOUNDS = {
  jingleRatio:        { min: 1, max: 1000, type: 'int' },
  crossfadeDuration:  { min: 0, max: 30,   type: 'float' },
};

let cache = null;

export async function load() {
  if (cache) return cache;
  let stored = {};
  if (existsSync(SETTINGS_PATH)) {
    try { stored = JSON.parse(await readFile(SETTINGS_PATH, 'utf8')); } catch {}
  }
  cache = {
    jingleRatio: stored.jingleRatio ?? DEFAULTS.jingleRatio,
    crossfadeDuration: stored.crossfadeDuration ?? DEFAULTS.crossfadeDuration,
    weather: {
      lat: stored.weather?.lat ?? DEFAULTS.weather.lat,
      lng: stored.weather?.lng ?? DEFAULTS.weather.lng,
      locationName: stored.weather?.locationName ?? DEFAULTS.weather.locationName,
    },
    dj: {
      name: stored.dj?.name ?? DEFAULTS.dj.name,
      soul: stored.dj?.soul ?? DEFAULTS.dj.soul,
      systemPrompt: stored.dj?.systemPrompt ?? DEFAULTS.dj.systemPrompt,
      frequency: FREQUENCIES.includes(stored.dj?.frequency) ? stored.dj.frequency : DEFAULTS.dj.frequency,
    },
  };
  return cache;
}

export function get() {
  return cache || DEFAULTS;
}

export function getDefaults() {
  return DEFAULTS;
}

// Validate + persist. Returns { saved, requiresRestart } so the UI can react.
export async function update(patch) {
  const cur = await load();
  const next = JSON.parse(JSON.stringify(cur));
  let restart = false;

  if ('jingleRatio' in patch) {
    const v = parseInt(patch.jingleRatio, 10);
    if (!Number.isFinite(v) || v < BOUNDS.jingleRatio.min || v > BOUNDS.jingleRatio.max) {
      throw new Error(`jingleRatio must be int in [${BOUNDS.jingleRatio.min}, ${BOUNDS.jingleRatio.max}]`);
    }
    if (v !== cur.jingleRatio) { next.jingleRatio = v; restart = true; }
  }
  if ('crossfadeDuration' in patch) {
    const v = parseFloat(patch.crossfadeDuration);
    if (!Number.isFinite(v) || v < BOUNDS.crossfadeDuration.min || v > BOUNDS.crossfadeDuration.max) {
      throw new Error(`crossfadeDuration must be number in [${BOUNDS.crossfadeDuration.min}, ${BOUNDS.crossfadeDuration.max}]`);
    }
    if (v !== cur.crossfadeDuration) { next.crossfadeDuration = v; restart = true; }
  }
  if ('weather' in patch) {
    const w = patch.weather || {};
    if (w.lat !== undefined) {
      const v = parseFloat(w.lat);
      if (!Number.isFinite(v) || v < -90 || v > 90) throw new Error('weather.lat out of range');
      next.weather.lat = v;
    }
    if (w.lng !== undefined) {
      const v = parseFloat(w.lng);
      if (!Number.isFinite(v) || v < -180 || v > 180) throw new Error('weather.lng out of range');
      next.weather.lng = v;
    }
    if (typeof w.locationName === 'string' && w.locationName.trim()) {
      next.weather.locationName = w.locationName.trim().slice(0, 80);
    }
  }
  if ('dj' in patch) {
    const d = patch.dj || {};
    if (d.name !== undefined) {
      const v = String(d.name).trim();
      if (v.length < 1 || v.length > 40) throw new Error('dj.name must be 1-40 chars');
      next.dj.name = v;
    }
    if (d.soul !== undefined) {
      const v = String(d.soul).trim();
      if (v.length < 1 || v.length > 400) throw new Error('dj.soul must be 1-400 chars');
      next.dj.soul = v;
    }
    if (d.systemPrompt !== undefined) {
      const v = String(d.systemPrompt).trim();
      if (v.length < 50 || v.length > 4000) throw new Error('dj.systemPrompt must be 50-4000 chars');
      if (!v.includes('{name}')) {
        throw new Error('dj.systemPrompt must contain the {name} placeholder');
      }
      next.dj.systemPrompt = v;
    }
    if (d.frequency !== undefined) {
      if (!FREQUENCIES.includes(d.frequency)) {
        throw new Error(`dj.frequency must be one of: ${FREQUENCIES.join(', ')}`);
      }
      next.dj.frequency = d.frequency;
    }
  }

  cache = next;
  await writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2));
  await writeLiquidsoapSettings(next);
  return { saved: next, requiresRestart: restart };
}

// Render the DJ system prompt by substituting {name}, {soul}, {station},
// {location} into the operator-supplied template. Called fresh per LLM call
// so live edits show up in the next intro/link without a restart.
export function renderDjPrompt(dj, ctx = {}) {
  const station = ctx.station || 'SUB/WAVE';
  const location = ctx.location || (cache?.weather?.locationName ?? DEFAULTS.weather.locationName);
  return (dj?.systemPrompt || DEFAULT_DJ_PROMPT_TEMPLATE)
    .replaceAll('{name}', dj?.name || DEFAULTS.dj.name)
    .replaceAll('{soul}', dj?.soul || DEFAULTS.dj.soul)
    .replaceAll('{station}', station)
    .replaceAll('{location}', location);
}

// Liquidsoap reads two tiny text files instead of JSON — Liquidsoap 2.2.5
// JSON parsing is awkward to type and not worth the effort for two values.
const LIQ_JINGLE_RATIO_PATH = '/var/sub-wave/liquidsoap_jingle_ratio.txt';
const LIQ_CROSSFADE_PATH = '/var/sub-wave/liquidsoap_crossfade.txt';

export async function writeLiquidsoapSettings(s) {
  await writeFile(LIQ_JINGLE_RATIO_PATH, String(s.jingleRatio));
  await writeFile(LIQ_CROSSFADE_PATH, String(s.crossfadeDuration));
}

// Called from server.js startup so the files exist before Liquidsoap reads
// them on its next start. Idempotent.
export async function ensureLiquidsoapSettingsFile() {
  const s = await load();
  if (!existsSync(LIQ_JINGLE_RATIO_PATH) || !existsSync(LIQ_CROSSFADE_PATH)) {
    await writeLiquidsoapSettings(s);
  }
}
