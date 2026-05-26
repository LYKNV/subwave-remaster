# Testing the controller

We use **Vitest**. The intent is light: tests come with new code, not as a backfill across the existing codebase. If you're not editing a module, you don't owe it a test.

```bash
npm test            # one-shot, used by CI
npm run test:watch  # TDD inner loop
npm run test:coverage
```

## Where tests live

Next to the source. `foo.ts` → `foo.test.ts`. Same directory, same import path style (`./foo.js` — NodeNext extension convention applies to test imports too).

## When to write them

Every new feature or bugfix PR adds tests for the new behaviour. That's the whole convention.

- New pure function → unit test it directly.
- New route → drive it via `supertest` against the express app with externals stubbed.
- New behaviour that calls into the LLM → stub `llm/sdk.ts`, never the provider modules underneath.
- Bug fix → land the failing test in the same commit as the fix, so the regression can't sneak back.

We are not writing characterization tests for code that isn't being touched. Coverage thresholds are off on purpose — they make sense once a suite has shape, not before.

## Stub at the closest seam

The controller is side-effect heavy at its edges. Mock at the consumer's import boundary using `vi.mock`, not at `fetch` / `child_process` / `node:fs`:

| When the code under test calls …                          | Mock this module                  |
| --------------------------------------------------------- | --------------------------------- |
| any LLM (text / object / agent)                           | `llm/sdk.js`                      |
| Subsonic / Navidrome                                      | `music/subsonic.js`               |
| TTS (any engine)                                          | `audio/tts.js`                    |
| Liquidsoap telnet (`restart`, etc.)                       | `broadcast/liquidsoap-control.js` |
| Settings reads (`getEffectivePersona`, `resolveActiveShow`) | `settings.js`                   |

`vi.mock` calls are hoisted above imports — declare them at the top of the test file, then `import` the module under test below.

## File IPC (`STATE_DIR`)

`vitest.config.ts` pins `STATE_DIR` to `os.tmpdir()/subwave-test-state` for the whole run. That's enough for tests that only need the dir to *exist* (e.g. import-time `mkdir`). Tests that actually write under `STATE_DIR` (queue files, settings.json, sessions) should scope their own subdir:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach, vi } from 'vitest';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'subwave-'));
  vi.stubEnv('STATE_DIR', dir);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
```

`config.STATE_DIR` is read at module load, so a module that has *already* been imported won't see the override — `vi.resetModules()` + a dynamic `await import(...)` is the way to re-import a target module under a fresh `STATE_DIR`.

## Time

Anything that branches on wall-clock uses fake timers:

```ts
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

vi.setSystemTime(new Date('2026-05-25T08:30:00Z'));
```

When the function already accepts a `now: Date` parameter (e.g. `shouldFire`, `getTimeContext`), prefer passing the date directly — it's clearer than time-warping the world.

## What not to test

- Cron firing. Test the handler, assert `shouldFire(...)` gates it. Don't test that `node-cron` itself ticks.
- Real LLM output. Stub `llm/sdk.ts` to return canned responses; the model is not under test.
- Real network. Stub the closest seam, never `fetch` or `undici` directly.
- Real audio. Piper / Kokoro / cloud TTS shells out; stub `audio/tts.ts`.
