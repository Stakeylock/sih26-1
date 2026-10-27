// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createDemoRepository} from '../src/data/demo';

beforeEach(() => {localStorage.clear();});
afterEach(() => {vi.useRealTimers();});

describe('demo calendar catch-up disclosure', () => {
  it('discloses consequences already derived by an overlapping earlier shift', async () => {
    vi.useFakeTimers({now: new Date('2026-10-27T04:30:00Z')});
    const repo = await createDemoRepository('national_admin');
    await repo.advanceClock(5);
    const again = await repo.advanceClock(9);
    expect(again.days).toBe(9);
    const events = (await repo.workspace()).events.filter(e => e.action === 'demo_calendar_advanced')!;
    expect(events.length).toBeGreaterThan(0);
    const disclosed = events.filter(e => typeof e.payload.catch_up_from === 'string');
    expect(disclosed.length).toBeGreaterThan(0);
    // The boundary names the previous shift's horizon end, in the event detail too.
    for (const e of disclosed) {
      expect(e.payload.catch_up_from).toBe('2026-11-01');
      expect(e.reason).toContain('Partial catch-up');
      expect(e.reason).toContain('2026-11-01');
      expect(e.reason).toContain('No notices were dispatched and no review decision was recorded.');
    }
  });

  it('does not claim catch-up when the new horizon starts after the earlier horizon', async () => {
    vi.useFakeTimers({now: new Date('2026-10-27T04:30:00Z')});
    const repo = await createDemoRepository('national_admin');
    await repo.advanceClock(5);
    vi.setSystemTime(new Date('2026-11-02T04:30:00Z'));
    const report = await repo.advanceClock(3);
    expect(report.days).toBe(3);
    const events = (await repo.workspace()).events.filter(e => e.action === 'demo_calendar_advanced')!;
    expect(events.length).toBeGreaterThan(0);
    expect(events.filter(e => 'catch_up_from' in e.payload || /Partial catch-up/.test(e.reason))).toHaveLength(0);
    for (const e of events) expect(e.reason).toContain('No notices were dispatched and no review decision was recorded.');
  });

  it('leaves a first shift without any catch-up disclosure', async () => {
    vi.useFakeTimers({now: new Date('2026-10-27T04:30:00Z')});
    const repo = await createDemoRepository('national_admin');
    const report = await repo.advanceClock(5);
    expect(report.days).toBe(5);
    const events = (await repo.workspace()).events.filter(e => e.action === 'demo_calendar_advanced')!;
    expect(events.length).toBeGreaterThan(0);
    expect(events.filter(e => 'catch_up_from' in e.payload || /Partial catch-up/.test(e.reason))).toHaveLength(0);
  });
});
