// `subwave setup` — the install wizard.
//
// Walks the operator through prerequisites, credentials, and first boot.
// Replaces the legacy scripts/setup.mjs (deleted alongside this file).
// Tight scope by design: only the env keys the controller actually reads,
// and only the choices that have to be made at install time. Everything
// else (personas, shows, schedule, TTS choices, weather location, …) is
// left to the admin Settings UI.
//
// Flow:
//   1. Mode (dev / prod)
//   2. Preflight (node, docker, docker daemon)
//   3. STATE_DIR (prod only)
//   4. Navidrome (URL/user/pass) + reachability probe
//   5. LLM choice + API key + probe
//   6. Admin credentials (REQUIRED in prod)
//   7. Timezone
//   8. Write controller/.env (template-aware)
//   9. Shell to scripts/setup.sh — icecast passwords, icecast.xml, sounds
//  10. Append TZ to docker/.env
//  11. docker compose up -d
//  12. waitForHealth
//  13. POST /settings to apply the LLM choice (so the operator's first DJ
//      action uses the right provider, no admin-UI detour)
//  14. Optionally render jingles
//  15. Endpoints summary
//
// Probes (cli/src/probes.ts) are warn-not-fail — the operator can keep
// going if the network isn't ready yet.

import crypto from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  CONTROLLER_ENV,
  CONTROLLER_ENV_EXAMPLE,
  DOCKER_DIR,
  REPO_ROOT,
  parseEnvFile,
  writeEnvFile,
  have,
} from '../util.ts';
import { COMPOSE_FILES, type ComposeEnv } from '../compose.ts';
import { dockerDaemonOk, composeUp } from '../docker.ts';
import { makeClient, waitForHealth } from '../api.ts';
import {
  probeSubsonic,
  probeOllama,
  probeOpenAI,
  probeAnthropic,
  probeOpenRouter,
  type ProbeResult,
} from '../probes.ts';
import { p, pc, exitIfCancelled, banner, header, ok, warn, err, muted } from '../ui.ts';

type Mode = 'dev' | 'prod';

interface LlmChoice {
  provider: 'ollama' | 'openai' | 'anthropic' | 'openrouter' | null; // null = "configure later"
  // Ollama-only:
  ollamaUrl?: string;
  ollamaModel?: string;
  // Cloud only — the API key goes into controller/.env as <PROVIDER>_API_KEY;
  // the AI SDK picks it up automatically when settings.llm.apiKey is empty.
  apiKey?: string;
}

