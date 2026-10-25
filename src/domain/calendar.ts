import type {AnalysisCalendar} from './intelligence';

const FIXED_NATIONAL = ['01-26', '08-15', '10-02'] as const;
const FIRST_YEAR = 2026;
const LAST_YEAR = 2036;

export function syntheticWorkingCalendar(): AnalysisCalendar {
  const holidays: string[] = [];
  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    for (const monthDay of FIXED_NATIONAL) holidays.push(`${year}-${monthDay}`);
  }
  return {
    id: 'demo-fixed-national',
    version: 1,
    label: 'Synthetic weekdays calendar; fixed national holidays excluded',
    basis: 'weekdays',
    timezone: 'Asia/Kolkata',
    holidays,
    source: 'demo://calendar/fixed-national/v1',
  };
}

export function workspaceHolidays(): readonly string[] {
  return syntheticWorkingCalendar().holidays;
}
