// `subwave setup` — the install wizard.
//
// Walks the operator through prerequisites, credentials, and first boot.
// In the single-compose world this is one of two converging install paths:
// the operator can also finish setup in the browser wizard at /setup. Both
// flows write to the same persistence layer:
//
//   .env                      — ADMIN_USER, ADMIN_PASS, SITE_URL, TZ, etc.
//   state/setup-config.json   — Navidrome creds + setupCompletedAt
//   state/secrets.env (0600)  — cloud LLM/TTS API keys
//   POST /settings            — LLM provider/model (live)
//
// Flow:
//   1. Mode (dev / prod / prod-byo)
//   2. Preflight (node, docker, docker daemon)
//   3. STATE_DIR (prod only)
//   4. Navidrome (URL/user/pass) + reachability probe
//   5. LLM choice + API key + probe
//   6. Admin credentials (REQUIRED in prod) + SITE_URL
//   7. Timezone
//   8. Write root .env (template-aware) + Navidrome → setup-config.json
//      + API keys → secrets.env (0600)
//   9. Shell to scripts/setup.sh — state dir perms, web/.env.local
//  10. docker compose up -d  (compose lives at repo root now)
//  11. waitForHealth
//  12. POST /settings to apply the LLM choice (so the operator's first DJ
//      action uses the right provider, no admin-UI detour)
//  13. Optionally render jingles
//  14. Dev only: optionally start `npm run dev` (web UI) in the background
//  15. Endpoints summary
//
// Probes (cli/src/probes.ts) are warn-not-fail — the operator can keep
// going if the network isn't ready yet.

import crypto from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  getLegacyControllerEnv,
  getSubwaveHome,
  getRootEnv,
  getRootEnvExample,
  parseEnvFile,
  readSetupConfig,
  writeEnvFile,
  writeSecretsEnv,
  writeSetupConfig,
  have,
} from '../util.ts';
import { getComposeFiles, isProdEnv, webBaseFor, streamUrlFor, apiBaseFor, type ComposeEnv } from '../compose.ts';
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
import { p, pc, accent, exitIfCancelled, banner, header, ok, warn, err, muted } from '../ui.ts';
import { maybeStartWebDev, type WebDevState } from '../web-dev.ts';

type Mode = 'dev' | 'prod' | 'prod-byo';

// LLM providers — kept in step with the controller's LLM_PROVIDERS list
// (controller/src/settings.ts) and the admin Settings UI provider picker.
type CloudProvider = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'openrouter' | 'gateway';
type LlmProvider = 'ollama' | 'openai-compatible' | CloudProvider;

// Cloud providers whose API key the AI SDK reads from a process.env var.
// openai-compatible is deliberately absent — it has no canonical env var, so
// its key (when a self-hosted server needs one) goes into settings instead.
const CLOUD_ENV_VAR: Record<CloudProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  gateway: 'AI_GATEWAY_API_KEY',
};

interface LlmChoice {
  provider: LlmProvider | null; // null = "configure later"
  // Ollama only:
  ollamaUrl?: string;
  ollamaModel?: string;
  // openai-compatible only — the self-hosted server URL (with /v1 suffix):
  baseUrl?: string;
  // Model id — openai-compatible + cloud. Optional: blank defers to the admin UI.
  model?: string;
  // API key. Cloud → written to state/secrets.env (mode 0600), sourced into
  // process.env on controller boot. openai-compatible → applied to
  // settings.llm.apiKey via POST /settings (no canonical env var).
  apiKey?: string;
}

