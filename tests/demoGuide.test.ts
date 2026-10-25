import { describe, expect, it } from 'vitest';
import { seed } from '../src/data/demo';
import { guideSteps } from '../src/ui/demoGuide';

const workspace = seed();

describe('guideSteps', () => {
  it('produces the six armed walkthrough steps in demo order', () => {
    expect(guideSteps(workspace).map(step => step.id)).toEqual(['correction', 'scrutiny', 'inspection', 'decision', 'obligation', 'audit']);
  });

  it('arms the correction loop on the seeded open deficiency for the institution role', () => {
    const step = guideSteps(workspace).find(item => item.id === 'correction')!;
    expect(step.armed).toBe(true);
    expect(step.role).toBe('institution');
    expect(step.route).toBe(`case/${'demo-app-0'}`);
    expect(step.armedBecause).toContain('DEMO-2026-1001');
    expect(step.unmetNote).toBeNull();
  });

  it('arms scrutiny on the case whose claims still need a human review', () => {
    const step = guideSteps(workspace).find(item => item.id === 'scrutiny')!;
    expect(step.armed).toBe(true);
    expect(step.role).toBe('scrutiny_officer');
    expect(step.armedBecause).toMatch(/3 claims? .*need|3 claims need/);
  });

  it('arms inspection planning on the next synthetic visit', () => {
    const step = guideSteps(workspace).find(item => item.id === 'inspection')!;
    expect(step.armed).toBe(true);
    expect(step.role).toBe('evc_coordinator');
    expect(step.route).toBe('visits');
  });

  it('arms the decision desk on the case waiting at final decision', () => {
    const step = guideSteps(workspace).find(item => item.id === 'decision')!;
    expect(step.armed).toBe(true);
    expect(step.role).toBe('regional_officer');
    expect(step.route).toBe('case/demo-app-3');
  });

  it('arms the obligation register on an overdue continuing condition', () => {
    const step = guideSteps(workspace).find(item => item.id === 'obligation')!;
    expect(step.armed).toBe(true);
    expect(step.role).toBe('national_admin');
    expect(step.route).toBe('compliance');
    expect(step.armedBecause).toMatch(/overdue/);
  });

  it('arms the audit step from actual recorded event counts', () => {
    const step = guideSteps(workspace).find(item => item.id === 'audit')!;
    expect(step.armed).toBe(true);
    expect(step.role).toBe('national_admin');
    expect(step.route).toBe('audit');
    expect(step.armedBecause).toMatch(/\d+ recorded event/);
  });

  it('reports an honest unmet note instead of fabricating work when nothing is open', () => {
    const empty = { ...workspace, deficiencies: [], obligations: [], visits: [], applications: workspace.applications.filter(app => app.status === 'approved'), claims: workspace.claims.filter(claim => claim.status !== 'unverified' && claim.status !== 'deficient') };
    const steps = guideSteps(empty);
    const correction = steps.find(item => item.id === 'correction')!
    const decision = steps.find(item => item.id === 'decision')!;
    const obligation = steps.find(item => item.id === 'obligation')!;
    const scrutiny = steps.find(item => item.id === 'scrutiny')!;
    expect(correction.armed).toBe(false);
    expect(correction.armedBecause).toBeNull();
    expect(correction.unmetNote).toMatch(/open correction/i);
    expect(decision.armed).toBe(false);
    expect(decision.unmetNote).toMatch(/final decision/i);
    expect(obligation.armed).toBe(false);
    expect(obligation.unmetNote).toMatch(/continuing obligation/i);
    expect(scrutiny.armed).toBe(false);
  });

  it('never invents a reference that is not in the workspace', () => {
    for (const step of guideSteps(workspace)) {
      const refMatch = step.armedBecause?.match(/DEMO-\d{4}-\d{4}/);
      if (refMatch) {
        expect(workspace.applications.map(app => app.ref_no)).toContain(refMatch[0]);
      }
    }
  });
});
