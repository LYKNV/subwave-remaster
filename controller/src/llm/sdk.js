// AI SDK wrapper — the single chokepoint for every LLM call in the controller.
//
// Two primitives:
//   djText   — free-text generation (DJ intros, links, idents, skill segments)
//   djObject — schema-validated structured output (request matching, picker)
//
// Both resolve their model through llm/provider.js, so switching providers in
// Settings reroutes every call with no change here or at the call sites.

import { generateText, Output, stepCountIs, ToolLoopAgent } from 'ai';
import { languageModel, activeModelLabel } from './provider.js';
import { record } from './log.js';

// Some models (Qwen 3, DeepSeek R1, etc.) emit a <think>…</think> reasoning
// block before the answer. We ask the provider to disable thinking AND strip
// any leftover tags defensively — `think: false` isn't honoured uniformly.
const THINK_TAG_RE = /<think>[\s\S]*?<\/think>\s*/gi;
const DANGLING_THINK_RE = /^[\s\S]*?<\/think>\s*/i;

function stripThinking(s) {
  if (!s) return s;
  return s.replace(THINK_TAG_RE, '').replace(DANGLING_THINK_RE, '').trim();
}

// Pull a JSON object out of a free-text reply: drop ```json fences and any
// prose around it, then take the outermost { … }. Used by djObject's recovery
// path when native structured output fails to parse.
function extractJson(s) {
  if (!s) throw new Error('empty model response');
  const t = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model response');
  return t.slice(start, end + 1);
}

// `repeat_penalty` is Ollama-specific and lives under providerOptions.ollama;
// non-Ollama providers ignore the block entirely, so it's safe to always pass.
function ollamaOptions(repeatPenalty) {
  const opts = { think: false };
  if (repeatPenalty != null) opts.options = { repeat_penalty: repeatPenalty };
  return { ollama: opts };
}

// Free-text DJ generation.
export async function djText({
  system,
  prompt,
  temperature = 0.9,
  topP = 0.95,
  repeatPenalty = 1.15,
  seed = null,
  maxOutputTokens = null,
  kind = 'sdk.djText',
}) {
  const started = Date.now();
  try {
    const result = await generateText({
      model: languageModel(),
      system,
      prompt,
      temperature,
      topP,
      ...(seed != null ? { seed } : {}),
      ...(maxOutputTokens != null ? { maxOutputTokens } : {}),
      providerOptions: ollamaOptions(repeatPenalty),
    });
    const out = stripThinking(result.text);
    record({
      kind, ok: true, ms: Date.now() - started,
      model: activeModelLabel(),
      sampling: { temperature, top_p: topP, repeat_penalty: repeatPenalty, seed },
      via: 'ai-sdk',
      // Full, untruncated — the /debug surface shows the whole system prompt.
      system,
      user: prompt,
      response: out,
      t: new Date().toISOString(),
    });
    return out;
  } catch (err) {
    record({
      kind, ok: false, ms: Date.now() - started,
      model: activeModelLabel(), via: 'ai-sdk',
      user: prompt, error: err.message, t: new Date().toISOString(),
    });
    throw err;
  }
}

// Schema-validated structured output. `schema` is a Zod object schema; the
// returned value is parsed and validated.
//
// Two attempts, because small/cloud models occasionally botch structured
// output (the AI SDK throws NoObjectGeneratedError — "could not parse the
// response"):
//   1. native    — Output.object, which forwards the schema to the provider's
//                   structured-output mode (constrained decoding where it's
//                   supported).
//   2. recovery  — plain free-text, then strip <think> blocks / ``` fences and
//                   Zod-validate ourselves. Catches models that wrap the JSON
//                   in reasoning the native parser chokes on.
// Throws only if BOTH attempts fail.
export async function djObject({
  system,
  prompt,
  schema,
  temperature = 0.4,
  kind = 'sdk.djObject',
}) {
  const started = Date.now();
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      let object;
      if (attempt === 1) {
        const result = await generateText({
          model: languageModel(),
          system,
          prompt,
          temperature,
          output: Output.object({ schema }),
          providerOptions: ollamaOptions(null),
        });
        object = result.output;
      } else {
        const result = await generateText({
          model: languageModel(),
          system,
          prompt: `${prompt}\n\nRespond with a single JSON object only — no prose, no markdown fences.`,
          temperature,
          providerOptions: ollamaOptions(null),
        });
        object = schema.parse(JSON.parse(extractJson(stripThinking(result.text))));
      }
      record({
        kind, ok: true, ms: Date.now() - started,
        model: activeModelLabel(),
        sampling: { temperature },
        via: attempt === 1 ? 'ai-sdk' : 'ai-sdk:recovery',
        // Full, untruncated — the /debug surface shows the whole system prompt.
        system,
        user: prompt,
        response: JSON.stringify(object).slice(0, 500),
        t: new Date().toISOString(),
      });
      return object;
    } catch (err) {
      lastErr = err;
    }
  }
  record({
    kind, ok: false, ms: Date.now() - started,
    model: activeModelLabel(), via: 'ai-sdk',
    user: prompt, error: lastErr.message, t: new Date().toISOString(),
  });
  throw lastErr;
}

// Conversational tool-loop with structured output — the primitive behind the
// session DJ agent (broadcast/dj-agent.js). A ToolLoopAgent is given the
// music-discovery tools and a step cap, fed a `messages` array (the session
// chat window) instead of a single prompt, and returns a schema-validated
// final object. Throws on failure so the caller can fall back to a stateless
// path.
export async function djAgent({
  system,
  messages,
  tools,
  schema,
  maxSteps = 8,
  temperature = 0.6,
  kind = 'sdk.djAgent',
}) {
  const started = Date.now();
  try {
    const agent = new ToolLoopAgent({
      model: languageModel(),
      instructions: system,
      tools,
      stopWhen: stepCountIs(maxSteps),
      temperature,
      ...(schema ? { output: Output.object({ schema }) } : {}),
    });
    const result = await agent.generate({ messages });
    const steps = result.steps?.length ?? 0;
    const object = schema ? result.output : stripThinking(result.text);
    // Flatten the tool-loop into an ordered trail of {name, args, result} so
    // the /debug surface shows exactly which library tools the agent called.
    const toolCalls = (result.steps || []).flatMap((s) => {
      const results = s.toolResults || [];
      return (s.toolCalls || []).map((c, i) => ({
        name: c.toolName,
        args: c.input ?? c.args ?? null,
        result: results[i]?.output ?? results[i]?.result ?? null,
      }));
    });
    record({
      kind, ok: true, ms: Date.now() - started,
      model: activeModelLabel(),
      sampling: { temperature },
      via: 'ai-sdk:agent',
      // Full, untruncated — the agent's entire input and trail.
      system,
      messages,
      toolCalls,
      steps,
      response: schema
        ? JSON.stringify(object, null, 2)
        : String(object ?? ''),
      t: new Date().toISOString(),
    });
    return { object, steps, toolCalls };
  } catch (err) {
    record({
      kind, ok: false, ms: Date.now() - started,
      model: activeModelLabel(), via: 'ai-sdk:agent',
      system,
      messages,
      error: err.message, t: new Date().toISOString(),
    });
    throw err;
  }
}
