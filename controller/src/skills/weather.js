// Weather skill — a short weather check. ctx.weather is populated by
// context.getFullContext(); this skill doesn't fetch its own weather.
//
// Whether the weather is worth airing (condition-changed) is decided by the
// segment-director agent via the checkWeather tool; this module just renders
// the spoken line for the /dj/skill manual-override route.

import { djText } from '../llm/sdk.js';
import { djSystem, buildContextLines, decoratePrompt } from '../llm/dj.js';

export default {
  name: 'weather',
  label: 'Weather',
  description: 'A short weather check, fired only when conditions change since the last mention.',
  kind: 'weather',
  cooldownMs: 25 * 60 * 1000,

  async script(ctx, _data, { recap, recentOpeners }) {
    const lines = buildContextLines(ctx);
    lines.push('Task: a brief weather check, in character. 1-2 sentences.');
    return djText({
      system: djSystem(),
      prompt: decoratePrompt(lines.join('\n'), { kind: 'weather', recap, recentOpeners }),
      temperature: 0.9,
      topP: 0.95,
      repeatPenalty: 1.15,
      kind: 'skill.weather',
    });
  },
};
