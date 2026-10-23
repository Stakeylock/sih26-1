import { describe, expect, it } from 'vitest';
import { seed } from '../src/data/demo';
import requirementsJson from '../src/data/requirements.json';
import requirementsV2Json from '../src/data/requirements-v2.json';
import type { Requirement } from '../src/domain/integrity';
import { diffRequirements, policyImpact, replayClaimState, reviewTimeline } from '../src/domain/policy';
import type { Application } from '../src/domain/model';

const v1 = requirementsJson as Requirement[];
const v2 = requirementsV2Json as Requirement[];
const workspace = seed();
const app = workspace.applications.find(item => item.id === 'demo-app-0') as Application;
const claims = workspace.claims.filter(claim => claim.application_id === 'demo-app-0');
const deficiencies = workspace.deficiencies.filter(item => item.application_id === 'demo-app-0');
const claimEvidence = workspace.claim_evidence.filter(link => claims.some(claim => claim.id === link.claim_id));

describe('diffRequirements (APH v1 → v2)', () => {
  const diff = diffRequirements(v1, v2);

  it('detects the added, removed, and changed checks', () => {
    expect(diff.added.map(r => r.code)).toEqual(['ACCREDITATION']);
    expect(diff.removed.map(r => r.code)).toEqual(['ACADEMIC_YEAR']);
    expect(diff.changed.map(c => c.code).sort()).toEqual(['FACULTY_STRENGTH', 'FIRE_SAFETY']);
  });

  it('reports which review-relevant field changed', () => {
    const faculty = diff.changed.find(c => c.code === 'FACULTY_STRENGTH')!;
    expect(faculty.fields).toEqual(['statement']);
    const fire = diff.changed.find(c => c.code === 'FIRE_SAFETY')!;
    expect(fire.fields).toEqual(['evidence_types']);
    expect(fire.from.evidence_types).toEqual(['Fire Safety Certificate']);
    expect(fire.to.evidence_types).toEqual(['Fire Safety Certificate', 'Insurance']);
  });

  it('leaves the untouched checks in the unchanged bucket', () => {
    expect(diff.unchanged.sort()).toEqual(['BUILT_UP_AREA', 'INSTITUTION_IDENTITY', 'LAND_OWNERSHIP', 'SANCTIONED_INTAKE', 'STUDENT_FACULTY_RATIO', 'UNDERTAKING']);
    expect(diff.unchanged).not.toContain('FIRE_SAFETY');
  });
});

describe('policyImpact (affected live cases)', () => {
  const diff = diffRequirements(v1, v2);
  const impacts = policyImpact(workspace.applications, workspace.claims, diff);

  it('flags only the claim-bearing case on the matching route', () => {
    expect(impacts.map(item => item.ref_no)).toEqual(['DEMO-2026-1001']);
  });

  it('lists the added, removed, and changed checks for that case', () => {
    const impact = impacts[0];
    expect(impact.added.map(item => item.code)).toEqual(['ACCREDITATION']);
    expect(impact.removed.map(item => item.code)).toEqual(['ACADEMIC_YEAR']);
    expect(impact.changed.map(item => item.code).sort()).toEqual(['FACULTY_STRENGTH', 'FIRE_SAFETY']);
    const fire = impact.changed.find(item => item.code === 'FIRE_SAFETY')!;
    expect(fire.from_evidence).toEqual(['Fire Safety Certificate']);
    expect(fire.to_evidence).toContain('Insurance');
  });

  it('does not leak the new check onto other application types', () => {
    const otherType = workspace.applications.find(item => item.app_type !== 'extension_self_disclosure')!;
    expect(impacts.some(item => item.application_id === otherType.id)).toBe(false);
  });
});

describe('reviewTimeline', () => {
  const entries = reviewTimeline(claims, deficiencies, claimEvidence);

  it('records verifications, the deficiency raise, and evidence links in time order', () => {
    const kinds = entries.reduce<Record<string, number>>((acc, entry) => ({ ...acc, [entry.kind]: (acc[entry.kind] ?? 0) + 1 }), {});
    expect(kinds.verified).toBe(6);
    expect(kinds.deficiency_raised).toBe(1);
    expect(kinds.evidence_linked).toBe(8);
    expect(entries).toHaveLength(15);
  });

  it('is sorted ascending by timestamp', () => {
    for (let i = 1; i < entries.length; i += 1) {
      expect(Date.parse(entries[i].at)).toBeGreaterThanOrEqual(Date.parse(entries[i - 1].at));
    }
  });

  it('carries the recorded reasoning note on each entry', () => {
    const raised = entries.find(entry => entry.kind === 'deficiency_raised')!;
    expect(raised.statement).toContain('Fire safety certificate');
    expect(raised.note).toBeTruthy();
  });
});

describe('replayClaimState', () => {
  const claimsAll = claims;
  const entries = reviewTimeline(claimsAll, deficiencies, claimEvidence);

  it('starts with every claim awaiting review', () => {
    const snapshot = replayClaimState(claimsAll, entries, -1);
    expect(snapshot).toMatchObject({ verified: 0, deficient: 0, unverified: 9, total: 9 });
  });

  it('reconstructs the current state after replaying every entry', () => {
    const snapshot = replayClaimState(claimsAll, entries, entries.length - 1);
    expect(snapshot.verified).toBe(claimsAll.filter(c => ['verified', 'not_applicable'].includes(c.status)).length);
    expect(snapshot.deficient).toBe(1);
    expect(snapshot.unverified).toBe(2);
    expect(snapshot.total).toBe(9);
  });

  it('does not mark the fire claim deficient until its deficiency entry is replayed', () => {
    const fireId = deficiencies[0].claim_id;
    const fireIndex = entries.findIndex(entry => entry.claim_id === fireId && entry.kind === 'deficiency_raised');
    const before = replayClaimState(claimsAll, entries, fireIndex - 1);
    const after = replayClaimState(claimsAll, entries, fireIndex);
    expect(before.statuses[fireId]).toBe('unverified');
    expect(after.statuses[fireId]).toBe('deficient');
  });

  it('evidence links alone do not change a claim status', () => {
    const linkIndex = entries.findIndex(entry => entry.kind === 'evidence_linked');
    const snapshot = replayClaimState(claimsAll, entries, linkIndex);
    expect(Object.values(snapshot.statuses).every(status => status === 'unverified')).toBe(true);
  });
});
