// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { createDemoRepository } from '../src/data/demo';

const STORAGE = 'flowpilot-isolated-demo-v12';

describe('signal disposition', () => {
  beforeEach(() => { localStorage.removeItem(STORAGE); });
  async function openSignal(repo: Awaited<ReturnType<typeof createDemoRepository>>) {
    const workspace = await repo.workspace();
    const app = workspace.applications.find(item =>
      workspace.integrity_signals.some(signal => signal.application_id === item.id && signal.disposition === 'open'),
    );
    if (!app) throw new Error('No application with an open integrity signal in the seed.');
    const signal = workspace.integrity_signals.find(
      item => item.application_id === app.id && item.disposition === 'open',
    );
    if (!signal) throw new Error('No open integrity signal found.');
    return { app, signal };
  }

  it('lets a scrutiny officer disposition an open signal and records the audit event', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const { signal } = await openSignal(repo);
    await repo.dispositionSignal(signal.id, 'confirmed', 'Synthetic review reason: the duplicate hash belongs to a corrected resubmission.');
    const updated = (await repo.workspace()).integrity_signals.find(item => item.id === signal.id)!;
    expect(updated.disposition).toBe('confirmed');
    expect(updated.disposition_reason).toBe('Synthetic review reason: the duplicate hash belongs to a corrected resubmission.');
    expect(updated.disposed_by).not.toBeNull();
    expect(updated.disposed_at).not.toBeNull();
  });

  it('lets a regional officer disposition a signal as explained', async () => {
    const repo = await createDemoRepository('regional_officer');
    const { signal } = await openSignal(repo);
    await repo.dispositionSignal(signal.id, 'explained', 'Synthetic explanation: the document predates the application window.');
    const updated = (await repo.workspace()).integrity_signals.find(item => item.id === signal.id)!;
    expect(updated.disposition).toBe('explained');
    expect(updated.disposed_by).not.toBeNull();
  });

  it('lets a national admin dismiss a signal', async () => {
    const repo = await createDemoRepository('national_admin');
    const { signal } = await openSignal(repo);
    await repo.dispositionSignal(signal.id, 'dismissed', 'Synthetic dismissal reason: signal was raised on a superseded draft.');
    const updated = (await repo.workspace()).integrity_signals.find(item => item.id === signal.id)!;
    expect(updated.disposition).toBe('dismissed');
    expect(updated.disposed_by).not.toBeNull();
  });

  it('rejects a reason shorter than 10 characters', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const { signal } = await openSignal(repo);
    await expect(repo.dispositionSignal(signal.id, 'dismissed', 'too short')).rejects.toThrow();
  });

  it('rejects an invalid disposition', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const { signal } = await openSignal(repo);
    await expect(repo.dispositionSignal(signal.id, 'bogus' as never, 'A valid length reason here.')).rejects.toThrow();
  });

  it('keeps the signal unchanged when the disposition call fails', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const { signal } = await openSignal(repo);
    await expect(repo.dispositionSignal(signal.id, 'dismissed', 'nope')).rejects.toThrow();
    const untouched = (await repo.workspace()).integrity_signals.find(item => item.id === signal.id)!;
    expect(untouched.disposition).toBe('open');
    expect(untouched.disposition_reason).toBeNull();
    expect(untouched.disposed_by).toBeNull();
    expect(untouched.disposed_at).toBeNull();
  });
});
