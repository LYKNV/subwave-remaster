// `subwave play [dev|prod]` — launch the terminal player (TUI) pointed at
// the running stack.
//
// Two backends, picked by what's actually on disk:
//
//  - Clone-mode (contributors): `<home>/tui/package.json` is present, the
//    TUI source tree is checked out. Run it the old way — `node
//    bin/subwave-tui.js` under the tsx loader, hot edits to src/ take
//    effect on the next launch.
//
//  - Standalone (operators who installed via `curl … | sh`): no tui/ dir.
//    Fetch the version-pinned `subwave-tui-<platform>-<arch>` binary from
//    the matching GitHub release into `<home>/tui/bin/subwave-tui` and
//    spawn it. Cached forever; redownloaded when the operator runs
//    `subwave self-update` (which bumps CLI_VERSION → the cached path
//    points at the old version and miss-then-fetch fires again).

import { existsSync, mkdirSync, chmodSync, createWriteStream, statSync, renameSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  detectCompose,
  apiBaseFor,
  streamUrlFor,
  type ComposeEnv,
} from '../compose.ts';
import { getSubwaveHome } from '../util.ts';
import { CLI_VERSION } from '../assets.ts';
import {
  exitIfCancelled,
  header,
  info,
  warn,
  err,
  muted,
  p,
  pauseForEnter,
  isMenuMode,
  setMenuMode,
} from '../ui.ts';

// Owner/repo for the GitHub release that holds the compiled TUI binaries.
// Same release tag as the CLI binary that this code is bundled into.
const RELEASE_REPO = 'perminder-klair/subwave';

function tuiDir(): string { return resolve(getSubwaveHome(), 'tui'); }
function tuiBinDir(): string { return resolve(tuiDir(), 'bin'); }
function tuiCloneEntry(): string { return resolve(tuiBinDir(), 'subwave-tui.js'); }
function tuiCompiledBin(): string { return resolve(tuiBinDir(), 'subwave-tui'); }

// Clone-mode = the operator is running from a `git clone` checkout. The
// `tui/package.json` (alongside controller/ and web/) is what distinguishes
// it from a standalone install, mirroring isCloneMode() in home.ts.
function isCloneTui(): boolean {
  return existsSync(resolve(tuiDir(), 'package.json')) && existsSync(tuiCloneEntry());
}

// node_modules check — only relevant for clone-mode. Standalone installs
// run the bundled binary which carries its own deps.
function cloneNodeModulesPresent(): boolean {
  return existsSync(resolve(tuiDir(), 'node_modules'));
}

// Resolve the platform/arch slug bun --compile uses for asset names. The
// CLI binary that's running was itself built for one of these; assume the
// TUI binary follows the same convention. Returns null on unsupported
// host platforms (Windows, BSDs, …) so the caller can surface a clear
// error instead of fetching a 404.
function resolveAssetSlug(): string | null {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === 'linux'  && arch === 'x64')   return 'linux-x64';
  if (plat === 'linux'  && arch === 'arm64') return 'linux-arm64';
  if (plat === 'darwin' && arch === 'x64')   return 'darwin-x64';
  if (plat === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  return null;
}

function releaseAssetUrl(slug: string): string {
  // Escape hatch for local testing — point at any HTTP-reachable binary
  // (e.g. `python3 -m http.server` serving tui/dist) before the release
  // workflow has actually published a v<CLI_VERSION> asset. The substituted
  // value can be a full URL or a template containing {slug}.
  const override = process.env.SUBWAVE_TUI_DOWNLOAD_URL;
  if (override) return override.replace('{slug}', slug);
  return `https://github.com/${RELEASE_REPO}/releases/download/v${CLI_VERSION}/subwave-tui-${slug}`;
}

// Download the matching TUI binary from the GitHub release into
// `<home>/tui/bin/subwave-tui`. Streamed to a `.partial` file first so a
// killed download doesn't leave a half-written executable behind that
// looks valid on the next run.
async function fetchTuiBinary(slug: string): Promise<void> {
  const url = releaseAssetUrl(slug);
  const out = tuiCompiledBin();
  const partial = `${out}.partial`;

  mkdirSync(tuiBinDir(), { recursive: true });
  if (existsSync(partial)) unlinkSync(partial);

  info(`fetching subwave-tui-${slug} from release v${CLI_VERSION}`);
  muted(url);

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(
      `download failed (${res.status} ${res.statusText}). ` +
      `Either v${CLI_VERSION} hasn't been released yet, or the matching TUI ` +
      `asset is missing. URL: ${url}`,
    );
  }

  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(partial));

  // Sanity check — Bun-compiled binaries are tens of MB. Anything under 1MB
  // is almost certainly a 404 HTML page that slipped through with a 200 (or
  // a release asset redirect we mishandled).
  const size = statSync(partial).size;
  if (size < 1_000_000) {
    unlinkSync(partial);
    throw new Error(`downloaded asset is suspiciously small (${size} bytes) — refusing to install`);
  }

  renameSync(partial, out);
  chmodSync(out, 0o755);
  info(`installed → ${out}  (${(size / (1024 * 1024)).toFixed(1)} MB)`);
}

