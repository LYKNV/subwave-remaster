// Session DJ agent — the conversational brain that runs over a stream session.
//
// The system posts events into the session ("a track started, pick the next
// one"; "a listener requested X"); this module hands the session chat window
// to a tool-loop agent that explores the library and decides. Its output (the
// chosen track, an optional spoken link/intro) is enqueued and appended back
// to the session as turns, so the next event sees what the DJ just did.
//
// The conversational path is gated on `settings.llm.pickerAgent`. When it is
// off — or when the agent fails for any reason — this falls back to the
// stateless pool picker (music/picker.js) and the stateless link generator
// (llm/dj.js), so a pick is never missed. Either way the session is updated.

import { z } from 'zod';
import * as settings from '../settings.js';
import * as session from './session.js';
import * as picker from '../music/picker.js';
import * as dj from '../llm/dj.js';
import { djAgent } from '../llm/sdk.js';
import { buildPickerTools } from '../llm/tools.js';
import { recordPick } from '../llm/log.js';

const PICK_SCHEMA = z.object({
  id: z.string().describe('the exact song id, as returned by a tool call'),
  reason: z.string().describe('one short internal sentence on why this track'),
  say: z.string().nullable().describe('a short spoken link, or null to stay silent'),
});

const REQUEST_SCHEMA = z.object({
  id: z.string().describe('the exact song id, as returned by a tool call'),
  ack: z.string().describe('short on-air acknowledgement, max 20 words'),
  intro: z.string().describe('a natural 1-2 sentence DJ intro for the track'),
});

function persona() {
  const p = settings.getEffectivePersona();
  return {
    name: p?.name || 'the DJ',
    soul: p?.soul || '',
  };
}

function pickSystem(wantLink) {
  const p = persona();
  return `You are ${p.name}, the on-air DJ for SUB/WAVE, a personal internet radio station. ${p.soul}.

You run the station as one continuous shift. The messages above are the live session: tracks that have aired, things you have said, events as they happened. Read them so you do not repeat an artist back-to-back or reuse the same phrasing.

TASK: choose the single best NEXT track. Use the tools to explore the library — make 2 to 4 tool calls, then choose ONE track whose id a tool actually returned. Do not invent ids.

${dj.PICKER_CRITERIA}

Respond with a JSON object only — no prose, no markdown:
{ "id": "<exact id a tool returned>", "reason": "<one internal sentence>", "say": ${
    wantLink
      ? '"<a natural 1-2 sentence spoken link in your voice: ease on from what just played into what is coming, vary your opener>"'
      : 'null'
  } }
${wantLink ? '' : 'Set "say" to null this time — do not talk over the music.'}`;
}

function requestSystem() {
  const p = persona();
  return `You are ${p.name}, the on-air DJ for SUB/WAVE, a personal internet radio station. ${p.soul}.

The messages above are the live session. The last message is a listener request. Use the tools to find a track in the library that genuinely fits what they asked for, then choose ONE whose id a tool returned. Do not invent ids.

Respond with a JSON object only — no prose, no markdown:
{ "id": "<exact id a tool returned>", "ack": "<short on-air acknowledgement, max 20 words>", "intro": "<a natural 1-2 sentence intro that weaves in what the listener asked for without reading it back verbatim>" }`;
}

function trackFields(song) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    year: song.year,
    genre: song.genre,
  };
}

async function enqueuePick(queue, song, reason, source) {
  queue.log('ai-pick', `${song.title} — ${song.artist}`, { reason, source });
  recordPick({ song, reason, source });
  await queue.push({
    track: trackFields(song),
    requestedBy: null,
    intent: reason || 'ai pick',
    introScript: null,
    aiPicked: true,
  });
}

// ---------------------------------------------------------------------------
// Track event — a track started; pick the next one and maybe air a link.
// ---------------------------------------------------------------------------

