import { describe, expect, it, vi, beforeEach } from 'vitest';

// dj-gate reads the on-air persona's frequency from settings to decide if a
// scheduler tick may fire. Stub settings at the module boundary — that's the
// closest seam to the consumer and avoids dragging in fs + the full schema.
vi.mock('../settings.js', () => ({
  getEffectivePersona: vi.fn(),
}));

import * as settings from '../settings.js';
import { shouldFire } from './dj-gate.js';

const setFrequency = (frequency: string | undefined) => {
  (settings.getEffectivePersona as ReturnType<typeof vi.fn>).mockReturnValue(
    frequency ? { frequency } : null,
  );
};

const at = (h: number, m: number) => new Date(2026, 0, 5, h, m); // a Monday

describe('shouldFire(stationId, now)', () => {
  beforeEach(() => setFrequency('moderate'));

  it('quiet fires only at :45', () => {
    setFrequency('quiet');
    expect(shouldFire('stationId', at(10, 45))).toBe(true);
    expect(shouldFire('stationId', at(10, 15))).toBe(false);
    expect(shouldFire('stationId', at(10, 0))).toBe(false);
    expect(shouldFire('stationId', at(10, 30))).toBe(false);
  });

  it('moderate fires at :15 and :45 only', () => {
    setFrequency('moderate');
    expect(shouldFire('stationId', at(10, 15))).toBe(true);
    expect(shouldFire('stationId', at(10, 45))).toBe(true);
    expect(shouldFire('stationId', at(10, 0))).toBe(false);
    expect(shouldFire('stationId', at(10, 30))).toBe(false);
  });

  it('aggressive fires every quarter hour', () => {
    setFrequency('aggressive');
    for (const m of [0, 15, 30, 45]) {
      expect(shouldFire('stationId', at(10, m))).toBe(true);
    }
    expect(shouldFire('stationId', at(10, 7))).toBe(false);
    expect(shouldFire('stationId', at(10, 44))).toBe(false);
  });

  it('defaults to moderate when no persona is set', () => {
    setFrequency(undefined);
    expect(shouldFire('stationId', at(10, 15))).toBe(true);
    expect(shouldFire('stationId', at(10, 0))).toBe(false);
  });
});

describe('shouldFire(hourly, now)', () => {
  it('quiet fires every other hour (even hours)', () => {
    setFrequency('quiet');
    expect(shouldFire('hourly', at(8, 0))).toBe(true);
    expect(shouldFire('hourly', at(10, 0))).toBe(true);
    expect(shouldFire('hourly', at(9, 0))).toBe(false);
    expect(shouldFire('hourly', at(11, 0))).toBe(false);
  });

  it('moderate and aggressive always fire on the hour', () => {
    for (const f of ['moderate', 'aggressive']) {
      setFrequency(f);
      for (const h of [0, 7, 12, 23]) {
        expect(shouldFire('hourly', at(h, 0))).toBe(true);
      }
    }
  });
});

describe('shouldFire(unknown kind)', () => {
  it('returns true so unrecognised kinds are not silently dropped', () => {
    setFrequency('quiet');
    expect(shouldFire('weather', at(10, 0))).toBe(true);
    expect(shouldFire('whatever', at(3, 27))).toBe(true);
  });
});
