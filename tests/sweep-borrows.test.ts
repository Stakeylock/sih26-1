import {describe, expect, it} from 'vitest';
import {syntheticWorkingCalendar, workspaceHolidays} from '../src/domain/calendar';
import {calendarSchema} from '../src/domain/intelligence';
import {ageingBuckets} from '../src/domain/ageing';
import {activeConflictsFor} from '../src/domain/planning';
import {isWorkingDay, workingDaysBetween} from '../src/domain/clock';
import type {ExpertConflict} from '../src/domain/planning';

const calendar = syntheticWorkingCalendar();

const DAY = 86400000;
function submittedWorkingDaysAgo(workingDays: number, now: number, holidays: readonly string[] = []): string {
  for (let back = 0; back <= workingDays * 2 + 10; back++) {
    const at = new Date(now - back * DAY);
    if (workingDaysBetween(at, now, holidays) === workingDays) return at.toISOString();
  }
  throw new Error('no fixture date found');
}


describe('syntheticWorkingCalendar', () => {
  it('is a schema-valid weekday calendar with no preloaded holiday assumptions', () => {
    const parsed = calendarSchema.parse(calendar);
    expect(parsed.id).toBe('demo-weekdays');
    expect(parsed.basis).toBe('weekdays');
    expect(parsed.timezone).toBe('Asia/Kolkata');
    expect(calendar.holidays).toEqual([]);
    expect(calendar.source.startsWith('demo://calendar/')).toBe(true);
    expect(calendar.label.length).toBeGreaterThanOrEqual(3);
  });

  it('does not invent workspace holiday exclusions', () => {
    expect([...workspaceHolidays()]).toEqual([]);
  });
});

describe('ageingBuckets', () => {
  const now = Date.parse('2026-10-25T09:00:00Z');
  it('buckets cases by working days since submission and keeps unstated submissions out', () => {
    const apps = [
      {submitted_at: submittedWorkingDaysAgo(5, now)},
      {submitted_at: submittedWorkingDaysAgo(16, now)},
      {submitted_at: submittedWorkingDaysAgo(31, now)},
      {submitted_at: submittedWorkingDaysAgo(46, now)},
      {submitted_at: null},
      {submitted_at: 'not-a-date'},
    ] as const;
    const result = ageingBuckets([...apps], now, []);
    expect(result.under15).toBe(1);
    expect(result.from15to30).toBe(1);
    expect(result.from30to45).toBe(1);
    expect(result.over45).toBe(1);
    expect(result.notSubmitted).toBe(2);
    expect(result.basis.toLowerCase()).toContain('working days since submission');
  });

  it('lands calendar dates and holidays inside the buckets instead of shipping weeks empty', () => {
    const at = (d: number) => submittedWorkingDaysAgo(d, now);
    expect(ageingBuckets([{submitted_at: at(14)}], now, []).under15).toBe(1);
    expect(ageingBuckets([{submitted_at: at(15)}], now, []).from15to30).toBe(1);
    expect(ageingBuckets([{submitted_at: at(29)}], now, []).from15to30).toBe(1);
    expect(ageingBuckets([{submitted_at: at(30)}], now, []).from30to45).toBe(1);
    expect(ageingBuckets([{submitted_at: at(45)}], now, []).over45).toBe(1);
  });

  it('honours supplied holidays so a holiday does not inflate age', () => {
    const submitted = submittedWorkingDaysAgo(10, now);
    expect(ageingBuckets([{submitted_at: submitted}], now, []).under15).toBe(1);
    expect(ageingBuckets([{submitted_at: submitted}], now, ['2026-10-20']).under15).toBe(1);
  });
});

const conflicts: ExpertConflict[] = [
  {id: 'c1', expert_id: 'e1', institution_id: 'inst-1', reason: 'Affiliated faculty', active: true, recorded_by: 'u', created_at: '2026-10-01'},
  {id: 'c2', expert_id: 'e2', institution_id: 'inst-1', reason: 'Resolved earlier', active: false, recorded_by: 'u', created_at: '2026-10-02'},
  {id: 'c3', expert_id: 'e3', institution_id: 'inst-2', reason: 'Other institution', active: true, recorded_by: 'u', created_at: '2026-10-03'},
] as unknown as ExpertConflict[];

describe('activeConflictsFor', () => {
  it('counts only active declarations against the requested institution', () => {
    const rows = activeConflictsFor(conflicts, 'inst-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].expert_id).toBe('e1');
    expect(activeConflictsFor(conflicts, null)).toEqual([]);
    expect(activeConflictsFor(undefined, 'inst-1')).toEqual([]);
  });
});