export async function runSetupCommand(): Promise<void> {
  banner('install wizard');

  // --- 1. Mode -------------------------------------------------------------
  const mode = await pickMode();

  // --- 2. Preflight --------------------------------------------------------
  await preflight();

  // --- 3. STATE_DIR (prod only) -------------------------------------------
  let stateDir = resolve(REPO_ROOT, 'state');
  if (mode === 'prod') {
    stateDir = await promptStateDir();
  }

  // --- 4. Navidrome --------------------------------------------------------
  const navidrome = await collectNavidrome();

  // --- 5. LLM --------------------------------------------------------------
  const llm = await collectLlm();

  // --- 6. Admin creds ------------------------------------------------------
  const admin = await collectAdmin(mode);

  // --- 7. Timezone ---------------------------------------------------------
  const tz = await promptTimezone();

  // --- 8. Write controller/.env -------------------------------------------
  header('Writing controller/.env');
  const envValues: Record<string, string> = {
    NAVIDROME_URL: navidrome.url,
    NAVIDROME_USER: navidrome.user,
    NAVIDROME_PASS: navidrome.pass,
    ADMIN_USER: admin.user,
    ADMIN_PASS: admin.pass,
  };
  if (llm.provider === 'openai' && llm.apiKey) envValues.OPENAI_API_KEY = llm.apiKey;
  if (llm.provider === 'anthropic' && llm.apiKey) envValues.ANTHROPIC_API_KEY = llm.apiKey;
  if (llm.provider === 'openrouter' && llm.apiKey) envValues.OPENROUTER_API_KEY = llm.apiKey;
  writeEnvFile(CONTROLLER_ENV, envValues, { templateFallback: CONTROLLER_ENV_EXAMPLE });
  ok(`wrote ${pc.dim('controller/.env')} (${Object.keys(envValues).length} keys)`);

  // --- 9. Bash bootstrap (icecast passwords + icecast.xml + sounds) -------
  const bashEnv = mode === 'prod'
    ? { ...process.env, STATE_DIR: stateDir }
    : { ...process.env };
  await runBashSetup(bashEnv);

  // --- 10. TZ to docker/.env ----------------------------------------------
  // docker compose reads docker/.env for ${TZ} expansion in the compose
  // files. Write it alongside the icecast passwords that setup.sh just
  // generated.
  const dockerEnvPath = resolve(DOCKER_DIR, '.env');
  if (existsSync(dockerEnvPath)) {
    writeEnvFile(dockerEnvPath, { TZ: tz });
    muted(`set TZ=${tz} in docker/.env`);
  }

  // --- 11. Bring the stack up ---------------------------------------------
  const composeEnv: ComposeEnv = mode;
  const file = COMPOSE_FILES.find((f) => f.env === mode);
  if (!file) {
    err(`unknown mode: ${mode}`);
    return;
  }
  header(`Starting ${mode} stack`);
  muted(`docker compose -f ${file.file} up -d${mode === 'prod' ? ' --build' : ''}`);
  console.log();
  const upCode = await composeUp(file, { build: mode === 'prod' });
  if (upCode !== 0) {
    err(`docker compose exited ${upCode}`);
    muted('→ inspect: `subwave logs <service>`. Resolve and re-run setup.');
    return;
  }

  // --- 12. Wait for /health -----------------------------------------------
  const sp = p.spinner();
  sp.start('Waiting for controller to report on-air…');
  const healthy = await waitForHealth(composeEnv, 30_000, (ms) => {
    sp.message(`Waiting… ${Math.floor(ms / 1000)}s`);
  });
  sp.stop(healthy ? 'Controller on-air' : pc.yellow('Not on-air after 30s — continuing'));
  if (!healthy) {
    warn('Controller did not report on-air within 30s. The stack may still be coming up — check `subwave logs controller`.');
  }

  // --- 13. POST /settings to apply LLM choice ----------------------------
  if (llm.provider) {
    await applyLlmSetting(composeEnv, llm);
  }

  // --- 14. Optionally render jingles --------------------------------------
  const wantsJingles = exitIfCancelled(await p.confirm({
    message: 'Generate station jingles now? (Piper TTS, ~30 s)',
    initialValue: false,
  }), { backOnCancel: false });
  if (wantsJingles) {
    await renderJingles(file.file, bashEnv);
  }

  // --- 15. Summary --------------------------------------------------------
  header('Endpoints');
  if (mode === 'prod') {
    muted(`Site:    ${pc.cyan('http://localhost:4800')}`);
    muted(`Stream:  ${pc.cyan('http://localhost:4800/stream.mp3')}`);
    muted(`API:     ${pc.cyan('http://localhost:4800/api/health')}`);
  } else {
    muted(`Controller:  ${pc.cyan('http://localhost:7701')}`);
    muted(`Stream:      ${pc.cyan('http://localhost:7702/stream.mp3')}`);
    muted(`Web (dev):   ${pc.cyan('http://localhost:7700')}  (separate: `+ pc.dim('`npm --prefix web run dev`') + ')');
  }

  console.log();
  ok('Setup complete. Try `subwave status` or `subwave doctor`.');
}

// ---------------------------------------------------------------------------
// Step implementations
// ---------------------------------------------------------------------------

