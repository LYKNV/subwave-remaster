// SUB/WAVE setup wizard — interactive TUI on top of scripts/setup.sh.
//
// Walks the operator through prerequisites, controller/.env values
// (Navidrome, Ollama), then runs the existing bash setup, brings up the
// dev docker stack, optionally renders jingles, and optionally hands off
// to `next dev` for the web UI.

import {
  intro, outro, text, password, confirm, select, spinner, note, cancel, isCancel,
} from '@clack/prompts';
import pc from 'picocolors';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROLLER_ENV = resolve(ROOT, 'controller', '.env');
const CONTROLLER_ENV_EXAMPLE = resolve(ROOT, 'controller', '.env.example');
const DOCKER_DIR = resolve(ROOT, 'docker');
const WEB_DIR = resolve(ROOT, 'web');

const PROMPT_KEYS = ['NAVIDROME_URL', 'NAVIDROME_USER', 'NAVIDROME_PASS', 'OLLAMA_URL', 'OLLAMA_MODEL'];
const DEFAULTS = {
  NAVIDROME_URL: 'http://localhost:4533',
  NAVIDROME_USER: '',
  NAVIDROME_PASS: '',
  OLLAMA_URL: 'http://localhost:11434',
  OLLAMA_MODEL: 'nemotron-3-super:cloud',
};

function bail(msg) {
  cancel(msg);
  process.exit(1);
}

function guard(value) {
  if (isCancel(value)) bail('Setup cancelled.');
  return value;
}

function which(bin) {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0;
}

function parseEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Write env values while preserving comments/layout from the existing file
// (or .env.example as a fallback template). Keys not in the template are
// appended at the end.
function writeEnv(path, values) {
  const templateSource = existsSync(path) ? path : CONTROLLER_ENV_EXAMPLE;
  const lines = existsSync(templateSource) ? readFileSync(templateSource, 'utf8').split('\n') : [];
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (!m) return line;
    const key = m[1];
    if (!(key in values)) return line;
    seen.add(key);
    return `${key}=${values[key]}`;
  });
  for (const [k, v] of Object.entries(values)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  writeFileSync(path, out.join('\n'));
}

function portInUse(port) {
  return new Promise((res) => {
    const sock = createConnection({ port, host: '127.0.0.1' });
    sock.once('connect', () => { sock.destroy(); res(true); });
    sock.once('error', () => res(false));
  });
}

async function waitForHealth(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch('http://localhost:4000/health', { signal: AbortSignal.timeout(1000) });
      if (r.ok) {
        const body = await r.json();
        if (body.status === 'on-air') return true;
      }
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  return false;
}

function runStream(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  return r.status === 0;
}

function runCapture(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, ...opts });
}

async function preflight() {
  const checks = [
    { name: 'node >= 20', ok: Number(process.versions.node.split('.')[0]) >= 20 },
    { name: 'docker on PATH', ok: which('docker') },
    { name: 'docker daemon running', ok: runCapture('docker', ['info']).status === 0 },
    { name: 'ffmpeg on PATH (for emergency.mp3 / bed.mp3)', ok: which('ffmpeg') },
  ];
  const body = checks.map((c) => `  ${c.ok ? pc.green('✓') : pc.red('✗')} ${c.name}`).join('\n');
  note(body, 'Prerequisites');
  const fatal = checks.find((c) => !c.ok && c.name !== 'ffmpeg on PATH (for emergency.mp3 / bed.mp3)');
  if (fatal) bail(`Missing prerequisite: ${fatal.name}`);
  if (!checks.find((c) => c.name.startsWith('ffmpeg')).ok) {
    note('ffmpeg not found — emergency.mp3 and bed.mp3 will be skipped. Install it for full fidelity.', 'Warning');
  }
}

async function gatherEnv() {
  const existing = parseEnv(CONTROLLER_ENV);
  const hasExisting = Object.keys(existing).length > 0;

  let reuse = false;
  if (hasExisting) {
    const choice = guard(await select({
      message: 'Found existing controller/.env',
      options: [
        { value: 'keep', label: 'Keep existing values (skip prompts)' },
        { value: 'edit', label: 'Reconfigure (current values shown as defaults)' },
      ],
    }));
    reuse = choice === 'keep';
  }

  if (reuse) return existing;

  const merged = { ...DEFAULTS, ...existing };
  const answers = {};

  answers.NAVIDROME_URL = guard(await text({
    message: 'Navidrome (Subsonic) URL',
    placeholder: merged.NAVIDROME_URL,
    initialValue: merged.NAVIDROME_URL,
    validate: (v) => v && !/^https?:\/\//.test(v) ? 'must start with http(s)://' : undefined,
  }));

  answers.NAVIDROME_USER = guard(await text({
    message: 'Navidrome user',
    placeholder: merged.NAVIDROME_USER || 'admin',
    initialValue: merged.NAVIDROME_USER,
    validate: (v) => !v ? 'required' : undefined,
  }));

  answers.NAVIDROME_PASS = guard(await password({
    message: `Navidrome password${merged.NAVIDROME_PASS ? ' (enter to keep existing)' : ''}`,
    mask: '*',
  })) || merged.NAVIDROME_PASS;

  answers.OLLAMA_URL = guard(await text({
    message: 'Ollama URL',
    placeholder: merged.OLLAMA_URL,
    initialValue: merged.OLLAMA_URL,
  }));

  answers.OLLAMA_MODEL = guard(await text({
    message: 'Ollama model',
    placeholder: merged.OLLAMA_MODEL,
    initialValue: merged.OLLAMA_MODEL,
  }));

  return { ...merged, ...answers };
}

