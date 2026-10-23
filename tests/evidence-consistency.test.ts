import { describe, expect, it } from 'vitest';
import { seed } from '../src/data/demo';
import { compareEvidenceVersions, detectContradictions, replacementImpact } from '../src/domain/integrity';
import type { Application, Claim } from '../src/domain/model';

const workspace = seed();
const app = workspace.applications.find(item => item.id === 'demo-app-0') as Application;
const claims = workspace.claims.filter(claim => claim.application_id === 'demo-app-0') as Claim[];
const claimEvidence = workspace.claim_evidence.filter(link => claims.some(claim => claim.id === link.claim_id));
const documents = workspace.documents.filter(document => document.application_id === 'demo-app-0');
const today = new Date().toISOString().slice(0, 10);

describe('contradiction seed', () => {
  it('declares a numeric faculty count and extracts a different roster count', () => {
    expect(app.form_data.faculty_count).toBe('12');
    const roster = documents.find(document => document.id === 'demo-doc-demo-app-0-2')!;
    expect(roster.extracted).toEqual({ faculty_count: '10' });
  });
});

describe('detectContradictions', () => {
  const contradictions = detectContradictions(app, claims, claimEvidence, documents);

  it('flags every claim linked to the roster where the declaration disagrees', () => {
    expect(contradictions.map(item => item.claim_id).sort()).toEqual(['demo-claim-3', 'demo-claim-4']);
  });

  it('shows both sources for human review (declared 12 vs roster 10)', () => {
    for (const item of contradictions) {
      expect(item.field).toBe('faculty_count');
      expect(item.label).toBe('Faculty count');
      expect(item.declared).toBe('12');
      expect(item.observed).toBe('10');
      expect(item.document_name).toBe('faculty_list.pdf');
    }
  });

  it('does not invent contradictions for matching or missing values', () => {
    // No other demo document carries `extracted`, so only the roster can conflict.
    expect(contradictions.every(item => item.document_id === 'demo-doc-demo-app-0-2')).toBe(true);
    // A claim with no extracted evidence produces nothing.
    const landClaim = claims.find(claim => claim.id === 'demo-claim-5')!;
    const landLinks = claimEvidence.filter(link => link.claim_id === landClaim.id);
    expect(detectContradictions(app, [landClaim], landLinks, documents)).toHaveLength(0);
  });
});

describe('replacementImpact', () => {
  it('marks the fire claim as affected by a Fire Safety Certificate replacement', () => {
    const { affected } = replacementImpact(claims, 'Fire Safety Certificate');
    expect(affected.map(claim => claim.id)).toEqual(['demo-claim-7']);
  });

  it('preserves the unrelated verified claims that do not cite the document type', () => {
    const { preserved } = replacementImpact(claims, 'Fire Safety Certificate');
    // Verified claims are 0,1,2,4,5,8 — none cite Fire Safety Certificate.
    expect(preserved).toHaveLength(6);
    expect(preserved.map(claim => claim.id).sort()).toEqual(['demo-claim-0', 'demo-claim-1', 'demo-claim-2', 'demo-claim-4', 'demo-claim-5', 'demo-claim-8']);
    expect(preserved.every(claim => ['verified', 'not_applicable'].includes(claim.status))).toBe(true);
  });

  it('keeps affected and preserved disjoint', () => {
    const { affected, preserved } = replacementImpact(claims, 'Fire Safety Certificate');
    const affectedIds = new Set(affected.map(claim => claim.id));
    expect(preserved.every(claim => !affectedIds.has(claim.id))).toBe(true);
  });
});

describe('compareEvidenceVersions', () => {
  const fireClaim = claims.find(claim => claim.id === 'demo-claim-7')!;
  const comparisons = compareEvidenceVersions(fireClaim, claimEvidence, documents, today);

  it('produces a single expired-vs-replacement split for the fire certificate', () => {
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].doc_type).toBe('Fire Safety Certificate');
    expect(comparisons[0].expired.map(doc => doc.id)).toEqual(['demo-doc-demo-app-0-1']);
    expect(comparisons[0].replacements.map(doc => doc.id)).toEqual(['demo-doc-demo-app-0-5']);
  });

  it('marks the replacement as not yet linked and the original as expired', () => {
    expect(Date.parse(comparisons[0].expired[0].expires_on)).toBeLessThan(Date.parse(today));
    expect(comparisons[0].replacements[0].linked).toBe(false);
    expect(Date.parse(comparisons[0].replacements[0].expires_on ?? '')).toBeGreaterThanOrEqual(Date.parse(today));
  });

  it('returns no split for a claim whose evidence has no valid replacement', () => {
    // The land claim links a single clean document with no expiry and no alternate version.
    const landClaim = claims.find(claim => claim.id === 'demo-claim-5')!;
    expect(compareEvidenceVersions(landClaim, claimEvidence, documents, today)).toHaveLength(0);
  });
});