async function pickMode(): Promise<Mode> {
  // If controller/.env already exists, the operator is re-running setup.
  // Suggest the mode they probably want, but don't lock them in.
  const existing = parseEnvFile(CONTROLLER_ENV);
  const hasExisting = Object.keys(existing).length > 0;
  if (hasExisting) {
    muted(`Existing controller/.env detected (${Object.keys(existing).length} keys). You can keep the values or reconfigure as you go.`);
  }
  return exitIfCancelled(await p.select({
    message: 'How are you running SUB/WAVE?',
    options: [
      {
        value: 'dev' as const,
        label: 'dev — local hacking',
        hint: 'docker-compose.yml · controller :7701 · web on :7700 separately',
      },
      {
        value: 'prod' as const,
        label: 'prod — server deploy',
        hint: 'docker-compose.prod.yml · Caddy :4800 · web baked into image',
      },
    ],
  }), { backOnCancel: false });
}

async function preflight(): Promise<void> {
  header('Preflight');
  const checks: Array<{ name: string; ok: boolean; fix?: string }> = [
    {
      name: `node ${process.versions.node}`,
      ok: Number(process.versions.node.split('.')[0]) >= 20,
      fix: 'install Node 20 or newer (https://nodejs.org)',
    },
    {
      name: 'docker on PATH',
      ok: have('docker'),
      fix: 'install Docker (https://docs.docker.com/get-docker/)',
    },
    {
      name: 'docker daemon reachable',
      ok: dockerDaemonOk(),
      fix: 'start Docker Desktop / dockerd',
    },
  ];
  for (const c of checks) {
    if (c.ok) ok(c.name);
    else err(`${c.name} — ${c.fix ?? 'unavailable'}`);
  }
  if (checks.some((c) => !c.ok)) {
    console.log();
    err('Resolve the failed prerequisites and re-run `subwave setup`.');
    process.exit(1);
  }
}

async function promptStateDir(): Promise<string> {
  const defaultDir = resolve(REPO_ROOT, 'state');
  const chosen = exitIfCancelled(await p.text({
    message: 'STATE_DIR (shared volume for icecast + liquidsoap + controller)',
    initialValue: defaultDir,
    placeholder: defaultDir,
  }), { backOnCancel: false });
  if (!canWrite(chosen)) {
    err(`${chosen} is not writable by this user.`);
    muted('Re-run setup with sufficient permissions (e.g. as the owner of that directory),');
    muted('or pick a path your user can write to.');
    process.exit(1);
  }
  return chosen;
}

interface NavidromeCreds { url: string; user: string; pass: string; }

