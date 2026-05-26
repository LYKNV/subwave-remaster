import { describe, expect, it } from 'vitest';

// session.ts mixes pure helpers (sessionKeyFor) with module-level state that
// touches the filesystem (start / persist / archive). Only the pure helper is
// covered here — touching the stateful path will mean stubbing the fs writes
// and we'd rather do that in the PR that needs to change them.

import { sessionKeyFor } from './session.js';

describe('sessionKeyFor', () => {
  it('keys off the active show id when one is scheduled', () => {
    expect(sessionKeyFor({ activeShow: { id: 'breakfast-club' } })).toBe('show:breakfast-club');
  });

  it('the active show wins over time/mood context', () => {
    expect(
      sessionKeyFor({
        activeShow: { id: 'drive-home' },
        time: { period: 'morning' },
        dominantMood: 'rainy',
      }),
    ).toBe('show:drive-home');
  });

  it('falls back to auto:<period>:<mood> when no show is active', () => {
    expect(sessionKeyFor({ time: { period: 'evening' }, dominantMood: 'reflective' }))
      .toBe('auto:evening:reflective');
  });

  it('uses sentinel values when period or mood are missing', () => {
    expect(sessionKeyFor({})).toBe('auto:unknown:none');
    expect(sessionKeyFor(null)).toBe('auto:unknown:none');
    expect(sessionKeyFor({ time: { period: 'midday' } })).toBe('auto:midday:none');
    expect(sessionKeyFor({ dominantMood: 'sunny' })).toBe('auto:unknown:sunny');
  });
});