export async function main() {
  console.clear();
  intro(pc.bold(pc.cyan('SUB/WAVE')) + pc.dim(' — dev setup wizard'));

  await preflight();

  const env = await gatherEnv();
  writeEnv(CONTROLLER_ENV, env);
  note(`Wrote ${pc.dim('controller/.env')} (${PROMPT_KEYS.length} keys)`, 'Config');

  // 1. Bash setup: docker/.env, icecast.xml, emergency.mp3, bed.mp3.
  const s = spinner();
  s.start('Rendering icecast.xml + studio audio (scripts/setup.sh)');
  const setupOk = runStream('bash', ['scripts/setup.sh'], { stdio: ['ignore', 'pipe', 'pipe'] });
  s.stop(setupOk ? 'Base config rendered' : pc.red('scripts/setup.sh failed'));
  if (!setupOk) bail('Check scripts/setup.sh output and rerun.');

  // 2. Docker stack.
  s.start('Starting docker stack (icecast + liquidsoap + controller)');
  const dockerOk = runCapture('docker', ['compose', 'up', '-d'], { cwd: DOCKER_DIR }).status === 0;
  s.stop(dockerOk ? 'Docker stack up' : pc.red('docker compose up failed'));
  if (!dockerOk) bail('Check `docker compose -f docker/docker-compose.yml logs` for details.');

  // 3. Web deps.
  if (!existsSync(resolve(WEB_DIR, 'node_modules'))) {
    s.start('Installing web dependencies (npm install in web/)');
    const ok = runCapture('npm', ['install'], { cwd: WEB_DIR }).status === 0;
    s.stop(ok ? 'Web deps installed' : pc.red('npm install failed'));
    if (!ok) bail('Run `npm install --prefix web` manually and try again.');
  }

  // 4. Wait for controller to report on-air (Liquidsoap connects to Icecast).
  s.start('Waiting for controller to report on-air');
  const healthy = await waitForHealth();
  s.stop(healthy ? 'Controller on-air' : pc.yellow('Controller not on-air after 30s — continuing anyway'));

  // 5. Jingles.
  const wantsJingles = guard(await confirm({
    message: 'Generate station jingles now (Piper TTS, ~30s)?',
    initialValue: false,
  }));
  if (wantsJingles) {
    s.start('Rendering jingles via controller container');
    const j = runCapture('bash', ['scripts/generate-jingles.sh'], {
      env: { ...process.env, COMPOSE_FILE: 'docker/docker-compose.yml' },
    });
    s.stop(j.status === 0 ? 'Jingles rendered' : pc.red('Jingle generation failed'));
    if (j.status !== 0) console.error(j.stderr || j.stdout);
  }

  // 6. Final summary + optional web dev launch.
  note(
    [
      `${pc.dim('Web:       ')} http://localhost:3000`,
      `${pc.dim('Stream:    ')} http://localhost:8000/stream.mp3`,
      `${pc.dim('Now playing')} http://localhost:4000/now-playing`,
      `${pc.dim('Health:    ')} http://localhost:4000/health`,
    ].join('\n'),
    'Endpoints',
  );

  const webBusy = await portInUse(3000);
  let startWeb = false;
  if (webBusy) {
    note('Port 3000 already has a listener — skipping web dev launch.', 'Web');
  } else {
    startWeb = guard(await confirm({
      message: 'Start web dev server on :3000 now (foreground, Ctrl-C to stop)?',
      initialValue: true,
    }));
  }

  outro(pc.green('Setup complete.'));

  if (startWeb) {
    const child = spawn('npm', ['run', 'dev'], { cwd: WEB_DIR, stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
  } else {
    console.log(pc.dim('\nNext: `npm run dev:web` to start the UI, `npm run logs` to tail docker.'));
  }
}
