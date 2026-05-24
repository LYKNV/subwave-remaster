// Thin wrappers around `docker compose <verb>` for the live env.
// Each function knows enough about the chosen compose file to invoke
// docker correctly; commands above this layer don't need to construct
// shell args themselves.

import { spawn, spawnSync } from 'node:child_process';
import type { ComposeFile } from './compose.ts';
import { getSubwaveHome } from './util.ts';

function args(file: ComposeFile, rest: string[]): string[] {
  return ['compose', '-f', file.file, ...rest];
}

// Run `docker compose up -d [--build] [--pull always]` and stream output to
// the user's terminal. Resolves with the docker exit code.
export function composeUp(
  file: ComposeFile,
  opts: { build?: boolean; pull?: 'always' | 'missing' } = {},
): Promise<number> {
  const a = ['up', '-d'];
  if (opts.build) a.push('--build');
  if (opts.pull) a.push('--pull', opts.pull);
  return run(file, a);
}

// `docker compose pull` for refreshing images without bringing the stack
// up. Use before composeUp() when the local cache may have a stale image
// tagged the same name (e.g. a previously-built local image masking the
// upstream GHCR release).
export function composePull(file: ComposeFile): Promise<number> {
  return run(file, ['pull']);
}

export function composeDown(file: ComposeFile): Promise<number> {
  // Deliberately never `-v` — that would wipe the bind-mounted state dir
  // and all of the operator's settings, archives, jingles. Confirm in the
  // command layer if the operator ever needs that.
  return run(file, ['down']);
}

export function composeRestart(file: ComposeFile, service: string): Promise<number> {
  return run(file, ['restart', service]);
}

export function composeUpBuild(file: ComposeFile, service: string): Promise<number> {
  return run(file, ['up', '-d', '--build', service]);
}

// Tail logs for one or more services. Inherits stdio so the operator's
// Ctrl-C breaks out cleanly. Pass an empty array for "all services".
export function composeLogs(file: ComposeFile, services: string[], tail = 200): Promise<number> {
  const a = ['logs', '-f', `--tail=${tail}`, ...services];
  return run(file, a);
}

// Fire-and-forget runner that streams stdio to the operator.
function run(file: ComposeFile, rest: string[]): Promise<number> {
  return new Promise((resolveP) => {
    const child = spawn('docker', args(file, rest), {
      cwd: getSubwaveHome(),
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolveP(code ?? 1));
  });
}

// Check whether `docker info` succeeds. Used by doctor as the first probe;
// if this fails, every downstream check is meaningless.
export function dockerDaemonOk(): boolean {
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return r.status === 0;
}

// `docker compose exec -T <svc> <cmd...>`. Used for in-container probes
// (e.g. telnet to liquidsoap from the controller container). Not used in
// the v1 doctor but kept here so we don't have to retrofit the abstraction.
export function composeExec(
  file: ComposeFile,
  service: string,
  cmd: string[],
  timeoutMs = 5000,
): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('docker', args(file, ['exec', '-T', service, ...cmd]), {
    cwd: getSubwaveHome(),
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  return {
    ok: r.status === 0,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}