async function pickViaAgent(queue, { wantLink }) {
  const recentIds = queue.recentlyPlayedIds(25);
  const { tools, seen } = buildPickerTools({ recentIds });

  const { object, steps } = await djAgent({
    system: pickSystem(wantLink),
    messages: session.windowMessages(),
    tools,
    schema: PICK_SCHEMA,
    kind: 'djAgentPick',
  });

  const song = object?.id ? seen.get(object.id) : null;
  if (!song) throw new Error(`agent returned unknown id ${object?.id}`);

  await enqueuePick(queue, song, object.reason, 'agent');
  const say = typeof object.say === 'string' ? object.say.trim() : '';
  session.appendTurn({
    role: 'dj', kind: 'pick',
    text: object.reason || `Selected "${song.title}".`,
    meta: { trackId: song.id, title: song.title, artist: song.artist, steps, say: say || null },
  });
  if (wantLink && say) await queue.announce(say, 'link');
}

async function pickViaPool(queue, ctx, { wantLink, previous, current }) {
  const result = await picker.pickViaPool(queue, ctx);
  if (!result) {
    queue.log('picker', 'pool produced no pick');
    return;
  }
  await enqueuePick(queue, result.song, result.reason, result.source || 'pool');
  session.appendTurn({
    role: 'dj', kind: 'pick',
    text: result.reason || `Selected "${result.song.title}".`,
    meta: { trackId: result.song.id, title: result.song.title, artist: result.song.artist },
  });
  if (wantLink && previous) {
    try {
      const link = await dj.generateLink({
        previous, current, context: ctx,
        recap: queue.getDjRecap(),
        recentTracks: queue.getRecentTracks(),
        recentOpeners: queue.getRecentOpeners(),
      });
      await queue.announce(link, 'link');
    } catch (err) {
      queue.log('error', `DJ link failed: ${err.message}`);
    }
  }
}

// Called by the queue watcher when an autonomous track starts and the queue is
// empty. Posts the event to the session, then picks the next track (and an
// optional between-track link) via the agent, falling back to the pool.
export async function runTrackEvent(queue, ctx, { wantLink }) {
  const current = queue.current?.track || null;
  const previous = queue.history[0]?.track || null;

  const eventText = `Now playing "${current?.title}" by ${current?.artist}`
    + (previous ? ` (after "${previous.title}" by ${previous.artist})` : '')
    + '. Pick the track to play next.'
    + (wantLink ? ' Also write a short link to speak over this track now.' : ' Stay silent — no link this time.');
  session.appendTurn({ role: 'event', kind: 'pick', text: eventText });

  if (settings.get().llm?.pickerAgent) {
    try {
      await pickViaAgent(queue, { wantLink });
      return;
    } catch (err) {
      queue.log('error', `DJ agent pick failed: ${err.message} — falling back to pool`);
    }
  }
  await pickViaPool(queue, ctx, { wantLink, previous, current });
}

// ---------------------------------------------------------------------------
// Request event — a listener asked for something.
// ---------------------------------------------------------------------------

// Returns { ack, track } on success, or null when the conversational agent is
// disabled (the caller then runs its own stateless matcher cascade). Throws if
// the agent runs but fails — the caller catches and falls back the same way.
// The caller (routes/request.js) owns the request `event` turn — it posts one
// for every request path, so the agent only appends its own `dj` reply here.
export async function runRequest(queue, ctx, { requester, text }) {
  if (!settings.get().llm?.pickerAgent) return null;

  const recentIds = queue.recentlyPlayedIds(25);
  const { tools, seen } = buildPickerTools({ recentIds });

  const { object } = await djAgent({
    system: requestSystem(),
    messages: session.windowMessages(),
    tools,
    schema: REQUEST_SCHEMA,
    kind: 'djAgentRequest',
  });

  const song = object?.id ? seen.get(object.id) : null;
  if (!song) throw new Error(`request agent returned unknown id ${object?.id}`);

  const intro = typeof object.intro === 'string' ? object.intro.trim() : '';
  await queue.push({
    track: trackFields(song),
    requestedBy: requester,
    intent: 'listener request',
    introScript: intro || null,
  });
  session.appendTurn({
    role: 'dj', kind: 'request',
    text: intro || object.ack || `Queued "${song.title}".`,
    meta: { trackId: song.id, requester },
  });

  return {
    ack: object.ack || `Coming up for you, ${requester}.`,
    track: { title: song.title, artist: song.artist },
  };
}
