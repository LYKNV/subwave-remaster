// One-shot library tagger.
// Walks the entire Navidrome library, sends each unseen track to Ollama for
// {moods, energy} classification, persists results in state/moods.json.
// Resumable — already-tagged tracks are skipped, so you can re-run any time.
//
// Run:  docker exec sub-wave-controller node src/music/tag-library.js
//   or  docker exec sub-wave-controller node src/music/tag-library.js --limit 100

import { z } from 'zod';
import * as subsonic from './subsonic.js';
import * as library from './library.js';
import * as settings from '../settings.js';
import { SHOW_MOODS as MOOD_VOCAB } from '../settings.js';
import { djObject } from '../llm/sdk.js';
import { activeModelLabel } from '../llm/provider.js';

// Tag classification goes through the AI SDK (llm/sdk.js → llm/provider.js)
// like every other model call, so it follows whatever provider/model the admin
// Settings UI selects. The result is Zod-validated; moods are filtered against
// MOOD_VOCAB defensively in case the model drifts off the controlled list.
const TagSchema = z.object({
  moods: z.array(z.string()).default([]),
  energy: z.string().nullable().default(null),
});

const SYSTEM = `You tag music tracks with mood and energy for a personal radio station.

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

async function tagOne(song) {
  const userPrompt =
    `Title: ${song.title}\n` +
    `Artist: ${song.artist || '?'}\n` +
    `Album: ${song.album || '?'}\n` +
    `Year: ${song.year || '?'}\n` +
    `Genre: ${song.genre || '?'}`;

  const parsed = await djObject({
    system: SYSTEM,
    prompt: userPrompt,
    schema: TagSchema,
    temperature: 0.2,
    kind: 'tag-library',
  });
  const moods = Array.isArray(parsed.moods)
    ? parsed.moods.filter(m => MOOD_VOCAB.includes(m)).slice(0, 3)
    : [];
  const energy = ['low', 'medium', 'high'].includes(parsed.energy) ? parsed.energy : null;
  return { moods, energy };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

  await library.load();
  await settings.load();
  console.log(`[tag] starting. ${library.allTaggedIds().length} tracks already tagged.`);
  console.log(`[tag] model: ${activeModelLabel()}`);
  if (limit !== Infinity) console.log(`[tag] limit: ${limit} new tracks`);

  let processed = 0;
  let saved = 0;
  let failed = 0;
  const startedAt = Date.now();
  const SAVE_EVERY = 25;

  for await (const song of subsonic.iterateAllSongs()) {
    processed++;
    if (library.has(song.id)) continue;
    if (saved >= limit) break;

    try {
      const { moods, energy } = await tagOne(song);
      library.set(song.id, {
        title: song.title,
        artist: song.artist,
        album: song.album,
        year: song.year,
        genre: song.genre,
        moods,
        energy,
      });
      saved++;
      const tagStr = moods.length ? moods.join(', ') : '(none)';
      console.log(`[${saved}/${processed}] ${song.artist} — ${song.title} → ${tagStr} [${energy || '?'}]`);

      if (saved % SAVE_EVERY === 0) {
        await library.save();
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = saved / elapsed;
        console.log(`[tag] flushed. ${saved} new tags, ${(rate * 60).toFixed(1)}/min`);
      }
    } catch (err) {
      failed++;
      console.error(`[tag] FAIL ${song.id} (${song.title}): ${err.message}`);
    }
  }

  await library.save();
  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(`\n[tag] done in ${elapsed.toFixed(0)}s. saved=${saved} failed=${failed} processed=${processed}`);
  console.log('[stats]', JSON.stringify(library.stats(), null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
