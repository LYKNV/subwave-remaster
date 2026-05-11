// LLM-as-DJ. When the auto-DJ needs the next track, we don't pick at random —
// we hand a candidate pool + recent-play context to Ollama and ask which track
// should play next. Designed to be cheap (one call per track, ~3-5 min apart)
// and gracefully degrade if the model is slow or wrong.

import * as subsonic from './subsonic.js';
import * as library from './library.js';
import * as ollama from './ollama.js';
import { getFullContext } from './context.js';

const CANDIDATE_CAP = 15;
const HISTORY_DEPTH = 8;

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

async function buildCandidates(mood, recentIds) {
  await library.load();

  // 1. Mood-tagged
  let pool = [];
  if (mood) {
    pool = library.songsByMood(mood).filter(t => !recentIds.has(t.id));
  }

  // 2. Any tagged track (mood not strict)
  if (pool.length < 5) {
    const tagged = library.allTaggedIds()
      .map(id => ({ id, ...library.get(id) }))
      .filter(t => !recentIds.has(t.id));
    pool = [...pool, ...tagged];
  }

  // 3. Starred + random fallback when library is empty
  if (pool.length < 5) {
    try {
      const starred = (await subsonic.getStarred()).filter(s => !recentIds.has(s.id));
      const random = (await subsonic.getRandomSongs({ size: 20 })).filter(s => !recentIds.has(s.id));
      pool = [...pool, ...starred, ...random];
    } catch {}
  }

  // De-dup, shuffle, cap
  const seen = new Set();
  return shuffle(pool).filter(t => {
    if (!t.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  }).slice(0, CANDIDATE_CAP);
}

function summariseRecent(queue) {
  const items = [];
  if (queue.current) items.push(queue.current);
  items.push(...queue.history.slice(0, HISTORY_DEPTH));
  return items.filter(i => i?.track?.title).map(i => {
    const tags = i.track.id ? library.get(i.track.id) : null;
    return {
      title: i.track.title,
      artist: i.track.artist,
      moods: tags?.moods || [],
      energy: tags?.energy || null,
    };
  });
}

// Main entry. Returns the picked song object (with id+metadata) or null if
// no pick could be made.
export async function pickNext(queue) {
  const ctx = await getFullContext();
  const recentIds = queue.recentlyPlayedIds(25);
  const candidates = await buildCandidates(ctx.dominantMood, recentIds);

  if (candidates.length === 0) {
    queue.log('picker', 'no candidates available, skipping LLM pick');
    return null;
  }

  const recentPlays = summariseRecent(queue);

  let pickRaw;
  try {
    pickRaw = await ollama.pickNextTrack({
      candidates: candidates.map(c => ({
        id: c.id,
        title: c.title,
        artist: c.artist,
        moods: c.moods || [],
        energy: c.energy || null,
      })),
      recentPlays,
      context: ctx,
    });
  } catch (err) {
    queue.log('error', `picker LLM failed: ${err.message}`);
    return null;
  }

  const chosen = candidates.find(c => c.id === pickRaw?.id);
  if (!chosen) {
    queue.log('error', `picker returned unknown id ${pickRaw?.id}; falling back to first candidate`);
    return { song: candidates[0], reason: 'fallback (LLM returned invalid id)' };
  }

  return { song: chosen, reason: pickRaw.reason || null };
}

// Pick + enqueue. Fire-and-forget from the watcher.
export async function pickAndEnqueue(queue) {
  const result = await pickNext(queue);
  if (!result) return;
  const { song, reason } = result;
  queue.log('ai-pick', `${song.title} — ${song.artist}`, { reason });
  await queue.push({
    track: {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      year: song.year,
      genre: song.genre,
    },
    requestedBy: null,
    intent: reason || 'ai pick',
    introScript: null,        // no spoken intro for auto-picks (keeps the flow musical)
    aiPicked: true,
  });
}