export interface PlayOpts {
  envArg?: Exclude<ComposeEnv, 'down'>;
}

export async function runPlayCommand(opts: PlayOpts = {}): Promise<void> {
  // Decide which on-disk TUI we'll launch. Clone-mode wins so contributors
  // editing src/ get their changes; standalone falls through to the fetched
  // binary (downloading it first if needed).
  type Backend =
    | { kind: 'clone' }
    | { kind: 'compiled'; path: string };
  let backend: Backend;

  if (isCloneTui()) {
    backend = { kind: 'clone' };
  } else {
    const slug = resolveAssetSlug();
    if (!slug) {
      header('TUI not available on this platform');
      err(`compiled binaries exist only for linux/macOS on x64/arm64 — detected ${process.platform}/${process.arch}.`);
      muted('clone the repo and run the Node-based TUI manually, or run subwave from a supported host.');
      await pauseForEnter();
      return;
    }
    if (!existsSync(tuiCompiledBin())) {
      header('Terminal player needs a one-time download');
      info(`Subwave will fetch the TUI binary (~60–100 MB) into ${tuiBinDir()}.`);
      muted('subsequent launches are instant; rerun `subwave self-update` to refresh.');
      const proceed = exitIfCancelled(await p.confirm({
        message: 'Download it now?',
      }));
      if (!proceed) {
        muted('skipped — `subwave play` is unavailable until the download completes.');
        await pauseForEnter();
        return;
      }
      try {
        await fetchTuiBinary(slug);
      } catch (e) {
        err(e instanceof Error ? e.message : String(e));
        muted('check your internet connection, then try `subwave play` again.');
        await pauseForEnter();
        return;
      }
    }
    backend = { kind: 'compiled', path: tuiCompiledBin() };
  }

  // Which stack are we listening to? Explicit arg wins; otherwise follow
  // whatever's currently up; if nothing's up, ask. (The TUI still runs as
  // a read-only dashboard when the stack is down — env just decides URLs.)
  type PlayableEnv = Exclude<ComposeEnv, 'down'>;
  let env: PlayableEnv;
  if (opts.envArg) {
    env = opts.envArg;
  } else {
    const detected = detectCompose();
    if (detected.env !== 'down') {
      env = detected.env;
    } else {
      env = exitIfCancelled(await p.select<PlayableEnv>({
        message: 'Stack is down — which env should the player target?',
        options: [
          { value: 'dev',      label: 'dev',              hint: 'controller :7701 · stream :7702' },
          { value: 'prod',     label: 'prod',             hint: 'Caddy edge :7700' },
          { value: 'prod-byo', label: 'prod (BYO proxy)', hint: 'controller :7701 · stream :7702' },
        ],
      }));
    }
  }

  // Clone-mode TUI carries its own dep tree. A fresh checkout has no
  // node_modules until installed — offer to do it. Standalone binary
  // skips this entirely.
  if (backend.kind === 'clone' && !cloneNodeModulesPresent()) {
    warn('the terminal player has no node_modules yet — it needs `npm install` first.');
    const doInstall = exitIfCancelled(await p.confirm({
      message: 'Run `npm install` in tui/ now?',
    }));
    if (!doInstall) {
      muted('skipped — run `npm install` inside tui/ yourself, then retry.');
      await pauseForEnter();
      return;
    }
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('npm', ['install'], { cwd: tuiDir(), stdio: 'inherit' });
    if (r.status !== 0) {
      err('npm install failed — see output above.');
      await pauseForEnter();
      return;
    }
  }

  const apiUrl = apiBaseFor(env);
  const streamUrl = streamUrlFor(env);

  header('Terminal player');
  info(`env=${env} · api=${apiUrl}`);
  if (backend.kind === 'compiled') muted(`binary: ${backend.path}`);
  muted('q / Ctrl-C inside the player returns here.');
  console.log();

  // Drop menu mode for the duration: the Esc→Ctrl-C translation in ui.ts
  // must not leak keystrokes into the Ink app, which does its own raw-mode
  // input handling. Restore it afterwards so the menu loop behaves.
  const wasMenu = isMenuMode();
  if (wasMenu) setMenuMode(false);
  try {
    await new Promise<void>((resolveP) => {
      const [cmd, args]: [string, string[]] = backend.kind === 'clone'
        ? ['node', [tuiCloneEntry(), '--api', apiUrl, '--stream', streamUrl]]
        : [backend.path, ['--api', apiUrl, '--stream', streamUrl]];
      const child = spawn(cmd, args, { cwd: tuiDir(), stdio: 'inherit' });
      child.on('exit', () => resolveP());
      child.on('error', (e) => {
        err(`failed to launch TUI: ${e.message}`);
        resolveP();
      });
    });
  } finally {
    if (wasMenu) setMenuMode(true);
  }
}
