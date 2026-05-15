// Controller HTTP API — thin entry point.
// Wires middleware, mounts the route modules (see routes/), and starts the
// background services. The Next.js web UI hits this for: now-playing, queue
// state, request submission, and the admin surface.
import express from 'express';
import { config } from './config.js';
import * as settings from './settings.js';
import * as jingles from './broadcast/jingles.js';
import { queue } from './broadcast/queue.js';
import { startScheduler } from './broadcast/scheduler.js';
import { cors } from './middleware/cors.js';
import { assertAdminConfigured } from './middleware/auth.js';
import { router as publicRoutes } from './routes/public.js';
import { router as requestRoutes } from './routes/request.js';
import { router as settingsRoutes } from './routes/settings.js';
import { router as jingleRoutes } from './routes/jingles.js';
import { router as debugRoutes } from './routes/debug.js';
import { router as djRoutes } from './routes/dj.js';

// Fail fast in production if the admin gate isn't configured.
assertAdminConfigured();

const app = express();
app.use(express.json());
app.use(cors);

// Routes. `requireAdmin` is applied per-route inside the admin modules.
app.use(publicRoutes);
app.use(requestRoutes);
app.use(settingsRoutes);
app.use(jingleRoutes);
app.use(debugRoutes);
app.use(djRoutes);

// (manual skip is not implemented in this build — Liquidsoap controls pacing)

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------
app.listen(config.server.port, async () => {
  console.log(`SUB/WAVE controller on :${config.server.port}`);

  // Layer persisted settings over the static config defaults
  try {
    await settings.load();
    const s = settings.get();
    config.weather.lat = s.weather.lat;
    config.weather.lng = s.weather.lng;
    config.weather.locationName = s.weather.locationName;
    await settings.ensureLiquidsoapSettingsFile();
    console.log(`[settings] loaded. jingleRatio=${s.jingleRatio} crossfadeDuration=${s.crossfadeDuration} location=${s.weather.locationName}`);
  } catch (err) {
    console.error('[settings] load failed:', err.message);
  }

  queue.startWatcher();
  startScheduler();
  jingles.ensureDefaultIdent().catch(err => console.error('[jingles] ident generation failed:', err.message));
});
