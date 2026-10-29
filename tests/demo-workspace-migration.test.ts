// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createDemoRepository } from '../src/data/demo';

// Mirrors src/data/demo.ts so this test breaks if the storage key or format changes.
const STORAGE = 'clauseway-isolated-demo-v12';

describe('demo workspace migration tolerates legacy saved state', () => {
  beforeEach(() => { localStorage.removeItem(STORAGE); });
  afterEach(() => { localStorage.removeItem(STORAGE); });

  it('loads a format-12 workspace missing EVC arrays without crashing', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const workspace = await repo.workspace();
    // Strip only the EVC arrays, simulating a legacy format-12 save.
    const { evc_visits, evc_members, evc_schedule_history, evc_unavailability, ...legacy } = workspace;
    localStorage.setItem(STORAGE, JSON.stringify({ format: 12, workspace: legacy }));

    const recovered = await createDemoRepository('scrutiny_officer');
    const restored = await recovered.workspace();
    expect(restored.applications.length).toBe(workspace.applications.length);
    expect(restored.evc_visits).toEqual([]);
    expect(restored.evc_members).toEqual([]);
    expect(restored.evc_schedule_history).toEqual([]);
    expect(restored.evc_unavailability).toEqual([]);
  });
});
