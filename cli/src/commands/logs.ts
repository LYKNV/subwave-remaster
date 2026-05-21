// `subwave logs [service]` — tail docker compose logs for one or more
// services. Streams to the terminal; Ctrl-C breaks out.
//
// With no arg, prompts for a service (or "all"). With `all` (literal),
// tails every service. With a service name, tails just that one.

import { detectCompose, listDeclaredServices, type ComposeFile } from '../compose.ts';
import { composeLogs } from '../docker.ts';
import { exitIfCancelled, err, info, muted, p, pauseForEnter, header } from '../ui.ts';

export interface LogsOpts {
  service?: string;
}

export async function runLogsCommand(opts: LogsOpts = {}): Promise<void> {
  const current = detectCompose();
  if (current.env === 'down' || !current.file) {
    header('Stack down');
    info('nothing to tail. `subwave start` first.');
    await pauseForEnter();
    return;
  }

  const services = await resolveServices(current.file, opts.service);
  if (!services) return;

  header(services.length === 0 ? 'Tailing all services' : `Tailing ${services.join(', ')}`);
  muted('Ctrl-C to stop.');
  console.log();

  await composeLogs(current.file, services);
}

async function resolveServices(file: ComposeFile, arg?: string): Promise<string[] | null> {
  const declared = listDeclaredServices(file);

  if (arg) {
    if (arg === 'all') return [];
    if (!declared.includes(arg)) {
      err(`unknown service: ${arg}. known: ${declared.join(', ')}`);
      return null;
    }
    return [arg];
  }

  const choice = exitIfCancelled(await p.select<string>({
    message: 'Which logs?',
    options: [
      { value: '__all__', label: 'all services', hint: 'tail everything' },
      ...declared.map((s) => ({ value: s, label: s })),
    ],
  }));
  return choice === '__all__' ? [] : [choice];
}
