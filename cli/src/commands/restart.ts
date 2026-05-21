// `subwave restart [service]` — encodes the rebuild-vs-restart split from
// CLAUDE.md:
//   - controller: COPY at build time, so `restart` reruns the same code.
//     Always rebuild + recreate.
//   - liquidsoap: radio.liq is bind-mounted; plain restart picks up edits.
//     (Dockerfile changes need `--build`; for that case the operator should
//     use `subwave restart liquidsoap --build`, surfaced via a confirm.)
//   - icecast / web / caddy / others: plain restart is what you want.
//
// When invoked with no arg, presents a select with the per-service hint
// so the operator doesn't have to remember which is which.

import { detectCompose, listDeclaredServices, type ComposeFile } from '../compose.ts';
import { composeRestart, composeUpBuild } from '../docker.ts';
import { exitIfCancelled, ok, err, info, muted, p, pc, pauseForEnter, header } from '../ui.ts';

interface ServicePolicy {
  rebuild: boolean;
  hint: string;
}

// Per-service rebuild policy. Anything not in this map gets a plain restart.
const POLICY: Record<string, ServicePolicy> = {
  controller: { rebuild: true,  hint: 'rebuild — source is COPY-d at build time' },
  liquidsoap: { rebuild: false, hint: 'restart — radio.liq is bind-mounted' },
  icecast:    { rebuild: false, hint: 'restart' },
  web:        { rebuild: false, hint: 'restart (rebuild needed only after Dockerfile / build edits)' },
  caddy:      { rebuild: false, hint: 'restart' },
};

export interface RestartOpts {
  service?: string;
  forceBuild?: boolean;
}

export async function runRestartCommand(opts: RestartOpts = {}): Promise<void> {
  const current = detectCompose();
  if (current.env === 'down' || !current.file) {
    header('Nothing to restart');
    info('stack is down — run `subwave start` first.');
    await pauseForEnter();
    return;
  }

  const service = opts.service ?? (await pickService(current.file));
  if (!service) return;

  const policy = POLICY[service] ?? { rebuild: false, hint: 'restart' };
  const rebuild = opts.forceBuild || policy.rebuild;

  header(`${rebuild ? 'Rebuilding' : 'Restarting'} ${service}`);
  muted(rebuild
    ? `docker compose -f ${current.file.file} up -d --build ${service}`
    : `docker compose -f ${current.file.file} restart ${service}`);
  console.log();

  const code = rebuild
    ? await composeUpBuild(current.file, service)
    : await composeRestart(current.file, service);

  if (code !== 0) {
    err(`docker compose exited ${code}`);
  } else {
    ok(`${service} ${rebuild ? 'rebuilt + recreated' : 'restarted'}.`);
  }
  await pauseForEnter();
}

async function pickService(file: ComposeFile): Promise<string | null> {
  const declared = listDeclaredServices(file);
  if (declared.length === 0) {
    err('could not list services from compose.');
    return null;
  }
  const options = declared.map((svc) => {
    const policy = POLICY[svc] ?? { rebuild: false, hint: 'restart' };
    return {
      value: svc,
      label: svc + (policy.rebuild ? pc.dim('  [rebuild]') : ''),
      hint: policy.hint,
    };
  });
  const chosen = exitIfCancelled(await p.select<string>({
    message: 'Which service?',
    options,
  }));
  return chosen;
}