async function collectNavidrome(): Promise<NavidromeCreds> {
  const existing = parseEnvFile(CONTROLLER_ENV);
  let url = existing.NAVIDROME_URL ?? 'http://localhost:4533';
  let user = existing.NAVIDROME_USER ?? '';
  let pass = existing.NAVIDROME_PASS ?? '';

  while (true) {
    header('Navidrome (Subsonic API)');
    url = exitIfCancelled(await p.text({
      message: 'Navidrome URL',
      initialValue: url,
      placeholder: 'http://localhost:4533',
      validate: (v: string) => (v && !/^https?:\/\//.test(v) ? 'must start with http(s)://' : undefined),
    }), { backOnCancel: false });
    user = exitIfCancelled(await p.text({
      message: 'Navidrome user',
      initialValue: user,
      placeholder: 'admin',
      validate: (v: string) => (!v ? 'required' : undefined),
    }), { backOnCancel: false });
    pass = exitIfCancelled(await p.password({
      message: pass ? 'Navidrome password (enter to keep existing)' : 'Navidrome password',
      mask: '*',
    }), { backOnCancel: false }) || pass;

    const sp = p.spinner();
    sp.start('Probing Navidrome…');
    const result = await probeSubsonic({ url, user, pass });
    if (result.ok) {
      sp.stop('Navidrome auth ok');
      break;
    }
    sp.stop(pc.yellow('Navidrome probe failed'));
    warn(result.reason ?? 'unknown error');
    const next = exitIfCancelled(await p.select<'retry' | 'continue' | 'abort'>({
      message: 'What now?',
      initialValue: 'retry',
      options: [
        { value: 'retry', label: 'retry credentials' },
        { value: 'continue', label: 'continue anyway', hint: 'I will fix it later' },
        { value: 'abort', label: 'abort setup' },
      ],
    }), { backOnCancel: false });
    if (next === 'continue') break;
    if (next === 'abort') process.exit(1);
    // retry: loop
  }
  return { url, user, pass };
}

async function collectLlm(): Promise<LlmChoice> {
  header('LLM provider');
  const choice = exitIfCancelled(await p.select<'ollama' | 'openai' | 'anthropic' | 'openrouter' | 'later'>({
    message: 'Which LLM should the AI DJ talk to?',
    initialValue: 'ollama',
    options: [
      { value: 'ollama',     label: 'Ollama (local)', hint: 'no API key — point at your homelab' },
      { value: 'openai',     label: 'OpenAI',         hint: 'gpt-4o-mini etc. — needs OPENAI_API_KEY' },
      { value: 'anthropic',  label: 'Anthropic',      hint: 'Claude — needs ANTHROPIC_API_KEY' },
      { value: 'openrouter', label: 'OpenRouter',     hint: 'mix of providers — needs OPENROUTER_API_KEY' },
      { value: 'later',      label: 'Other / configure later', hint: 'set it up in the admin UI' },
    ],
  }), { backOnCancel: false });

  if (choice === 'later') return { provider: null };

  if (choice === 'ollama') {
    const url = exitIfCancelled(await p.text({
      message: 'Ollama server URL',
      initialValue: 'http://localhost:11434',
      placeholder: 'http://localhost:11434',
      validate: (v: string) => (!/^https?:\/\//.test(v) ? 'must start with http(s)://' : undefined),
    }), { backOnCancel: false });
    const model = exitIfCancelled(await p.text({
      message: 'Ollama model (must be pulled on the server)',
      placeholder: 'qwen3:8b',
      validate: (v: string) => (!v ? 'required' : undefined),
    }), { backOnCancel: false });
    await reportProbe('Ollama', () => probeOllama({ url, model }));
    return { provider: 'ollama', ollamaUrl: url, ollamaModel: model };
  }

  // Cloud branch (openai / anthropic / openrouter)
  const apiKey = exitIfCancelled(await p.password({
    message: `${labelForProvider(choice)} API key`,
    mask: '*',
  }), { backOnCancel: false });
  if (!apiKey) {
    warn('No key provided — saving the provider choice but you will need to add the key later.');
    return { provider: choice, apiKey: '' };
  }
  await reportProbe(labelForProvider(choice), () => {
    if (choice === 'openai') return probeOpenAI({ apiKey });
    if (choice === 'anthropic') return probeAnthropic({ apiKey });
    return probeOpenRouter({ apiKey });
  });
  return { provider: choice, apiKey };
}

function labelForProvider(p: 'openai' | 'anthropic' | 'openrouter'): string {
  return p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic' : 'OpenRouter';
}

interface AdminCreds { user: string; pass: string; }

async function collectAdmin(mode: Mode): Promise<AdminCreds> {
  header('Admin credentials');
  if (mode === 'prod') {
    muted('REQUIRED in prod — the controller exits at boot without these.');
  } else {
    muted('Recommended even in dev (gates /settings, /debug, /jingles, /restart-mixer).');
  }
  const existing = parseEnvFile(CONTROLLER_ENV);
  const user = exitIfCancelled(await p.text({
    message: 'Admin user',
    initialValue: existing.ADMIN_USER || 'subwave',
    validate: (v: string) => (!v ? 'required' : undefined),
  }), { backOnCancel: false });
  const generated = crypto.randomBytes(16).toString('hex');
  const pass = exitIfCancelled(await p.password({
    message: existing.ADMIN_PASS && existing.ADMIN_PASS !== 'changeme'
      ? 'Admin password (enter to keep existing)'
      : `Admin password (enter to use generated: ${pc.dim(generated)})`,
    mask: '*',
  }), { backOnCancel: false }) ||
    (existing.ADMIN_PASS && existing.ADMIN_PASS !== 'changeme'
      ? existing.ADMIN_PASS
      : generated);
  return { user, pass };
}

async function promptTimezone(): Promise<string> {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return exitIfCancelled(await p.text({
    message: 'Timezone (IANA id)',
    initialValue: detected,
    placeholder: 'Europe/London',
  }), { backOnCancel: false });
}

// ---------------------------------------------------------------------------
// Shell-outs
// ---------------------------------------------------------------------------

async function runBashSetup(env: NodeJS.ProcessEnv): Promise<void> {
  header('Rendering icecast.xml + studio audio (scripts/setup.sh)');
  await new Promise<void>((resolveP, reject) => {
    const child = spawn('bash', ['scripts/setup.sh'], {
      cwd: REPO_ROOT,
      env,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolveP();
      else reject(new Error(`scripts/setup.sh exited ${code}`));
    });
  }).catch((e) => {
    err(e.message);
    muted('Resolve and re-run setup.');
    process.exit(1);
  });
}

async function renderJingles(composeFile: string, env: NodeJS.ProcessEnv): Promise<void> {
  header('Rendering jingles');
  await new Promise<void>((resolveP) => {
    const child = spawn('bash', ['scripts/generate-jingles.sh'], {
      cwd: REPO_ROOT,
      env: { ...env, COMPOSE_FILE: composeFile },
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) ok('jingles rendered.');
      else warn(`jingle script exited ${code} — you can re-run it later via \`scripts/generate-jingles.sh\``);
      resolveP();
    });
  });
}

// ---------------------------------------------------------------------------
// Post-boot settings application
// ---------------------------------------------------------------------------

// Apply the LLM choice via POST /settings so the operator's first DJ action
// uses the right provider — no admin-UI detour needed. settings.js defaults
// llm.provider to 'ollama', so the cloud branches must explicitly switch it.
async function applyLlmSetting(env: ComposeEnv, llm: LlmChoice): Promise<void> {
  if (!llm.provider) return;
  header('Applying LLM choice to the controller');

  const client = makeClient(env);
  const body: { llm: Record<string, unknown> } = { llm: { provider: llm.provider } };
  if (llm.provider === 'ollama') {
    if (llm.ollamaUrl) body.llm.ollamaUrl = llm.ollamaUrl;
    if (llm.ollamaModel) body.llm.model = llm.ollamaModel;
  }
  // For cloud providers we deliberately leave llm.apiKey empty — the AI SDK
  // reads <PROVIDER>_API_KEY from env automatically. Storing the key in
  // settings.json on top of the env var would be redundant + leak-prone.

  const res = await client.post('/settings', body, { admin: true, timeoutMs: 5000 });
  if (res.ok) {
    ok(`/settings updated — llm.provider=${llm.provider}`);
  } else {
    warn(`failed to POST /settings: ${res.error ?? 'unknown'}`);
    muted('You can set the provider manually via the admin UI later.');
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function canWrite(path: string): boolean {
  try {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function reportProbe(label: string, run: () => Promise<ProbeResult>): Promise<void> {
  const sp = p.spinner();
  sp.start(`Probing ${label}…`);
  const r = await run();
  if (r.ok) {
    sp.stop(`${label} ok${r.detail ? ` — ${r.detail}` : ''}`);
  } else {
    sp.stop(pc.yellow(`${label} probe failed`));
    warn(r.reason ?? 'unknown error');
    const next = exitIfCancelled(await p.confirm({
      message: 'Continue anyway?',
      initialValue: true,
    }), { backOnCancel: false });
    if (!next) {
      muted('Resolve the issue and re-run `subwave setup`.');
      process.exit(1);
    }
  }
}

