// ElevenLabs text-to-sound-effects client. The AI SDK exposes only a speech
// primitive, not a sound-effects one, so this calls the REST endpoint
// directly. It sits alongside the cloud TTS engine (llm/speech.js) and reuses
// its ElevenLabs key — backs the sound-effects library (broadcast/sfx.js).

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import * as settings from '../settings.js';

const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';

// Resolve the ElevenLabs key the same way llm/speech.js does: a key typed into
// Settings only counts when the cloud TTS provider is ElevenLabs; otherwise
// fall back to the ELEVENLABS_API_KEY env var.
function apiKey() {
  const c = settings.get().tts?.cloud || {};
  const settingsKey = c.provider === 'elevenlabs' ? c.apiKey : '';
  return settingsKey || process.env.ELEVENLABS_API_KEY || '';
}

// True when a key is resolvable — backs the admin UI's "needs a key" state.
export function isConfigured() {
  return !!apiKey();
}

// Generate a sound effect from a text prompt and write it to outPath (mp3).
// durationSec is optional — ElevenLabs accepts ~0.5–22s; omit it to let the
// model choose its own length. Returns the written path.
export async function generateSfx(
  prompt: string,
  { durationSec, outPath }: { durationSec?: number; outPath?: string } = {},
) {
  if (!prompt || !prompt.trim()) throw new Error('Empty SFX prompt');
  if (!outPath) throw new Error('generateSfx requires an outPath');
  const key = apiKey();
  if (!key) {
    throw new Error('ElevenLabs API key not configured — set it under cloud TTS, or ELEVENLABS_API_KEY');
  }

  const body: any = { text: prompt.trim(), prompt_influence: 0.3 };
  const d = Number(durationSec);
  if (Number.isFinite(d) && d > 0) {
    body.duration_seconds = Math.min(22, Math.max(0.5, d));
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs sound-generation failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return outPath;
}
