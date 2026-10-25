const DAY = 86400000;
const STORAGE_KEY = 'flowpilot-demo-clock-v1';
export const DEMO_CLOCK_EVENT = 'demo-clock-change';
const OFFSET_CAP = 3650;

const demoMode = (): boolean => import.meta.env.VITE_APP_MODE === 'demo';

export function demoClockOffset(): number {
  if (!demoMode()) return 0;
  try {
    const value = Number(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '0'));
    return Number.isInteger(value) && value > 0 && value <= OFFSET_CAP ? value : 0;
  } catch {
    return 0;
  }
}

export function demoNow(now: number = Date.now()): number {
  return now + demoClockOffset() * DAY;
}

export function advanceDemoClock(days: number): void {
  if (!demoMode()) return;
  const next = demoClockOffset() + Math.floor(days);
  if (!Number.isInteger(next) || next <= 0 || next > OFFSET_CAP) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(DEMO_CLOCK_EVENT));
}

export function resetDemoClock(): void {
  if (!demoMode()) return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(DEMO_CLOCK_EVENT));
}
