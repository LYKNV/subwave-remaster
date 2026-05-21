// Library cache — durable store for LLM-generated mood tags per track.
// Backed by a JSON file in the shared state volume. In-memory map for fast
// lookups. The tagger script (tag-library.js) writes it; the scheduler reads it.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { STATE_DIR } from '../config.js';

const PATH = `${STATE_DIR}/moods.json`;

let store: any = { tracks: {}, updatedAt: null };
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

export function get(songId: string) {
  return store.tracks[songId] || null;
}

export function set(songId: string, data: any) {
  store.tracks[songId] = { ...data, taggedAt: new Date().toISOString() };
}

export function has(songId: string) {
  return songId in store.tracks;
}

export function allTaggedIds() {
  return Object.keys(store.tracks);
}

// Musically-adjacent moods. The LLM tagger is told to tag by how a track
// FEELS, so it rarely assigns time-of-day moods — `morning` ends up with 0
// tracks, `evening` with 1 — which leaves the picker's mood source dark for
// the ~7 morning hours a day that `dominantMood` is `morning`. When a
// requested mood is sparsely tagged, songsByMood() widens the match to these
// neighbours. The picker still hands the full candidate set to the LLM, which
// curates against the real context; widening only deepens the pool.
const MOOD_NEIGHBOURS: Record<string, string[]> = {
  morning:     ['calm', 'focus', 'sunny'],
  evening:     ['calm', 'reflective', 'romantic'],
  night:       ['reflective', 'calm', 'romantic'],
  driving:     ['energetic', 'focus'],
  focus:       ['calm', 'reflective'],
  energetic:   ['workout', 'celebratory'],
  reflective:  ['calm', 'night'],
  celebratory: ['festival', 'energetic'],
  romantic:    ['calm', 'reflective'],
  festival:    ['celebratory', 'cultural', 'spiritual'],
  sunny:       ['energetic', 'calm'],
  rainy:       ['calm', 'reflective'],
};

// Below this many exact matches, songsByMood() widens to adjacent moods.
// 12 leaves comfortable margin above the picker's CAP_MOOD_LIBRARY (10).
const MOOD_MIN_EXACT = 12;

// Returns full song-shaped records (id + metadata + moods) for tracks tagged
// with the requested mood. If that mood is sparsely tagged (< MOOD_MIN_EXACT
// hits) the result is widened with musically-adjacent moods, exact matches
// kept at the front, so the picker's mood source never goes dark — see
// MOOD_NEIGHBOURS.
export function songsByMood(mood: string | null | undefined) {
  if (!mood) return [];
  const exact: any[] = [];
  for (const [id, t] of Object.entries(store.tracks) as [string, any][]) {
    if (t.moods?.includes(mood)) exact.push({ id, ...t });
  }
  if (exact.length >= MOOD_MIN_EXACT) return exact;

  const accept = new Set([mood, ...(MOOD_NEIGHBOURS[mood] || [])]);
  const seen = new Set(exact.map((s: any) => s.id));
  const widened = [...exact];
  for (const [id, t] of Object.entries(store.tracks) as [string, any][]) {
    if (seen.has(id)) continue;
    if (t.moods?.some((m: string) => accept.has(m))) {
      widened.push({ id, ...t });
      seen.add(id);
    }
  }
  return widened;
}

export function stats() {
  const total = Object.keys(store.tracks).length;
  const byMood: Record<string, number> = {};
  const byEnergy: Record<string, number> = {};
  for (const t of Object.values(store.tracks) as any[]) {
    for (const m of t.moods || []) byMood[m] = (byMood[m] || 0) + 1;
    if (t.energy) byEnergy[t.energy] = (byEnergy[t.energy] || 0) + 1;
  }
  return { total, byMood, byEnergy, updatedAt: store.updatedAt };
}
