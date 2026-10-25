import {workingDaysBetween} from './clock';

export interface AgeingSummary {
  under15: number;
  from15to30: number;
  from30to45: number;
  over45: number;
  notSubmitted: number;
  basis: string;
}

export function ageingBuckets(apps: readonly {submitted_at: string | null}[], now: number, holidays: readonly string[] = []): AgeingSummary {
  const result: AgeingSummary = {under15: 0, from15to30: 0, from30to45: 0, over45: 0, notSubmitted: 0, basis: 'Working days since submission; recorded dates only, no attention score.'};
  for (const app of apps) {
    if (!app.submitted_at || !Number.isFinite(Date.parse(app.submitted_at))) {
      result.notSubmitted++;
      continue;
    }
    const age = workingDaysBetween(app.submitted_at, now, holidays);
    if (age < 0 || !Number.isFinite(age)) {
      result.notSubmitted++;
      continue;
    }
    if (age < 15) result.under15++;
    else if (age < 30) result.from15to30++;
    else if (age < 45) result.from30to45++;
    else result.over45++;
  }
  return result;
}
