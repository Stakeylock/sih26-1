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

describe('review snapshots',()=>{
  const events=workspace.events.filter(event=>event.application_id===app.id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)).map((event,index)=>({...event,sequence:index+1}));
  const entries=reviewTimeline(events);
  it('keeps legacy actions as records without inventing their earlier claim state',()=>{
    expect(entries[0].snapshot).toBeNull();
    expect(replayClaimState(claims,entries,0)).toBeNull();
  });
  it('shows the captured baseline, rather than claiming reconstructed prior reviews',()=>{
    expect(entries.at(-1)?.baseline).toBe(true);
    expect(replayClaimState(claims,entries,entries.length-1)).toMatchObject({verified:6,current:6,deficient:1,unverified:2,total:9});
  });
  it('retains the captured snapshot after current claim rows change',()=>{
    const original=structuredClone(claims[0]);Object.assign(claims[0],{status:'deficient',verified_at:null});
    expect(replayClaimState(claims,entries,entries.length-1)?.verified).toBe(6);
    Object.assign(claims[0],original);
  });
});
