# Agent picker reliability — investigation notes

Late-night session (2026-05-19 → 05-20) that took the DJ agent picker from
~0/N reliable in live to ~100% in test and ~80% in live, by way of four
distinct fixes plus a lot of falsified hypotheses. This doc captures what we
tried, what was actually wrong, and the per-provider operational data we
gathered, so the next person debugging this doesn't have to repeat the spiral.

## TL;DR

Four real fixes, in order of impact:

1. **Use `provider.chat(id)` for Ollama, not `provider(id)`.** The default
   callable on `ollama-ai-provider-v2` routes through a broken "responses"
   interface that mistranslates tools/`toolChoice`/`activeTools`. Symptom:
   every cloud `:cloud` model emitted prose instead of tool calls regardless
   of which model we tried. Fix: explicit `.chat()` routes through `/api/chat`
   where tool calls work natively.

2. **Filter old `kind: 'pick'` user events from `windowMessages()`.** Every
   prior "Now playing X. Pick the next track" instruction stayed in the
   session window as a coalesced user message; the model saw 10+ "pick next"
   requests and got confused about which to answer. Symptom: 60% failures on
   gemini in long-context, 0% in live (sterile test passed 100%). Fix: keep
   only the most-recent pick event; older ones get dropped so the agent sees
   just the current ask.

3. **Conditional structured-output strategy in `sdk.js`.** On Ollama use the
   "done tool" pattern (Output.object is broken there). On everything else
   use native `Output.object` (done-tool only adds the "didn't call done"
   failure mode). One-line gate: `const useDoneTool = schema != null &&
   needsToolCallObject();`.

4. **Ultra-minimal system prompts.** The AI SDK already conveys tool
   descriptions, schema field descriptions, the done-tool's role, and per-tick
   instructions via session messages. Duplicating that in prompt text
   competes with the structural signals and derails small models. The fix is
   ~10 lines of persona + editorial criteria; everything else moved into
   schema `.describe()` calls.