export async function runSetupCommand(): Promise<void> {
  banner('install wizard');

  // --- 1. Mode -------------------------------------------------------------
  const mode = await pickMode();

  // --- 2. Preflight --------------------------------------------------------
  await preflight();

  // --- 3. STATE_DIR (prod-style modes only) -------------------------------
  let stateDir = resolve(getSubwaveHome(), 'state');
  if (isProdEnv(mode)) {
    stateDir = await promptStateDir();
  }

  // --- 4. Navidrome --------------------------------------------------------
  const navidrome = await collectNavidrome();

  // --- 5. LLM --------------------------------------------------------------
  const llm = await collectLlm();

  // --- 6. Admin creds + SITE_URL ------------------------------------------
  const admin = await collectAdmin(mode);
  // SITE_URL is purely cosmetic — only used for absolute share-card / OG /
  // sitemap URLs in the prod web image. In dev there's no public origin to
  // advertise and the dev compose doesn't reference it at all, so skip the
  // prompt entirely.
  const siteUrl = isProdEnv(mode) ? await promptSiteUrl(mode) : '';

  // --- 7. Timezone ---------------------------------------------------------
  const tz = await promptTimezone();

  // --- 8a. Write the root .env --------------------------------------------
  // Boot-time config: admin creds, public origin (prod only), timezone,
  // homepage mode. Wins over anything in state/setup-config.json or
  // state/secrets.env when both are set (env-first precedence is enforced
  // controller-side).
  header('Writing .env (repo root)');
  const envValues: Record<string, string> = {
    ADMIN_USER: admin.user,
    ADMIN_PASS: admin.pass,
    TZ: tz,
  };
  if (siteUrl) envValues.SITE_URL = siteUrl;
  // Preserve SUBWAVE_HOMEPAGE if already set; otherwise default to `player`.
  const existingRoot = parseEnvFile(getRootEnv());
  if (!existingRoot.SUBWAVE_HOMEPAGE) envValues.SUBWAVE_HOMEPAGE = 'player';
  writeEnvFile(getRootEnv(), envValues, { templateFallback: getRootEnvExample() });
  ok(`wrote ${pc.dim('.env')} (${Object.keys(envValues).length} keys)`);

  // --- 8b. Persist Navidrome creds to state/setup-config.json ------------
  // Same target the browser wizard writes to. The controller falls back to
  // this file when NAVIDROME_* env vars are blank; env still wins when set.
  writeSetupConfig({
    navidrome: { url: navidrome.url, user: navidrome.user, pass: navidrome.pass },
    setupCompletedAt: new Date().toISOString(),
  });
  ok(`wrote ${pc.dim('state/setup-config.json')} (Navidrome creds + setupCompletedAt)`);

  // --- 8c. Persist cloud API keys to state/secrets.env (mode 0600) -------
  // Sourced into process.env on controller boot. We never write secrets to
  // .env (world-readable) or settings.json — they live in their own 0600 file.
  if (llm.provider && llm.apiKey && llm.provider in CLOUD_ENV_VAR) {
    const k = CLOUD_ENV_VAR[llm.provider as CloudProvider];
    writeSecretsEnv({ [k]: llm.apiKey });
    ok(`wrote ${pc.dim('state/secrets.env')} (${k}, mode 0600)`);
  }

  // --- 9. Bash bootstrap (state dir perms, web/.env.local) ----------------
  // scripts/setup.sh is much smaller in the single-compose world; it just
  // ensures state/ has the right permissions and seeds web/.env.local for
  // native `npm run dev`. Icecast passwords are generated by the icecast
  // image on first boot; the renderer for icecast.xml is gone too.
  const bashEnv = isProdEnv(mode)
    ? { ...process.env, STATE_DIR: stateDir }
    : { ...process.env };
  await runBashSetup(bashEnv);

  // --- 10. (legacy step removed) docker/.env no longer exists in the
  // single-compose layout — TZ + SUBWAVE_HOMEPAGE went into the root .env
  // above and compose interpolates them straight from there.

  // --- 11. Bring the stack up ---------------------------------------------
  const composeEnv: ComposeEnv = mode;
  const file = getComposeFiles().find((f) => f.env === mode);
  if (!file) {
    err(`unknown mode: ${mode}`);
    return;
  }
  // Dev compose tags `sub-wave-liquidsoap:local` and has no `image:` on the
  // controller, so it must build locally on first install. Prod / prod-byo
  // reference published `ghcr.io/perminder-klair/subwave-*` images — pull
  // them instead of rebuilding from source. `--pull always` forces a fresh
  // pull on prod so a previously-built local image (e.g. from an earlier
  // setup run, which may have baked in a stale web/.env.local) doesn't keep
  // masking the upstream GHCR release. Operators hacking on the code can
  // force a rebuild later via `subwave restart <svc> --build`.
  const wantBuild = mode === 'dev';
  const wantPull = mode === 'dev' ? undefined : ('always' as const);
  header(`Starting ${mode} stack`);
  const flags = `${wantBuild ? ' --build' : ''}${wantPull ? ` --pull ${wantPull}` : ''}`;
  muted(`docker compose -f ${file.file} up -d${flags}`);
  console.log();
  const upCode = await composeUp(file, { build: wantBuild, pull: wantPull });
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

  // --- 15. Dev only: start the web dev server -----------------------------
  let webDevState: WebDevState = 'skipped';
  if (mode === 'dev') {
    webDevState = await maybeStartWebDev();
  }

  // --- 16. Summary --------------------------------------------------------
  header('Endpoints');
  if (mode === 'prod') {
    muted(`Site:    ${accent(webBaseFor('prod'))}`);
    muted(`Stream:  ${accent(streamUrlFor('prod'))}`);
    muted(`API:     ${accent(`${apiBaseFor('prod')}/health`)}`);
  } else if (mode === 'prod-byo') {
    // The host ports the BYO compose file binds — these are what the
    // operator's reverse proxy should target. See docker/Caddyfile for the
    // route table to replicate.
    muted(`Web:         ${accent('http://localhost:7700')}  ${pc.dim('(point your proxy at this for /)')}`);
    muted(`API:         ${accent('http://localhost:7701')}  ${pc.dim('(route /api/* here, strip the /api prefix)')}`);
    muted(`Stream:      ${accent('http://localhost:7702/stream.mp3')}  ${pc.dim('(route /stream.mp3 here, disable buffering)')}`);
    muted(`Reference:   ${pc.dim('docker/Caddyfile — replicate this route table in your proxy')}`);
  } else {
    muted(`Controller:  ${accent('http://localhost:7701')}`);
    muted(`Stream:      ${accent('http://localhost:7702/stream.mp3')}`);
    if (webDevState === 'running') {
      muted(`Web (dev):   ${accent('http://localhost:7700')}  ${pc.dim('(running — log: state/logs/web-dev.log, pid: state/logs/web-dev.pid)')}`);
    } else {
      muted(`Web (dev):   ${accent('http://localhost:7700')}  (separate: `+ pc.dim('`npm --prefix web run dev`') + ')');
    }
  }

  console.log();
  ok('Setup complete.');
  muted(`Try ${pc.dim('`npm start -- status`')} or ${pc.dim('`npm start -- doctor`')}.`);
  console.log();
  muted(`Open the terminal player: ${accent('npm start -- play')}`);
}

