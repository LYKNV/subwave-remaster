// `subwave status` — quick render: compose env, services, now-playing,
// recent DJ events. Much lighter than `doctor`; designed to be glance-able.

import { detectCompose } from '../compose.ts';
import { makeClient, type NowPlayingPayload, type StatePayload } from '../api.ts';
import { formatRelative, truncate } from '../util.ts';
import { ok, warn, err, info, muted, header, pc, pauseForEnter } from '../ui.ts';

export async function runStatusCommand(): Promise<void> {
  const compose = detectCompose();

  header('Stack');
  if (compose.env === 'down') {
    err('stack down');
    muted('→ run `subwave start dev` or `subwave start prod`');
    await pauseForEnter();
    return;
  }
  ok(`env: ${pc.bold(compose.env)} — ${pc.dim(compose.file?.file ?? '')}`);
  for (const [svc, state] of Object.entries(compose.services)) {
    if (state === 'running') ok(`${svc} — ${pc.dim(state)}`);
    else if (state === 'restarting') warn(`${svc} — ${pc.dim(state)}`);
    else err(`${svc} — ${pc.dim(state)}`);
  }

  const client = makeClient(compose.env);

  header('On air');
  const np = await client.get<NowPlayingPayload>('/now-playing', { timeoutMs: 3000 });
  if (!np.ok || !np.body) {
    err(`controller unreachable — ${np.error ?? 'no response'}`);
  } else {
    const b = np.body;
    const track = b.nowPlaying;
    if (track?.title) {
      ok(`track: ${pc.bold(track.title)} — ${pc.dim(track.artist ?? 'unknown')}`);
      if (track.album) muted(`album: ${track.album}`);
      // controller emits `timestamp` in unix seconds; convert to ms for formatRelative.
      if (track.timestamp) muted(`started ${formatRelative(track.timestamp * 1000)}`);
    } else {
      warn('no track metadata yet');
    }
    if (b.dj?.name) info(`dj: ${b.dj.name}${b.dj.tagline ? pc.dim(' — ' + b.dj.tagline) : ''}`);
    if (b.context?.dominantMood) info(`mood: ${b.context.dominantMood}`);
    if (b.context?.weather) {
      const w = b.context.weather;
      info(`weather: ${w.condition ?? '?'} ${w.temp ?? '?'}°C @ ${w.location ?? '?'}`);
    }
    const listeners = b.listeners?.current ?? 0;
    if (b.streamOnline) {
      ok(`stream: online · ${listeners} listener${listeners === 1 ? '' : 's'}`);
    } else if (b.streamOnline === false) {
      warn('stream: offline');
    }
    if (b.session?.id) {
      info(`session: ${b.session.id}${b.session.kind ? pc.dim(' (' + b.session.kind + ')') : ''}`);
    }
  }

  header('Recent DJ events');
  const state = await client.get<StatePayload>('/state', { timeoutMs: 3000 });
  if (!state.ok || !state.body) {
    muted(`(state unavailable — ${state.error ?? 'no response'})`);
  } else {
    const events = (state.body.djLog ?? []).slice(-5).reverse();
    if (events.length === 0) {
      muted('(none yet)');
    } else {
      for (const e of events) {
        const when = e.t ? formatRelative(e.t) : '?';
        const text = truncate(e.message ?? '', 80);
        muted(`${when.padStart(8)} · ${pc.cyan(e.kind ?? '?')} · ${text}`);
      }
    }
  }

  await pauseForEnter();
}
