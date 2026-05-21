// Background tagger process tracking (single-flight). The tagger is a
// standalone script (music/tag-library.js) spawned as a child process; this
// module holds the live state shared between the routes that start it
// (/tag-library) and the ones that report on it (/settings).
import { spawn } from 'node:child_process';
import { queue } from './queue.js';

type TaggerState = {
  running: boolean;
  startedAt: string | null;
  pid: number | null;
  lastLog: string[];
};

export const tagger: TaggerState = { running: false, startedAt: null, pid: null, lastLog: [] };

// Spawn the tagger as a detached-from-our-event-loop child process. Caller is
// responsible for rejecting the request if `tagger.running` is already true.
export function startTagger(limit?: number) {
  const args = ['src/music/tag-library.ts'];
  if (Number.isFinite(limit) && (limit as number) > 0) args.push('--limit', String(limit));

  const child = spawn('npx', ['tsx', ...args], { cwd: '/app', detached: false });
  tagger.running = true;
  tagger.startedAt = new Date().toISOString();
  tagger.pid = child.pid ?? null;
  tagger.lastLog = [];

  const capture = (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter((l: string) => l.trim());
    tagger.lastLog.push(...lines);
    if (tagger.lastLog.length > 100) tagger.lastLog = tagger.lastLog.slice(-100);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('exit', (code) => {
    tagger.running = false;
    tagger.lastLog.push(`[exit ${code}]`);
    queue.log('scheduler', `tagger finished (exit ${code})`);
  });
  queue.log('scheduler', `tagger started${Number.isFinite(limit) ? ` (limit=${limit})` : ''}`);
}
