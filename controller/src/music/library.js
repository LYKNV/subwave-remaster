// Library cache — durable store for LLM-generated mood tags per track.
// Backed by a JSON file in the shared state volume. In-memory map for fast
// lookups. The tagger script (tag-library.js) writes it; the scheduler reads it.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const PATH = '/var/sub-wave/moods.json';

let store = { tracks: {}, updatedAt: null };
let loaded = false;

export async function load() {
  if (loaded) return;
  if (existsSync(PATH)) {
    try { store = JSON.parse(await readFile(PATH, 'utf8')); } catch {}
  }
  if (!store.tracks) store.tracks = {};
  loaded = true;
}

export async function save() {
  store.updatedAt = new Date().toISOString();
  await writeFile(PATH, JSON.stringify(store));
}

export function get(songId) {
  return store.tracks[songId] || null;
}

export function set(songId, data) {
  store.tracks[songId] = { ...data, taggedAt: new Date().toISOString() };
}

export function has(songId) {
  return songId in store.tracks;
}

export function allTaggedIds() {
  return Object.keys(store.tracks);
}

// Returns full song-shaped records (id + metadata + moods) for tracks tagged
// with the requested mood.
export function songsByMood(mood) {
  if (!mood) return [];
  const out = [];
  for (const [id, t] of Object.entries(store.tracks)) {
    if (t.moods?.includes(mood)) {
      out.push({ id, ...t });
    }
  }
  return out;
}

export function stats() {
  const total = Object.keys(store.tracks).length;
  const byMood = {};
  const byEnergy = {};
  for (const t of Object.values(store.tracks)) {
    for (const m of t.moods || []) byMood[m] = (byMood[m] || 0) + 1;
    if (t.energy) byEnergy[t.energy] = (byEnergy[t.energy] || 0) + 1;
  }
  return { total, byMood, byEnergy, updatedAt: store.updatedAt };
}
