// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createDemoRepository } from '../src/data/demo';

const STORAGE = 'clauseway-isolated-demo-v12';

describe('inspection evidence capture', () => {
  beforeEach(() => { localStorage.removeItem(STORAGE); });
  afterEach(() => { localStorage.removeItem(STORAGE); });

  it('returns seeded evidence for a completed EVC visit', async () => {
    const repo = await createDemoRepository('national_admin');
    const evidence = await repo.getInspectionEvidence('demo-evc-visit-9');
    expect(evidence.length).toBe(1);
    expect(evidence[0].status).toBe('submitted');
    expect(evidence[0].observations).toContain('Fire extinguishers');
    expect(evidence[0].submitted_by).toBe('demo-evc-member-1');
  });

  it('lets a coordinator capture and submit evidence for an upcoming visit', async () => {
    const repo = await createDemoRepository('evc_coordinator');
    const visit = 'demo-evc-visit-2';
    const before = await repo.getInspectionEvidence(visit);
    expect(before.length).toBe(0);

    const captured = await repo.captureInspectionEvidence(
      (await repo.workspace()).applications.find(a => a.id === 'demo-app-2')!,
      visit,
      {
        captured_at: new Date().toISOString(),
        location: { latitude: 28.6139, longitude: 77.2090, accuracy: 6, address: 'Outer Ring Road, New Delhi' },
        observations: 'Fire exits blocked, extinguisher pressure low.',
        voice_memo: 'Voice memo: exits blocked, extinguisher needs service.',
        documents: [],
      },
    );
    expect(captured.evidence_id).toBeDefined();

    const drafts = await repo.getInspectionEvidence(visit);
    expect(drafts.length).toBe(1);
    expect(drafts[0].status).toBe('draft');

    await repo.submitInspectionEvidence(captured.evidence_id);
    const submitted = await repo.getInspectionEvidence(visit);
    expect(submitted.length).toBe(1);
    expect(submitted[0].status).toBe('submitted');
    expect(submitted[0].submitted_by).not.toBeNull();
  });

  it('rejects capture by a non-member non-manager', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const app = (await repo.workspace()).applications.find(a => a.id === 'demo-app-2')!;
    await expect(repo.captureInspectionEvidence(app, 'demo-evc-visit-2', {
      captured_at: new Date().toISOString(),
      location: { latitude: 0, longitude: 0, accuracy: null, address: null },
      observations: 'short',
      voice_memo: null,
      documents: [],
    })).rejects.toThrow();
  });

  it('rejects capture by an invited (not accepted) member', async () => {
    const repo = await createDemoRepository('evc_member');
    const app = (await repo.workspace()).applications.find(a => a.id === 'demo-app-2')!;
    await expect(repo.captureInspectionEvidence(app, 'demo-evc-visit-2', {
      captured_at: new Date().toISOString(),
      location: { latitude: 0, longitude: 0, accuracy: null, address: null },
      observations: 'Long enough observations text here.',
      voice_memo: null,
      documents: [],
    })).rejects.toThrow();
  });

  it('rejects submitting already-submitted evidence', async () => {
    const repo = await createDemoRepository('evc_coordinator');
    const evidence = await repo.getInspectionEvidence('demo-evc-visit-9');
    expect(evidence.length).toBe(1);
    await expect(repo.submitInspectionEvidence(evidence[0].id)).rejects.toThrow();
  });
});
