// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const DAY = 86400000;
const key = 'clauseway-demo-clock-v1';
const event = 'demo-clock-change';

let virtualClock: typeof import('../src/domain/virtualClock');

beforeEach(() => {
  localStorage.clear();
  delete import.meta.env.VITE_APP_MODE;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadWithMode(mode?: string) {
  vi.stubEnv('VITE_APP_MODE', mode ?? '');
  virtualClock = await import('../src/domain/virtualClock');
}

describe('virtualClock', () => {
  it('returns real time and zero offset outside demo mode even with stored offset', async () => {
    localStorage.setItem(key, JSON.stringify(30));
    await loadWithMode(undefined);
    const now = Date.now();
    expect(virtualClock.demoClockOffset()).toBe(0);
    expect(Math.abs(virtualClock.demoNow(now) - now)).toBe(0);
  });

  it('defaults to zero offset and real now in demo mode', async () => {
    await loadWithMode('demo');
    expect(virtualClock.demoClockOffset()).toBe(0);
    const now = Date.now();
    expect(virtualClock.demoNow(now)).toBe(now);
  });

  it('adds integer-day offset up to the bound in demo mode', async () => {
    await loadWithMode('demo');
    virtualClock.advanceDemoClock(7);
    expect(virtualClock.demoClockOffset()).toBe(7);
    expect(virtualClock.demoNow(1000000)).toBe(1000000 + 7 * DAY);
    virtualClock.advanceDemoClock(3);
    expect(virtualClock.demoClockOffset()).toBe(10);
    virtualClock.advanceDemoClock(3640);
    expect(virtualClock.demoClockOffset()).toBe(3650);
  });

  it('ignores non-positive and out-of-range advances', async () => {
    await loadWithMode('demo');
    virtualClock.advanceDemoClock(0);
    virtualClock.advanceDemoClock(-5);
    virtualClock.advanceDemoClock(3651);
    expect(virtualClock.demoClockOffset()).toBe(0);
    expect(localStorage.getItem(key)).toBe(null);
  });

  it('resets and tolerates corrupt stored values', async () => {
    await loadWithMode('demo');
    virtualClock.advanceDemoClock(5);
    virtualClock.resetDemoClock();
    expect(virtualClock.demoClockOffset()).toBe(0);
    expect(localStorage.getItem(key)).toBe(null);
    localStorage.setItem(key, '{"oops":true');
    expect(virtualClock.demoClockOffset()).toBe(0);
    localStorage.setItem(key, JSON.stringify(999999));
    expect(virtualClock.demoClockOffset()).toBe(0);
  });

  it('dispatches a change event on advance and reset', async () => {
    await loadWithMode('demo');
    const seen: number[] = [];
    window.addEventListener(event, () => seen.push(virtualClock.demoClockOffset()));
    virtualClock.advanceDemoClock(2);
    virtualClock.resetDemoClock();
    expect(seen).toEqual([2, 0]);
  });
});
