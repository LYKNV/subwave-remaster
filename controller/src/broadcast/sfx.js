// Sound-effects library — short pre-rendered stingers the segment-director
// agent (skills/_agent.js) can play UNDERNEATH its voice via the sfx_queue in
// liquidsoap/radio.liq.
//
// Mirrors broadcast/jingles.js: audio files on disk plus a JSON sidecar, with
// admin CRUD on top. Files live at <stateDir>/sfx/<name>.mp3; the sidecar
// <stateDir>/sfx.json maps name → { name, description, prompt, durationSec,
// file, builtin, createdAt }. Unlike jingles there is no .m3u — Liquidsoap
// plays an effect on demand (controller writes its path to sfx.txt), it does
// not rotate them on a playlist.

import { readFile, writeFile, unlink, mkdir, stat } from 'node:fs/promises';
import { STATE_DIR } from '../config.js';
import { generateSfx, isConfigured } from '../audio/sfx-gen.js';

const DIR = `${STATE_DIR}/sfx`;
const META = `${STATE_DIR}/sfx.json`;

// Built-in starter set — rendered on first boot when ElevenLabs is configured.
const DEFAULT_SFX = [
  {
    name: 'record-scratch',
    description: 'abrupt vinyl record scratch — punctuates a hard cut, a joke, or a sudden change of subject',
    prompt: 'abrupt vinyl record scratch, short and sharp',
    durationSec: 1.5,
  },
  {
    name: 'airhorn',
    description: 'a single short airhorn blast — celebratory; use very sparingly, only for a genuinely big moment',
    prompt: 'single short reggae airhorn blast',
    durationSec: 1.5,
  },
  {
    name: 'applause',
    description: 'a brief burst of crowd applause — for a triumphant or warm beat',
    prompt: 'short warm crowd applause burst',
    durationSec: 2.5,
  },
  {
    name: 'whoosh',
    description: 'a quick transitional whoosh — smooths a scene change or a fast aside',
    prompt: 'quick cinematic transition whoosh',
    durationSec: 1.2,
  },
  {
    name: 'drum-roll',
    description: 'a short drum roll — builds anticipation before a reveal',
    prompt: 'short snare drum roll ending on a cymbal hit',
    durationSec: 2.5,
  },
  {
    name: 'vinyl-stop',
    description: 'a turntable power-down — a dramatic dead stop on a thought',
    prompt: 'turntable power down, vinyl record slowing to a stop',
    durationSec: 1.8,
  },
];

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function loadMeta() {
  try {
    return JSON.parse(await readFile(META, 'utf8'));
  } catch {
    return { items: {} };
  }
}

async function saveMeta(meta) {
  await writeFile(META, JSON.stringify(meta, null, 2));
}

async function statOrNull(p) {
  try { return await stat(p); } catch { return null; }
}

// Returns the listed effects with file existence verified.
export async function list() {
  const meta = await loadMeta();
  const out = [];
  for (const [name, info] of Object.entries(meta.items)) {
    const s = await statOrNull(`${DIR}/${info.file}`);
    if (!s) continue;
    out.push({
      name,
      description: info.description || '',
      prompt: info.prompt || '',
      durationSec: info.durationSec || null,
      builtin: !!info.builtin,
      createdAt: info.createdAt,
      size: s.size,
    });
  }
  // Built-ins last so operator-created effects appear on top.
  out.sort((a, b) => {
    if (a.builtin !== b.builtin) return a.builtin ? 1 : -1;
    return (a.name || '').localeCompare(b.name || '');
  });
  return out;
}

// Name + description only — the slim view the segment agent reads to decide
// whether (and which) effect fits a line.
export async function catalog() {
  return (await list()).map(s => ({ name: s.name, description: s.description }));
}

// Absolute path to an effect's audio file, or null if unknown / missing.
export async function getPath(name) {
  const meta = await loadMeta();
  const info = meta.items[name];
  if (!info) return null;
  const filePath = `${DIR}/${info.file}`;
  return (await statOrNull(filePath)) ? filePath : null;
}

export async function create({ name, description, prompt, durationSec, builtin = false } = {}) {
  const slug = slugify(name);
  if (!slug) throw new Error('Sound effect name is required');
  if (!prompt || !prompt.trim()) throw new Error('Sound effect prompt is required');
  await mkdir(DIR, { recursive: true });

  const file = `${slug}.mp3`;
  await generateSfx(prompt, { durationSec, outPath: `${DIR}/${file}` });

  const meta = await loadMeta();
  meta.items[slug] = {
    name: slug,
    description: (description || '').trim(),
    prompt: prompt.trim(),
    durationSec: Number(durationSec) || null,
    file,
    builtin,
    createdAt: new Date().toISOString(),
  };
  await saveMeta(meta);
  return meta.items[slug];
}

export async function remove(name) {
  const meta = await loadMeta();
  const info = meta.items[name];
  if (!info) throw new Error(`unknown sound effect: ${name}`);
  if (info.builtin) throw new Error('cannot delete a built-in sound effect');

  try { await unlink(`${DIR}/${info.file}`); } catch {}
  delete meta.items[name];
  await saveMeta(meta);
  return { ok: true };
}

// Called from server.js startup. Renders any missing built-in effects when
// ElevenLabs is configured; a no-op when it isn't — the library simply stays
// empty and the feature is invisible to the agent. Idempotent.
export async function ensureDefaults() {
  if (!isConfigured()) {
    console.log('[sfx] ElevenLabs not configured — skipping default sound effects');
    return;
  }
  await mkdir(DIR, { recursive: true });
  const meta = await loadMeta();
  for (const def of DEFAULT_SFX) {
    const existing = meta.items[def.name];
    if (existing && (await statOrNull(`${DIR}/${existing.file}`))) continue;
    try {
      await create({ ...def, builtin: true });
      console.log(`[sfx] generated default effect → ${def.name}`);
    } catch (err) {
      console.error(`[sfx] default "${def.name}" generation failed:`, err.message);
    }
  }
}
