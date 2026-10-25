import { describe, expect, it } from 'vitest';
import { seed } from '../src/data/demo';
import { claimThreads } from '../src/ui/dossierFlow';

const data = seed();
const app = data.applications.find(item => item.id === 'demo-app-0')!;

describe('claimThreads', () => {
  it('produces one thread per recorded claim without duplicating or dropping any', () => {
    const threads = claimThreads(app, data);
    expect(threads).toHaveLength(data.claims.filter(claim => claim.application_id === app.id).length);
    expect(new Set(threads.map(thread => thread.claim.id)).size).toBe(threads.length);
  });

  it('marks the linked expired evidence and keeps the valid replacement visible on the same thread', () => {
    const fire = claimThreads(app, data).find(thread => thread.claim.id === 'demo-claim-7')!;
    expect(fire.state).toBe('deficient');
    const expired = fire.evidence.filter(item => item.expired).map(item => item.id);
    expect(expired).toContain('demo-doc-demo-app-0-1');
    expect(fire.replacements.map(item => item.id)).toContain('demo-doc-demo-app-0-5');
    expect(fire.replacements.find(item => item.id === 'demo-doc-demo-app-0-5')!.expired).toBe(false);
    expect(fire.evidence.map(item => item.id)).not.toContain('demo-doc-demo-app-0-5');
  });

  it('attaches the open correction with its remedy and deadline to the deficient thread only', () => {
    const threads = claimThreads(app, data);
    const deficient = threads.filter(thread => thread.corrections.length > 0);
    expect(deficient.map(thread => thread.claim.id)).toEqual(['demo-claim-7']);
    const correction = deficient[0].corrections[0];
    expect(correction.observation).toContain('expired');
    expect(correction.remedy).toContain('valid on the scrutiny date');
    expect(correction.status).toBe('open');
  });

  it('records the human review provenance with actor and note on verified threads', () => {
    const verified = claimThreads(app, data).filter(thread => thread.state === 'verified');
    expect(verified.length).toBeGreaterThan(0);
    for (const thread of verified) {
      const review = thread.reviews.find(item => item.kind === 'verified');
      expect(review).toBeDefined();
      expect(review!.actor).toBe('demo-scrutiny');
      expect(review!.detail.length).toBeGreaterThan(0);
    }
  });

  it('leaves an unverified thread honest: evidence listed, no invented review', () => {
    const unverified = claimThreads(app, data).filter(thread => thread.state === 'unverified');
    expect(unverified.length).toBeGreaterThan(0);
    expect(unverified.every(thread => thread.replacements.length === 0)).toBe(true);
    for (const thread of unverified) {
      expect(thread.reviews).toHaveLength(0);
      expect(thread.corrections).toHaveLength(0);
    }
    const linkedClaim = data.claim_evidence.find(link => link.claim_id === 'demo-claim-3');
    expect(linkedClaim).toBeDefined();
    const thread = claimThreads(app, data).find(item => item.claim.id === 'demo-claim-3')!;
    expect(thread.evidence.map(item => item.id)).toContain(linkedClaim!.document_id);
  });

  it('orders threads by requirement sort order so the story reads in handbook sequence', () => {
    const requirements = data.claims.filter(claim => claim.application_id === app.id);
    const order = claimThreads(app, data).map(thread => thread.claim.id);
    expect(order).toEqual(requirements.map(claim => claim.id));
  });
});
