// Setup overlay — small JSON file the first-run wizard writes to capture
// Navidrome credentials and the setup-complete timestamp. Lives at
// state/setup-config.json (writable from any container UID via the existing
// state-dir perms) and is read by config.ts as a fallback when env vars are
// blank.
//
// Why not extend settings.ts? Settings.ts has thick schema validation for the
// admin UI's many knobs (DJ personas, shows, schedules, TTS engines, …). The
// wizard only needs a tiny structured store for fields that already had env-var
// counterparts. A separate file keeps the surfaces clean: settings.ts stays
// the runtime admin store, setup-config.json stays the one-shot wizard output.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { STATE_DIR } from '../config.js';

const PATH = `${STATE_DIR}/setup-config.json`;

export interface SetupConfig {
  navidrome?: {
    url?: string;
    user?: string;
    pass?: string;
  };
  // ISO timestamp written when the wizard saves successfully.
  setupCompletedAt?: string;
}

let cache: SetupConfig | null = null;

export async function loadSetupConfig(): Promise<SetupConfig> {
  if (cache) return cache;
  if (!existsSync(PATH)) {
    cache = {};
    return cache;
  }
  try {
    cache = JSON.parse(await readFile(PATH, 'utf8'));
    return cache!;
  } catch {
    cache = {};
    return cache;
  }
}

export async function saveSetupConfig(patch: Partial<SetupConfig>): Promise<SetupConfig> {
  const current = await loadSetupConfig();
  // Shallow-merge top level, deep-merge navidrome to allow partial updates.
  const next: SetupConfig = {
    ...current,
    ...patch,
    navidrome: { ...(current.navidrome || {}), ...(patch.navidrome || {}) },
  };
  await mkdir(dirname(PATH), { recursive: true });
  await writeFile(PATH, JSON.stringify(next, null, 2));
  cache = next;
  return next;
}

// Hot-reload escape hatch for tests / wizard saves that want the next read to
// hit disk again rather than the in-process cache.
export function clearSetupConfigCache() {
  cache = null;
}
