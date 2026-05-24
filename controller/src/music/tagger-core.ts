// Shared tagging primitive.
// One LLM call per track → { moods, energy }, validated against MOOD_VOCAB.
// Used by the bulk tag-library.ts script and the inline /library/retag route,
// so a single-track retag produces exactly the same shape as a bulk run.

import { z } from 'zod';
import { SHOW_MOODS as MOOD_VOCAB } from '../settings.js';
import { djObject } from '../llm/sdk.js';

export const TagSchema = z.object({
  moods: z.array(z.string()).default([]),
  energy: z.string().nullable().default(null),
});

export const TAGGER_SYSTEM = `You tag music tracks with mood and energy for a personal radio station.

For each track, output ONLY a JSON object:
{
  "moods": [1-3 strings, each from this exact list: ${MOOD_VOCAB.join(', ')}],
  "energy": "low" | "medium" | "high"
}

Choose moods that reflect how the track FEELS to listen to, not just its genre.
A spiritual Punjabi devotional is "spiritual" and "reflective" — not "cultural".
A high-BPM dance track is "energetic" and "workout" — not "celebratory" unless it sounds festive.
A slow rainy-day instrumental is "calm" and "rainy" — not "evening" just because it's chill.

If you genuinely cannot tell from the title/artist/album, return {"moods":[],"energy":"medium"}. Do not invent.`;

export interface TaggableSong {
  title?: string;
  artist?: string;
  album?: string;
  year?: number | string | null;
  genre?: string | null;
}

export interface TagResult {
  moods: string[];
  energy: 'low' | 'medium' | 'high' | null;
}

export async function tagOne(song: TaggableSong): Promise<TagResult> {
  const userPrompt =
    `Title: ${song.title}\n` +
    `Artist: ${song.artist || '?'}\n` +
    `Album: ${song.album || '?'}\n` +
    `Year: ${song.year || '?'}\n` +
    `Genre: ${song.genre || '?'}`;

  const parsed = await djObject({
    system: TAGGER_SYSTEM,
    prompt: userPrompt,
    schema: TagSchema,
    temperature: 0.2,
    kind: 'tag-library',
  });
  const moods = Array.isArray(parsed.moods)
    ? parsed.moods.filter((m: string) => MOOD_VOCAB.includes(m)).slice(0, 3)
    : [];
  const energy = ['low', 'medium', 'high'].includes(parsed.energy as string)
    ? (parsed.energy as 'low' | 'medium' | 'high')
    : null;
  return { moods, energy };
}