// ---------------------------------------------------------------------------
// Step implementations
// ---------------------------------------------------------------------------

async function pickMode(): Promise<Mode> {
  // If a previous install left a .env (or the legacy controller/.env) behind,
  // the operator is re-running setup. Surface that — collectAdmin /
  // collectNavidrome pre-fill from whichever source they find.
  const root = parseEnvFile(getRootEnv());
  const legacy = parseEnvFile(getLegacyControllerEnv());
  const existingSource = Object.keys(root).length > 0
    ? '.env'
    : Object.keys(legacy).length > 0
      ? 'controller/.env (legacy)'
      : null;
  if (existingSource) {
    const count = Object.keys(root).length || Object.keys(legacy).length;
    muted(`Existing ${existingSource} detected (${count} keys). You can keep the values or reconfigure as you go.`);
  }

  // Dev mode needs the cloned source (controller/, web/, scripts/) — hide it
  // from operators on a standalone-CLI install where those don't exist.
  const { isCloneMode } = await import('../home.ts');
  const cloneMode = isCloneMode(getSubwaveHome());
  const options: Array<{ value: Mode; label: string; hint: string }> = [
    {
      value: 'prod',
      label: 'prod — server deploy with bundled Caddy',
      hint: 'docker-compose.yml · Caddy :7700 · web baked into image',
    },
    {
      value: 'prod-byo',
      label: 'prod (BYO proxy) — Traefik / nginx / your own Caddy',
      hint: 'docker-compose.byo.yml · web :7700 · controller :7701 · icecast :7702',
    },
  ];
  if (cloneMode) {
    options.push({
      value: 'dev',
      label: 'dev — local hacking',
      hint: 'docker-compose.dev.yml · controller :7701 · web on :7700 separately',
    });
  }

  return exitIfCancelled(await p.select<Mode>({
    message: 'How are you running SUB/WAVE?',
    initialValue: 'prod',
    options,
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
  const defaultDir = resolve(getSubwaveHome(), 'state');
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
  // Pre-fill from the wizard overlay (state/setup-config.json), then env
  // overrides on the root .env (NAVIDROME_*), then legacy controller/.env
  // from a pre-single-compose install. First non-empty value wins.
  const sc = readSetupConfig().navidrome || {};
  const rootEnv = parseEnvFile(getRootEnv());
  const legacy = parseEnvFile(getLegacyControllerEnv());
  // The default URL reads natural in the prompt (matches what most operators
  // type), but the controller runs in Docker so a loopback URL won't resolve
  // to anything useful at runtime. We handle that with a post-probe swap
  // prompt below — see the LOOPBACK_RE block.
  let url = rootEnv.NAVIDROME_URL || sc.url || legacy.NAVIDROME_URL || 'http://localhost:4533';
  let user = rootEnv.NAVIDROME_USER || sc.user || legacy.NAVIDROME_USER || '';
  let pass = rootEnv.NAVIDROME_PASS || sc.pass || legacy.NAVIDROME_PASS || '';

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

  url = await maybeSwapLoopbackForContainer(url, 'Navidrome');

  return { url, user, pass };
}

// Loopback hostnames (localhost / 127.0.0.1 / 0.0.0.0 / ::1) don't resolve
// to the host from inside the controller container — they resolve to the
// container itself. The compose files wire host.docker.internal to the host
// gateway via `extra_hosts`, so we offer to swap the hostname now rather than
// letting the controller fail every call until the operator notices.
//
// Returns the (possibly swapped) URL.
async function maybeSwapLoopbackForContainer(url: string, serviceLabel: string): Promise<string> {
  const loopbackMatch = url.match(/^(https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i);
  if (!loopbackMatch) return url;
  const swapped = url.replace(loopbackMatch[2] as string, 'host.docker.internal');
  warn(
    `${url} points at your host's loopback. The controller runs in Docker, so this URL would resolve to the controller container itself rather than ${serviceLabel} on your host.`,
  );
  const ok = exitIfCancelled(await p.confirm({
    message: `Save as ${swapped} so the container can reach it?`,
    initialValue: true,
  }), { backOnCancel: false });
  if (ok) {
    muted(`using ${swapped}`);
    return swapped;
  }
  warn(
    `Keeping ${url} — the controller will fail to reach ${serviceLabel} unless you have a custom routing setup (e.g. host network mode).`,
  );
  return url;
}

// Detect a reachable Ollama. Tries common loopback URLs from the host with a
// short timeout each; returns the first one that responds. Used to set a
// smart initial value for the wizard's Ollama URL prompt — the loopback-swap
// step rewrites it for the controller container afterwards.
async function detectOllamaUrl(): Promise<string | null> {
  const candidates = ['http://localhost:11434', 'http://127.0.0.1:11434'];
  for (const base of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 800);
      const r = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return base;
    } catch {
      // fall through to the next candidate
    }
  }
  return null;
}

// The provider picker — same eight providers the admin Settings UI offers,
// in the same order, plus an explicit "configure later" escape hatch.
const LLM_PROVIDER_OPTIONS: Array<{ value: LlmProvider | 'later'; label: string; hint: string }> = [
  { value: 'ollama',            label: 'Ollama — local homelab',          hint: 'no API key — point at your homelab box' },
  { value: 'openai-compatible', label: 'OpenAI-compatible — self-hosted',  hint: 'llama.cpp, vLLM, LM Studio — your own server URL' },
  { value: 'anthropic',         label: 'Anthropic — Claude',               hint: 'needs ANTHROPIC_API_KEY' },
  { value: 'openai',            label: 'OpenAI — GPT',                     hint: 'needs OPENAI_API_KEY' },
  { value: 'google',            label: 'Google — Gemini',                  hint: 'needs GOOGLE_GENERATIVE_AI_API_KEY' },
  { value: 'deepseek',          label: 'DeepSeek',                         hint: 'needs DEEPSEEK_API_KEY' },
  { value: 'openrouter',        label: 'OpenRouter — multi-vendor',        hint: 'needs OPENROUTER_API_KEY' },
  { value: 'gateway',           label: 'Vercel AI Gateway — multi-vendor', hint: 'needs AI_GATEWAY_API_KEY' },
  { value: 'later',             label: 'Other / configure later',          hint: 'set it up in the admin UI' },
];

// Example model ids — placeholder hints only, not defaults.
const EXAMPLE_MODEL: Record<Exclude<LlmProvider, 'ollama'>, string> = {
  'openai-compatible': 'qwen3',
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.5-flash',
  deepseek: 'deepseek-v4-flash',
  openrouter: 'anthropic/claude-sonnet-4-5',
  gateway: 'anthropic/claude-sonnet-4-5',
};

async function collectLlm(): Promise<LlmChoice> {
  header('LLM provider');
  const choice = exitIfCancelled(await p.select<LlmProvider | 'later'>({
    message: 'Which LLM should the AI DJ talk to?',
    initialValue: 'ollama',
    options: LLM_PROVIDER_OPTIONS,
  }), { backOnCancel: false });

  if (choice === 'later') return { provider: null };

  if (choice === 'ollama') {
    // Quick probe from the host so the default URL reflects reality. Whatever
    // we land on is then loopback-swapped to host.docker.internal for the
    // controller container.
    const detected = await detectOllamaUrl();
    if (detected) ok(`Detected Ollama on ${detected}`);
    let url = exitIfCancelled(await p.text({
      message: 'Ollama server URL',
      initialValue: detected || 'http://localhost:11434',
      placeholder: 'http://localhost:11434',
      validate: (v: string) => (!/^https?:\/\//.test(v) ? 'must start with http(s)://' : undefined),
    }), { backOnCancel: false });
    const model = exitIfCancelled(await p.text({
      // glm-5.1:cloud is the recommended default — it calls tools reliably
      // (~97% on the picker-test harness, ~2s/pick), which the DJ picker
      // agent depends on. kimi-k2.6:cloud honours tool calls only ~50% of
      // the time; avoid it for the picker.
      message: 'Ollama model (must be pulled on the server)',
      initialValue: 'glm-5.1:cloud',
      placeholder: 'glm-5.1:cloud',
      validate: (v: string) => (!v ? 'required' : undefined),
    }), { backOnCancel: false });
    await reportProbe('Ollama', () => probeOllama({ url, model }));
    url = await maybeSwapLoopbackForContainer(url, 'Ollama');
    return { provider: 'ollama', ollamaUrl: url, ollamaModel: model };
  }

  if (choice === 'openai-compatible') {
    const baseUrl = exitIfCancelled(await p.text({
      message: 'Server base URL (include the /v1 suffix)',
      placeholder: 'http://localhost:8080/v1',
      validate: (v: string) =>
        !v ? 'required' : !/^https?:\/\//.test(v) ? 'must start with http(s)://' : undefined,
    }), { backOnCancel: false });
    const model = exitIfCancelled(await p.text({
      message: 'Model id',
      placeholder: EXAMPLE_MODEL['openai-compatible'],
      validate: (v: string) => (!v ? 'required' : undefined),
    }), { backOnCancel: false });
    const apiKey = exitIfCancelled(await p.password({
      message: 'API key (optional — many self-hosted servers need none)',
      mask: '*',
    }), { backOnCancel: false });
    return { provider: 'openai-compatible', baseUrl, model, apiKey: apiKey || undefined };
  }

  // Cloud branch — choice is now narrowed to CloudProvider.
  const provider = choice;
  const label = (LLM_PROVIDER_OPTIONS.find((o) => o.value === provider)?.label ?? provider)
    .split(' — ')[0] as string;
  const apiKey = exitIfCancelled(await p.password({
    message: `${label} API key`,
    mask: '*',
  }), { backOnCancel: false });
  const model = exitIfCancelled(await p.text({
    message: 'Model id (enter to choose later in the admin UI)',
    placeholder: EXAMPLE_MODEL[provider],
  }), { backOnCancel: false });
  if (!apiKey) {
    warn('No key provided — saving the provider choice; add the key later via the admin UI, the browser wizard at /setup, or by hand in state/secrets.env.');
  } else {
    await maybeProbeCloud(provider, label, apiKey);
  }
  return { provider, apiKey: apiKey || undefined, model: model || undefined };
}

// Probe the cloud providers we ship a probe for; google / deepseek / gateway
// have none, so their key is first exercised on the controller's first DJ call.
async function maybeProbeCloud(provider: CloudProvider, label: string, apiKey: string): Promise<void> {
  if (provider === 'openai') return reportProbe(label, () => probeOpenAI({ apiKey }));
  if (provider === 'anthropic') return reportProbe(label, () => probeAnthropic({ apiKey }));
  if (provider === 'openrouter') return reportProbe(label, () => probeOpenRouter({ apiKey }));
}

interface AdminCreds { user: string; pass: string; }

async function collectAdmin(mode: Mode): Promise<AdminCreds> {
  header('Admin credentials');
  if (isProdEnv(mode)) {
    muted('REQUIRED in prod — the controller exits at boot without these.');
  } else {
    muted('Recommended even in dev (gates /settings, /debug, /jingles, /restart-mixer).');
  }
  // Root .env wins; fall back to legacy controller/.env for upgraders.
  const existing = {
    ...parseEnvFile(getLegacyControllerEnv()),
    ...parseEnvFile(getRootEnv()),
  };
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

// SITE_URL is required in the root .env in the single-compose world: it
// determines absolute URLs (OG tags, manifest, sitemap, share cards) at
// both build and runtime. In dev a localhost origin is fine; in prod the
// operator should know their public hostname before booting.
async function promptSiteUrl(mode: Mode): Promise<string> {
  header('Public site URL');
  const existing = parseEnvFile(getRootEnv()).SITE_URL;
  const defaultUrl =
    existing ||
    (mode === 'dev' ? 'http://localhost:7700' : '');
  if (mode === 'dev') {
    muted('Used for absolute URLs (OG tags, sitemap). Localhost is fine in dev.');
  } else {
    muted('Used for absolute URLs (OG tags, sitemap, share cards). Set to your public origin.');
  }
  return exitIfCancelled(await p.text({
    message: 'SITE_URL',
    initialValue: defaultUrl,
    placeholder: 'https://radio.example.com',
    validate: (v: string) => {
      if (!v) return isProdEnv(mode) ? 'required in prod' : undefined;
      if (!/^https?:\/\//.test(v)) return 'must start with http(s)://';
      return undefined;
    },
  }), { backOnCancel: false });
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
  // In clone mode, scripts/setup.sh handles state perms, .env scaffolding,
  // and web/.env.local. In standalone-CLI installs there's no scripts/ dir
  // (and no web/ either), so we inline the only step that still matters:
  // making sure state/ is writable by every container UID.
  const { isCloneMode } = await import('../home.ts');
  if (!isCloneMode(getSubwaveHome())) {
    header('State directory perms (standalone install)');
    const { chmodSync, mkdirSync } = await import('node:fs');
    const stateDir = env.STATE_DIR ?? resolve(getSubwaveHome(), 'state');
    mkdirSync(stateDir, { recursive: true });
    try {
      chmodSync(stateDir, 0o777);
      ok(`chmod 777 ${stateDir}`);
    } catch (e) {
      warn(`could not chmod ${stateDir}: ${(e as Error).message}`);
      muted('icecast/liquidsoap/controller may fail to write there on first boot.');
    }
    return;
  }

  header('Rendering icecast.xml + studio audio (scripts/setup.sh)');
  await new Promise<void>((resolveP, reject) => {
    const child = spawn('bash', ['scripts/setup.sh'], {
      cwd: getSubwaveHome(),
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
  // Jingle generation lives in scripts/generate-jingles.sh which docker-execs
  // into the controller. Standalone installs don't have the script — defer
  // the operator to the /onboarding wizard's jingle UI, which talks to the
  // same controller endpoint.
  const { isCloneMode } = await import('../home.ts');
  if (!isCloneMode(getSubwaveHome())) {
    muted('Skipping jingle rendering — finish at /onboarding (Jingles step) or POST /jingles per ident text you want spoken.');
    return;
  }

  header('Rendering jingles');
  await new Promise<void>((resolveP) => {
    const child = spawn('bash', ['scripts/generate-jingles.sh'], {
      cwd: getSubwaveHome(),
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
  } else if (llm.provider === 'openai-compatible') {
    // openai-compatible has no env var — the server URL and (optional) key
    // both live in settings, alongside the model id.
    if (llm.baseUrl) body.llm.baseUrl = llm.baseUrl;
    if (llm.model) body.llm.model = llm.model;
    if (llm.apiKey) body.llm.apiKey = llm.apiKey;
  } else if (llm.model) {
    // Cloud providers: the API key lives in state/secrets.env (sourced into
    // process.env on controller boot) and the AI SDK reads <PROVIDER>_API_KEY
    // automatically — we only carry the model id through to settings.
    body.llm.model = llm.model;
  }

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

