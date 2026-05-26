import { describe, expect, it } from 'vitest';

import {
  getTimeContext,
  getDateContext,
  getClockContext,
  getFestivalContext,
} from './context.js';

// Test only the pure date-driven helpers. `getFullContext` is intentionally
// out of scope — it pulls weather over HTTP, hits Icecast listener cache, and
// reads settings; when something inside it changes we'll add a test then,
// using vi.mock at those boundaries.

const monday = (h: number, m = 0) => new Date(2026, 4, 25, h, m); // 2026-05-25, a Monday

describe('getTimeContext', () => {
  it('maps morning hours to the morning show', () => {
    expect(getTimeContext(monday(9, 30)).show).toBe('morning');
    expect(getTimeContext(monday(9, 30)).mood).toBe('morning');
  });

  it('drive-time runs 17:00 — 18:59', () => {
    expect(getTimeContext(monday(17, 0)).show).toBe('drive-time');
    expect(getTimeContext(monday(18, 59)).show).toBe('drive-time');
    expect(getTimeContext(monday(19, 0)).show).toBe('evening');
  });

  it('late-evening straddles midnight (22:00 — 00:59)', () => {
    expect(getTimeContext(monday(22, 0)).show).toBe('late');
    expect(getTimeContext(monday(0, 30)).show).toBe('late');
    expect(getTimeContext(monday(1, 0)).show).toBe('graveyard');
  });
});

describe('getDateContext', () => {
  it('exposes ISO date, day-of-week, month label, and meteorological season', () => {
    const ctx = getDateContext(new Date(2026, 11, 25, 10, 0)); // 2026-12-25
    expect(ctx.iso).toBe('2026-12-25');
    expect(ctx.dayLabel).toBe('Friday');
    expect(ctx.monthLabel).toBe('December');
    expect(ctx.dayOfMonth).toBe(25);
    expect(ctx.season).toBe('winter');
  });

  it('classifies seasons by meteorological convention (N hemisphere)', () => {
    expect(getDateContext(new Date(2026, 2, 15)).season).toBe('spring'); // March
    expect(getDateContext(new Date(2026, 6, 15)).season).toBe('summer'); // July
    expect(getDateContext(new Date(2026, 9, 15)).season).toBe('autumn'); // October
    expect(getDateContext(new Date(2026, 11, 15)).season).toBe('winter'); // December
  });
});

describe('getClockContext', () => {
  it('zero-pads hh:mm', () => {
    expect(getClockContext(monday(7, 5)).hhmm).toBe('07:05');
    expect(getClockContext(monday(23, 59)).hhmm).toBe('23:59');
  });

  it('flags Saturday and Sunday as weekend', () => {
    const sat = new Date(2026, 4, 30, 10, 0); // 2026-05-30
    const sun = new Date(2026, 4, 31, 10, 0);
    expect(getClockContext(sat).isWeekend).toBe(true);
    expect(getClockContext(sun).isWeekend).toBe(true);
    expect(getClockContext(monday(10, 0)).isWeekend).toBe(false);
  });

  it('flags 00:00 — 04:59 as late night', () => {
    expect(getClockContext(monday(2, 0)).isLateNight).toBe(true);
    expect(getClockContext(monday(4, 59)).isLateNight).toBe(true);
    expect(getClockContext(monday(5, 0)).isLateNight).toBe(false);
  });

  it('flags both commute windows', () => {
    expect(getClockContext(monday(8, 0)).isCommute).toBe(true);   // morning
    expect(getClockContext(monday(18, 0)).isCommute).toBe(true);  // evening
    expect(getClockContext(monday(7, 29)).isCommute).toBe(false); // just before
    expect(getClockContext(monday(13, 0)).isCommute).toBe(false); // midday
  });
});

describe('getFestivalContext', () => {
  it('returns null for ordinary dates', () => {
    expect(getFestivalContext(new Date(2026, 5, 7))).toBeNull(); // 2026-06-07
  });

  it('matches a fixed-date festival exactly', () => {
    const halloween = getFestivalContext(new Date(2026, 9, 31)); // 2026-10-31
    expect(halloween?.name).toBe('Halloween');
    expect(halloween?.mood).toBe('festival');
  });

  it('honours the multi-day window around major festivals', () => {
    expect(getFestivalContext(new Date(2026, 11, 24))?.name).toBe('Christmas'); // Dec 24
    expect(getFestivalContext(new Date(2026, 11, 25))?.name).toBe('Christmas'); // Dec 25
    expect(getFestivalContext(new Date(2026, 11, 26))?.name).toBe('Christmas'); // Dec 26 — wins via window
  });
});
