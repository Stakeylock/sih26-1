import { describe, expect, it } from 'vitest';
import { computeDualClock, isWeekend, isWorkingDay, workingDaysBetween, workingDaysUntil } from '../src/domain/clock';

// 2026-01-01 is a Thursday, so: Jan2 Fri, Jan3 Sat, Jan4 Sun, Jan5 Mon, Jan6 Tue, Jan7 Wed, Jan8 Thu, Jan9 Fri.
const fri = new Date(2026, 0, 2, 12);
const sat = new Date(2026, 0, 3, 12);
const mon = new Date(2026, 0, 5, 12);
const thu = new Date(2026, 0, 8, 12);
const friNext = new Date(2026, 0, 9, 12);

describe('isWeekend / isWorkingDay', () => {
  it('flags Saturday and Sunday as weekend', () => {
    expect(isWeekend(sat)).toBe(true);
    expect(isWeekend(new Date(2026, 0, 4, 12))).toBe(true); // Sunday
    expect(isWeekend(mon)).toBe(false);
  });

  it('excludes weekends and holidays from working days', () => {
    expect(isWorkingDay(mon)).toBe(true);
    expect(isWorkingDay(sat)).toBe(false);
    expect(isWorkingDay(new Date(2026, 0, 6, 12), ['2026-01-06'])).toBe(false); // holiday Tuesday
    expect(isWorkingDay(new Date(2026, 0, 6, 12))).toBe(true);
  });
});

describe('workingDaysBetween', () => {
  it('skips the weekend between Friday and Monday', () => {
    expect(workingDaysBetween(fri, mon)).toBe(1); // only Monday counts
  });

  it('counts contiguous weekdays', () => {
    expect(workingDaysBetween(mon, friNext)).toBe(4); // Tue..Fri
  });

  it('is signed when the range is reversed', () => {
    expect(workingDaysBetween(mon, fri)).toBe(-1);
    expect(workingDaysBetween(fri, fri)).toBe(0);
  });
});

describe('workingDaysUntil', () => {
  it('returns null when there is no deadline', () => {
    expect(workingDaysUntil(null, fri.getTime())).toBeNull();
    expect(workingDaysUntil(undefined, fri.getTime())).toBeNull();
  });

  it('counts only working days to the deadline', () => {
    expect(workingDaysUntil(mon.toISOString(), fri.getTime())).toBe(1);
  });

  it('goes negative when overdue', () => {
    expect(workingDaysUntil(fri.toISOString(), mon.getTime())).toBe(-1);
  });
});

describe('computeDualClock', () => {
  it('attributes all time to the officer when there is no deficiency', () => {
    const clock = computeDualClock({ startAt: mon.toISOString(), deficiencies: [] }, thu.getTime());
    expect(clock.paused).toBe(false);
    expect(clock.institutionDays).toBe(0);
    expect(clock.officerDays).toBe(clock.totalWorkingDays);
    expect(clock.officerDays + clock.institutionDays).toBe(clock.totalWorkingDays);
  });

  it('routes an open deficiency window to the institution and pauses the officer clock', () => {
    const clock = computeDualClock(
      { startAt: mon.toISOString(), deficiencies: [{ raised_at: mon.toISOString(), resolved_at: null, status: 'open' }] },
      thu.getTime(),
    );
    expect(clock.paused).toBe(true);
    expect(clock.institutionDays).toBeGreaterThan(0);
    expect(clock.officerDays + clock.institutionDays).toBe(clock.totalWorkingDays);
    expect(clock.institutionDays).toBeLessThanOrEqual(clock.totalWorkingDays);
  });

  it('only counts the deficiency up to its resolution, then resumes the officer clock', () => {
    const clock = computeDualClock(
      { startAt: mon.toISOString(), deficiencies: [{ raised_at: mon.toISOString(), resolved_at: new Date(2026, 0, 6, 12).toISOString(), status: 'resolved' }] },
      friNext.getTime(),
    );
    expect(clock.paused).toBe(false);
    expect(clock.institutionDays).toBeGreaterThan(0);
    expect(clock.officerDays).toBeGreaterThan(0);
    expect(clock.officerDays + clock.institutionDays).toBe(clock.totalWorkingDays);
  });

  it('merges overlapping deficiency windows instead of double counting', () => {
    const two = computeDualClock(
      { startAt: mon.toISOString(), deficiencies: [
        { raised_at: mon.toISOString(), resolved_at: thu.toISOString(), status: 'resolved' },
        { raised_at: new Date(2026, 0, 6, 12).toISOString(), resolved_at: friNext.toISOString(), status: 'resolved' },
      ] },
      friNext.getTime(),
    );
    const single = computeDualClock(
      { startAt: mon.toISOString(), deficiencies: [{ raised_at: mon.toISOString(), resolved_at: friNext.toISOString(), status: 'resolved' }] },
      friNext.getTime(),
    );
    expect(two.institutionDays).toBe(single.institutionDays);
  });
});
