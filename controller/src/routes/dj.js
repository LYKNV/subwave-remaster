// Admin-gated DJ command center — the HTTP surface behind /admin/dash.
// Lets the operator step into the autonomous booth: speak custom text on-air,
// fire any voice segment or skill on demand, refresh the auto-playlist, and
// flip the auto-link toggle. Manual triggers are an operator override — they
// bypass the `shouldFire` frequency gate and skill cooldowns.
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { queue } from '../broadcast/queue.js';
import * as dj from '../llm/dj.js';
import { runStationId, runHourlyCheck, runLink, refreshAutoPlaylist } from '../broadcast/scheduler.js';
import { skillCatalog, runSkill } from '../skills/_registry.js';
import { getFullContext } from '../context.js';

export const router = express.Router();

const SAY_TEXT_MAX = 500;
// Duck level: 'dj-speak' → say.txt (heavy duck, solo DJ moment);
// 'link' → intro.txt (light duck, voice over the track).
const SAY_KINDS = ['dj-speak', 'link'];

// ---------------------------------------------------------------------------
// GET /dj/skills — skill catalogue for the command-center UI
// ---------------------------------------------------------------------------
router.get('/dj/skills', requireAdmin, (req, res) => {
  res.json({ skills: skillCatalog() });
});

// ---------------------------------------------------------------------------
// POST /dj/say — manual voice DJ
// Body: { text, kind?: 'dj-speak'|'link', mode?: 'raw'|'styled' }
//   raw    → the DJ speaks `text` verbatim
//   styled → `text` is an instruction; the LLM writes it in persona, then speaks
// ---------------------------------------------------------------------------
router.post('/dj/say', requireAdmin, async (req, res) => {
  const text = (typeof req.body?.text === 'string' ? req.body.text : '').trim().slice(0, SAY_TEXT_MAX);
  if (!text) return res.status(400).json({ error: 'text is required' });

  const kind = SAY_KINDS.includes(req.body?.kind) ? req.body.kind : 'dj-speak';
  const mode = req.body?.mode === 'styled' ? 'styled' : 'raw';

  try {
    let spoken = text;
    if (mode === 'styled') {
      spoken = await dj.generateAdLib({
        instruction: text,
        context: await getFullContext(),
        recap: queue.getDjRecap(),
        recentOpeners: queue.getRecentOpeners(),
      });
    }
    await queue.announce(spoken, kind);
    res.json({ ok: true, mode, kind, spoken });
  } catch (err) {
    queue.log('error', `/dj/say failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /dj/segment — fire a voice segment on demand
// Body: { type: 'station-id' | 'hourly' | 'link' }
// ---------------------------------------------------------------------------
const SEGMENTS = {
  'station-id': runStationId,
  hourly: runHourlyCheck,
  link: runLink,
};

router.post('/dj/segment', requireAdmin, async (req, res) => {
  const type = req.body?.type;
  const run = SEGMENTS[type];
  if (!run) {
    return res.status(400).json({ error: `type must be one of: ${Object.keys(SEGMENTS).join(', ')}` });
  }
  try {
    const spoken = await run();
    res.json({ ok: true, type, spoken });
  } catch (err) {
    queue.log('error', `/dj/segment ${type} failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /dj/skill — run a named skill on demand (operator override)
// Body: { name }
// ---------------------------------------------------------------------------
router.post('/dj/skill', requireAdmin, async (req, res) => {
  const name = req.body?.name;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const spoken = await runSkill(name, await getFullContext());
    res.json({ ok: true, name, spoken });
  } catch (err) {
    queue.log('error', `/dj/skill ${name} failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /dj/refresh-playlist — rebuild the Liquidsoap fallback auto-playlist now
// ---------------------------------------------------------------------------
router.post('/dj/refresh-playlist', requireAdmin, async (req, res) => {
  try {
    await refreshAutoPlaylist();
    res.json({ ok: true });
  } catch (err) {
    queue.log('error', `/dj/refresh-playlist failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /dj/auto-link — toggle between-track DJ links (mirrors POST /auto-pick)
// Body: { on: true | false }
// ---------------------------------------------------------------------------
router.post('/dj/auto-link', requireAdmin, (req, res) => {
  if (typeof req.body?.on === 'boolean') queue.autoLink = req.body.on;
  queue.log('scheduler', `auto-link ${queue.autoLink ? 'enabled' : 'disabled'}`);
  res.json({ autoLink: queue.autoLink });
});