Combined effect: see [Results](#results) at the end.

## The spiral, abridged

Things that looked like the bug but weren't:

- **"Models are flaky on cloud Ollama"** — they all are, until you fix
  the harness. Same models work fine via `/api/chat` directly with curl.
- **"`Output.object` is broken"** — only on Ollama. Native on Google /
  DeepSeek / Anthropic / OpenRouter. We conflated provider behaviour.
- **"Long context derails the model"** — true, but the root cause was the
  *shape* of long context (repeated "pick next" instructions), not its
  length. After filtering, even very long sessions produce ~155 chars of
  context for the picker.
- **"Token limits"** — we measured. Picker calls use ~600–2000 input tokens
  on a 200K-context model. Not the issue. Sub-10s "no output" failures are
  faster than any plausible output-cap hit.
- **"Reasoning models need bigger maxOutputTokens"** — checked. Successful
  picks use 250–600 output tokens against a 1200 cap.
- **Prompt verbosity didn't help reliability** — every iteration that added
  "make 2-4 tool calls, then call done with…" reduced reliability vs the
  minimal version. Small models read instructions as competing with the
  framework's structural directives.
- **`prepareStep` activeTools gating helped on Ollama, not elsewhere** —
  Google/DeepSeek don't honour the constraint the same way; they need
  Output.object instead.

Things that were the bug:

- The harness wiring (#1 above).
- The session-window shape (#2 above).
- Mismatched structured-output strategy per provider (#3 above).
- Prompt over-specification (#4 above).

## Diagnostic infrastructure built along the way

Most of the investigation was only possible because `sdk.js` now captures
much more on failure than it used to:

- `recordSuccess()` / `recordFailure()` helpers — every primitive funnels
  through them, so a new code path can't silently drop a field.
- `failureDiagnostics(err)` — pulls `err.text` / `err.finishReason` /
  `err.usage` / `err.cause.message` / partial tool calls off any AI SDK
  structured-output error. Without this, failures only carried the opaque
  "could not parse the response" message.
- `logFailurePreview(kind, err)` — tees a one-line preview of the failed
  model output to `docker logs`, so `grep "raw model output"` surfaces the
  actual model behaviour without digging through `/debug` JSON.
- `via` tracked per attempted strategy (`ai-sdk:tool` / `ai-sdk:agent` /
  `ai-sdk:recovery` / `ai-sdk`) — so `/stats` attributes failures correctly
  instead of bucketing everything as `ai-sdk`.

The test harness — `controller/scripts/picker-test.mjs` — runs djAgent in
isolation against any provider/model with synthetic discovery tools. Two
modes (`short` / `long`) for context length. Imports live `pickSystem` and
`PICK_SCHEMA` so changes there flow into the test automatically. Usage:

```bash
docker exec sub-wave-controller node scripts/picker-test.mjs <provider> <model> [N] [short|long]
```

## Results

Picker reliability across providers, with all four fixes in place:

| Provider / Model | Path used | n | Success | Median ms | Notes |
|---|---|---|---|---|---|
| `ollama:minimax-m2.7:cloud` | done-tool | 10 | 10/10 | 36s | slow but reliable, cloud-proxied |
| `ollama:kimi-k2.6:cloud` | done-tool | 10 | 1/10 | n/a | bad model fit, both paths fail |
| `google:gemini-3.5-flash` | Output.object | 5 short / 5 long | 5/5 / 5/5 | 5.3s / 6.7s | best overall |
| `google:gemini-3.5-flash` | Output.object | 5 live skips | 4/5 | 4–10s | matches test |
| `deepseek:deepseek-chat` | Output.object | 5 | 5/5 | 3.6s | fastest of all |
| `openrouter:anthropic/claude-haiku-4-5` | Output.object | 5 | 5/5 | 3.7s | cold-start outliers |

Picks now genuinely come back in seconds with real tool exploration and
meaningful reasons ("smooth transition from AP Dhillon to Prem Dhillon",
"flow from Talwiinder to atmospheric Prabh Deep") rather than prose dumps
or hallucinated IDs.

## Operational guidance

**For the live system right now**: `google:gemini-3.5-flash` and
`deepseek:deepseek-chat` are the fast, reliable picks. Ollama works (via
the `.chat()` path) but is slow (~30s per pick on minimax). Pool fallback
catches any agent failure in 2–5s, so listener-facing reliability is
effectively 100% regardless of model.

**Avoid `kimi-k2.6:cloud` for the agent picker** — both structured-output
paths fail on it. Use it for free-text DJ generation (intros, links) where
it's fine.

**If a new provider breaks the picker**, the diagnostic capture should tell
you exactly why. Check `/debug` for the failed call's `responseText`,
`finishReason`, `causeMessage`, and partial `toolCalls`. If the model emits
prose instead of structured output, suspect the harness (provider wiring).
If it emits bare `null` or a bare string, suspect the prompt or schema
nesting. If it never calls tools, suspect the provider's `toolChoice`
support.

**Don't add prompt guidance that the AI SDK already conveys.** Schema
descriptions, tool descriptions, the done-tool's role, session event text
— these are all framework channels the model reads structurally. Prompt
text that restates them competes with them. The "ultra-minimal" pickSystem
(~10 lines) consistently outperformed every more-detailed iteration.

## Files touched in this session

- `controller/src/llm/provider.js` — `.chat()` for Ollama
- `controller/src/llm/sdk.js` — conditional structured-output strategy,
  done-tool gating, prepareStep discovery gating, failure diagnostics,
  recordSuccess/recordFailure helpers, repeat_penalty honesty in sampling log
- `controller/src/llm/dj.js` — dead code removal, narrowed log re-export
- `controller/src/llm/tools.js` — per-tool result cap 12→8
- `controller/src/broadcast/dj-agent.js` — ultra-minimal `pickSystem` and
  `requestSystem`, exports for test harness, PICK_SCHEMA descriptions
  enriched, `pickViaPool` doesn't record the failure sentinel as a DJ turn
- `controller/src/broadcast/session.js` — `windowMessages()` filters
  scenario / play / old-pick-event turns
- `controller/src/skills/_agent.js` — ultra-minimal `directorSystem` and
  `forcedSystem`, bare-null silent classification, schema enriched
- `controller/src/music/subsonic.js` — SONG_PATHS vs OTHER_PATHS split,
  non-2xx body in error messages
- `controller/src/music/subsonic-log.js` — log rotation
- `controller/src/settings.js` — `agentPersonaPreamble` helper, dead constant
  removal
- `controller/scripts/picker-test.mjs` — test harness, short/long modes,
  uses live pickSystem
- `docs/agent-picker-investigation.md` — this doc
