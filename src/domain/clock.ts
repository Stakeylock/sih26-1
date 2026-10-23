import type { Deficiency } from './integrity';

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** `holidays` are `YYYY-MM-DD` keys that do not count as working days. */
export function isWorkingDay(date: Date, holidays: readonly string[] = []): boolean {
  return !isWeekend(date) && !holidays.includes(dateKey(date));
}

/** Signed working days from `from` to `to` (positive when `to` is later). Skips weekends/holidays. */
export function workingDaysBetween(from: Date | string | number, to: Date | string | number, holidays: readonly string[] = []): number {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const sign = end.getTime() >= start.getTime() ? 1 : -1;
  const low = sign > 0 ? start : end;
  const high = sign > 0 ? end : start;
  let count = 0;
  const cursor = new Date(low);
  cursor.setHours(0, 0, 0, 0);
  const target = new Date(high);
  target.setHours(0, 0, 0, 0);
  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor, holidays)) count += 1;
  }
  return sign * count;
}

/** Working days until a deadline; negative when overdue. Returns null when there is no deadline. */
export function workingDaysUntil(due: string | null | undefined, now = Date.now(), holidays: readonly string[] = []): number | null {
  if (!due) return null;
  return workingDaysBetween(now, due, holidays);
}

export interface DualClock {
  /** Working days the case has been with the authority (scrutiny / decision). */
  officerDays: number;
  /** Working days the case has been with the institution (deficiency response window). */
  institutionDays: number;
  /** True while an open/escalated deficiency currently holds the clock. */
  paused: boolean;
  totalWorkingDays: number;
}

function mergeWindows(windows: [number, number][]): [number, number][] {
  const sorted = windows.filter(([, end]) => end > 0).sort((left, right) => left[0] - right[0]);
  const merged: [number, number][] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window[0] <= last[1]) last[1] = Math.max(last[1], window[1]);
    else merged.push([...window] as [number, number]);
  }
  return merged;
}

/**
 * Dual accountability: partitions the working days since submission into officer-processing
 * time versus institution deficiency-response time. Derived from FlowPilot's own deficiency
 * records, so the officer clock is effectively paused (institution's time) whenever a claim
 * deficiency is open. Inspired by Ao-chuba's `computeDualClock` and SAKSHAM's
 * "who is responsible for this delay?" — but bound to our claim/deficiency loop.
 */
export function computeDualClock(
  input: { startAt: string | null | undefined; deficiencies: readonly Pick<Deficiency, 'raised_at' | 'resolved_at' | 'status'>[]; holidays?: readonly string[] },
  now = Date.now(),
): DualClock {
  const holidays = input.holidays ?? [];
  const startMs = Date.parse(input.startAt ?? '') || now;
  const totalWorkingDays = Math.max(0, workingDaysBetween(startMs, now, holidays));

  const windows: [number, number][] = input.deficiencies.map(deficiency => {
    const raised = Date.parse(deficiency.raised_at);
    const end = deficiency.resolved_at ? Date.parse(deficiency.resolved_at) : now;
    return [Math.max(startMs, Number.isNaN(raised) ? startMs : raised), Math.min(now, Number.isNaN(end) ? now : end)] as [number, number];
  });

  const institutionDays = mergeWindows(windows).reduce((sum, [from, to]) => sum + Math.max(0, workingDaysBetween(from, to, holidays)), 0);
  const clampedInstitution = Math.min(institutionDays, totalWorkingDays);

  return {
    officerDays: Math.max(0, totalWorkingDays - clampedInstitution),
    institutionDays: clampedInstitution,
    paused: input.deficiencies.some(deficiency => ['open', 'escalated'].includes(deficiency.status)),
    totalWorkingDays,
  };
}
