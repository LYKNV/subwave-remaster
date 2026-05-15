// POST /request — listener track requests. Runs the request text through the
// LLM matcher, resolves a track via a cascade of pick strategies, generates a
// DJ intro, and enqueues it.
import express from 'express';
import * as subsonic from '../music/subsonic.js';
import * as dj from '../llm/dj.js';
import * as library from '../music/library.js';
import { getFullContext } from '../context.js';
import { queue } from '../broadcast/queue.js';
import {
  checkRateLimit, clientIp,
  REQUESTS_DISABLED, REQUEST_TEXT_MAX, REQUEST_NAME_MAX,
} from '../middleware/ratelimit.js';

export const router = express.Router();

// Resolve "latest album by Diljit" style requests: find the artist, sort their
// albums by year, pick a song from the right album. Returns a Subsonic song or null.
async function pickByArtistAndSort({ artistName, sort, scope, recentIds }) {
  try {
    const artists = await subsonic.searchArtists(artistName, { artistCount: 5 });
    if (artists.length === 0) return null;
    const artist = await subsonic.getArtist(artists[0].id);
    let albums = artist?.album || [];
    if (albums.length === 0) return null;

    if (sort === 'latest') {
      albums = [...albums].sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (sort === 'oldest') {
      albums = [...albums].sort((a, b) => (a.year || 9999) - (b.year || 9999));
    }
    // sort=popular or null → leave order as Subsonic returned

    // Try the top-ranked album first; if its tracks are all recently played,
    // walk down the list before giving up.
    for (const album of albums.slice(0, 5)) {
      const songs = await subsonic.getAlbum(album.id);
      if (songs.length === 0) continue;
      const fresh = songs.filter(s => !recentIds.has(s.id));
      const pool = fresh.length > 0 ? fresh : songs;
      // scope=album → random track from the album; scope=song → same thing here
      return pool[Math.floor(Math.random() * pool.length)];
    }
  } catch (err) {
    queue.log('error', `pickByArtistAndSort failed: ${err.message}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /request — listener submits a request
// ---------------------------------------------------------------------------
router.post('/request', async (req, res) => {
  if (REQUESTS_DISABLED) {
    return res.status(503).json({ success: false, message: 'Requests are temporarily closed.' });
  }

  const rawText = typeof req.body?.text === 'string' ? req.body.text : '';
  const rawName = typeof req.body?.name === 'string' ? req.body.name : '';
  const text = rawText.trim().slice(0, REQUEST_TEXT_MAX);
  if (!text) {
    return res.status(400).json({ error: 'Empty request' });
  }
  const requester = (rawName.trim().slice(0, REQUEST_NAME_MAX)) || 'anon';

  const gate = checkRateLimit(clientIp(req));
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter));
    return res.status(429).json({
      success: false,
      message: `Easy there — try again in ${gate.retryAfter}s.`,
      retryAfter: gate.retryAfter,
    });
  }

  try {
    queue.log('request', `${requester}: "${text}"`);

    // 0. "more like this" — never let it through the generic search path,
    // it's a meta-instruction about the current track, not a query. Pick
    // another song by the current/last artist and skip the LLM match.
    const isMoreLikeThis = /^more\s+like\s+this[.!?]?$/i.test(text);
    if (isMoreLikeThis) {
      const reference = queue.current || queue.history[0];
      const refArtist = reference?.track?.artist;
      if (!refArtist) {
        return res.json({
          success: false,
          message: `Nothing's playing yet — tell me what you're after instead.`,
        });
      }
      const recentIds = queue.recentlyPlayedIds(25);
      const pick = await pickByArtistAndSort({
        artistName: refArtist,
        sort: null,
        scope: 'song',
        recentIds,
      });
      if (!pick) {
        return res.json({
          success: false,
          message: `Couldn't find more from ${refArtist} in the crates.`,
        });
      }
      const ctx = await getFullContext();
      const introScript = await dj.generateIntro({
        track: pick,
        context: ctx,
        requestedBy: requester,
        requestText: text,
        recap: queue.getDjRecap(),
        recentTracks: queue.getRecentTracks(),
        recentOpeners: queue.getRecentOpeners(),
      });
      await queue.push({
        track: pick,
        requestedBy: requester,
        intent: 'more_like_this',
        introScript,
      });
      return res.json({
        success: true,
        ack: `More from ${refArtist}, coming up.`,
        track: { title: pick.title, artist: pick.artist },
        queuePosition: queue.upcoming.length,
      });
    }

    // 1. LLM matches intent — pass current track so vibe queries can be
    // interpreted against what's actually on-air ("match this energy",
    // "something slower than this", etc.).
    const currentTrack = queue.current?.track || null;
    const matched = await dj.matchRequest(text, {
      listenerName: requester,
      nowPlaying: currentTrack,
    });
    queue.log('intent', `"${text}" → ${matched.intent || '(no intent)'}`, {
      mood: matched.mood,
      scope: matched.scope,
      sort: matched.sort,
      artist: matched.artist,
      searchTerms: matched.search_terms,
    });

    const recentIds = queue.recentlyPlayedIds(25);
    await library.load();

    // Helper: pick a fresh random item from a pool, preferring non-recents.
    const randomFresh = (pool) => {
      if (!pool || pool.length === 0) return null;
      const fresh = pool.filter(s => s?.id && !recentIds.has(s.id));
      const choose = fresh.length > 0 ? fresh : pool;
      return choose[Math.floor(Math.random() * choose.length)] || null;
    };

    let pick = null;
    let pickSource = null;

    // 2a. Smart artist + sort path — if the listener asked for "latest/oldest
    // album by X", resolve the artist's albums and pick from the right one.
    if (!pick && matched.artist && (matched.sort || matched.scope === 'album')) {
      pick = await pickByArtistAndSort({
        artistName: matched.artist,
        sort: matched.sort,
        scope: matched.scope,
        recentIds,
      });
      if (pick) pickSource = 'artist-sort';
    }

    // 2b. Search by terms — only when the LLM gave us terms that look like
    // real library values (artist/song/genre), not vibe words. The system
    // prompt forbids vibe terms here, but defensively skip search if the
    // only term equals the mood string.
    if (!pick) {
      const terms = (matched.search_terms || []).filter(t => {
        if (!t || typeof t !== 'string') return false;
        if (matched.mood && t.toLowerCase() === matched.mood.toLowerCase()) return false;
        return true;
      });
      if (terms.length > 0) {
        let candidates = [];
        for (const term of terms) {
          const r = await subsonic.search(term, { songCount: 25 });
          candidates = [...candidates, ...r];
        }
        const seen = new Set();
        const unique = candidates.filter(s => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
        pick = randomFresh(unique);
        if (pick) pickSource = 'search';
      }
    }

    // 2c. Mood-tagged library — the right vocabulary for vibe queries. The
    // tagger writes moods like "calm", "rainy", "night" to state/moods.json;
    // matchRequest's "mood" field uses the same vocabulary.
    if (!pick && matched.mood) {
      const moodPool = library.songsByMood(matched.mood);
      pick = randomFresh(moodPool);
      if (pick) pickSource = `library-mood:${matched.mood}`;
    }

    // 2d. Similar-songs from the current track — when the listener's intent
    // is vibe-adjacent and we have something playing, Subsonic can surface
    // adjacency that wasn't captured in our local mood tags.
    if (!pick && currentTrack?.id && (matched.mood || /similar|like|match/i.test(text))) {
      try {
        const similar = await subsonic.getSimilarSongs(currentTrack.id, { count: 20 });
        pick = randomFresh(similar);
        if (pick) pickSource = 'similar-to-current';
      } catch {}
    }

    // 2e. Dominant-mood fallback — if the listener gave us nothing actionable
    // but the station has a mood for the current moment (weather/time/festival),
    // play something that fits the room rather than refusing.
    if (!pick) {
      try {
        const ctxNow = await getFullContext();
        if (ctxNow.dominantMood) {
          const moodPool = library.songsByMood(ctxNow.dominantMood);
          pick = randomFresh(moodPool);
          if (pick) pickSource = `library-mood:${ctxNow.dominantMood}(context)`;
        }
      } catch {}
    }

    // 2f. Starred — operator's hand-picked favourites are always a safe pick.
    if (!pick) {
      try {
        const starred = await subsonic.getStarred();
        pick = randomFresh(starred);
        if (pick) pickSource = 'starred';
      } catch {}
    }

    if (!pick) {
      queue.log('miss', `Nothing matched "${text}"`);
      return res.json({
        success: false,
        message: `Sorry ${requester}, nothing in the crates matched that.`,
      });
    }
    queue.log('request', `resolved via ${pickSource}: ${pick.title} — ${pick.artist}`);

    // 3. Generate DJ intro that mentions the request
    const ctx = await getFullContext();
    const introScript = await dj.generateIntro({
      track: pick,
      context: ctx,
      requestedBy: requester,
      requestText: text,
      recap: queue.getDjRecap(),
      recentTracks: queue.getRecentTracks(),
      recentOpeners: queue.getRecentOpeners(),
    });

    // 4. Add to queue (will trigger Liquidsoap via the queue manager)
    await queue.push({
      track: pick,
      requestedBy: requester,
      intent: matched.intent,
      introScript,
    });

    res.json({
      success: true,
      ack: matched.ack,
      track: { title: pick.title, artist: pick.artist },
      queuePosition: queue.upcoming.length,
    });
  } catch (err) {
    queue.log('error', `Request handling failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});
