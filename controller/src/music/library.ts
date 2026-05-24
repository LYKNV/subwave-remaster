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
  const byGenre: Record<string, number> = {};
  for (const t of Object.values(store.tracks) as any[]) {
    for (const m of t.moods || []) byMood[m] = (byMood[m] || 0) + 1;
    if (t.energy) byEnergy[t.energy] = (byEnergy[t.energy] || 0) + 1;
    if (t.genre) byGenre[t.genre] = (byGenre[t.genre] || 0) + 1;
  }
  return { total, byMood, byEnergy, byGenre, updatedAt: store.updatedAt };
}

// In-memory filter over the tagged track index. Powers the admin Library
// browse panel — pure JS, no Subsonic calls. AND across facets; multiple
// moods OR within the mood facet. `q` is a case-insensitive substring match
// against title + artist + album. Returns paginated rows + the unfiltered
// match total so the UI can show "1–50 of N".
export interface FilterOpts {
  moods?: string[];
  energy?: string | null;
  genre?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  q?: string | null;
  sort?: 'artist' | 'title' | 'taggedAt' | 'year';
  limit?: number;
  offset?: number;
}

export interface FilteredRow {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number | string | null;
  genre?: string | null;
  duration?: number | null;
  moods: string[];
  energy: string | null;
  taggedAt?: string;
}

export function filter(opts: FilterOpts = {}) {
  const moods = (opts.moods || []).filter(Boolean);
  const energy = opts.energy || null;
  const genre = opts.genre || null;
  const yearFrom = Number.isFinite(opts.yearFrom as number) ? (opts.yearFrom as number) : null;
  const yearTo = Number.isFinite(opts.yearTo as number) ? (opts.yearTo as number) : null;
  const q = (opts.q || '').trim().toLowerCase();
  const sort = opts.sort || 'artist';
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const offset = Math.max(0, opts.offset ?? 0);

  const matched: FilteredRow[] = [];
  for (const [id, t] of Object.entries(store.tracks) as [string, any][]) {
    if (moods.length && !(t.moods || []).some((m: string) => moods.includes(m))) continue;
    if (energy && t.energy !== energy) continue;
    if (genre && t.genre !== genre) continue;
    const year = numericYear(t.year);
    if (yearFrom != null && (year === 0 || year < yearFrom)) continue;
    if (yearTo != null && (year === 0 || year > yearTo)) continue;
    if (q) {
      const hay = `${t.title || ''} ${t.artist || ''} ${t.album || ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    matched.push({
      id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      year: t.year ?? null,
      genre: t.genre ?? null,
      duration: t.duration ?? null,
      moods: t.moods || [],
      energy: t.energy ?? null,
      taggedAt: t.taggedAt,
    });
  }

  const cmp = SORTERS[sort] || SORTERS.artist;
  matched.sort(cmp);

  return {
    total: matched.length,
    rows: matched.slice(offset, offset + limit),
  };
}

const SORTERS: Record<string, (a: FilteredRow, b: FilteredRow) => number> = {
  artist: (a, b) =>
    cmpStr(a.artist, b.artist) || cmpStr(a.album, b.album) || cmpStr(a.title, b.title),
  title: (a, b) => cmpStr(a.title, b.title) || cmpStr(a.artist, b.artist),
  year: (a, b) => numericYear(b.year) - numericYear(a.year) || cmpStr(a.artist, b.artist),
  taggedAt: (a, b) => cmpStr(b.taggedAt, a.taggedAt),
};

function cmpStr(a?: string | null, b?: string | null) {
  return (a || '').localeCompare(b || '', undefined, { sensitivity: 'base' });
}
function numericYear(y: number | string | null | undefined): number {
  if (y == null) return 0;
  if (typeof y === 'number') return y;
  const n = parseInt(y, 10);
  return Number.isFinite(n) ? n : 0;
}
