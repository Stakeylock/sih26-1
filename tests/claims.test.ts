import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoRepository, seed } from '../src/data/demo';
import requirementsJson from '../src/data/requirements.json';
import type { Requirement } from '../src/domain/integrity';

const requirements = requirementsJson as Requirement[];
const workspace = seed();
const claims = workspace.claims.filter(claim => claim.application_id === 'demo-app-0');
const claimEvidence = workspace.claim_evidence.filter(link => claims.some(claim => claim.id === link.claim_id));
const documents = workspace.documents.filter(document => document.application_id === 'demo-app-0');
const fireExpired = workspace.documents.find(document => document.id === 'demo-doc-demo-app-0-1')!;
const fireValid = workspace.documents.find(document => document.id === 'demo-doc-demo-app-0-5')!;
const fireDuplicate = workspace.documents.find(document => document.id === 'demo-doc-demo-app-4-extra-0')!;

describe('self-disclosure requirements', () => {
  it('seeds nine active mandatory requirements for the extension route', () => {
    expect(requirements).toHaveLength(9);
    expect(requirements.every(requirement => requirement.app_type === 'extension_self_disclosure')).toBe(true);
    expect(requirements.every(requirement => requirement.version === 1)).toBe(true);
    expect(requirements.every(requirement => requirement.active && requirement.is_mandatory)).toBe(true);
  });
});

describe('claim seed', () => {
  it('seeds nine claims for demo-app-0 with the expected status counts', () => {
    expect(claims).toHaveLength(9);
    expect(claims.map(claim => claim.id)).toEqual(requirements.map((_, index) => `demo-claim-${index}`));
    expect(claims.map(claim => claim.requirement_id)).toEqual(requirements.map(requirement => requirement.id));
    expect(claims.filter(claim => claim.status === 'verified')).toHaveLength(6);
    expect(claims.filter(claim => claim.status === 'unverified')).toHaveLength(2);
    expect(claims.filter(claim => claim.status === 'deficient')).toHaveLength(1);
  });

  it('exposes the declared system-check inputs on the ratio claim', () => {
    const ratio = claims.find(claim => claim.verification_method === 'system_check');
    expect(ratio?.system_inputs).toEqual([
      { field: 'intake', label: 'Sanctioned intake', value: '120' },
      { field: 'faculty_count', label: 'Faculty count', value: '12' },
    ]);
  });

  it('snapshots requirement text and verification details', () => {
    claims.forEach((claim, index) => {
      expect(claim.statement_snapshot).toBe(requirements[index].statement);
      expect(claim.clause_snapshot).toBe(requirements[index].clause);
      expect(claim.evidence_types_snapshot).toEqual(requirements[index].evidence_types);
      expect(claim.verification_method).toBe(requirements[index].verification_method);
    });
    expect(claims.filter(claim => claim.status === 'verified').every(claim => claim.verified_by === 'demo-scrutiny' && claim.verified_at && claim.verification_note)).toBe(true);
  });

  it('leaves the built-up area claim without evidence', () => {
    expect(claimEvidence.some(link => link.claim_id === 'demo-claim-6')).toBe(false);
  });

  it('links the fire safety claim to the expired certificate', () => {
    expect(claimEvidence.filter(link => link.claim_id === 'demo-claim-7')).toEqual([
      expect.objectContaining({ document_id: 'demo-doc-demo-app-0-1' }),
    ]);
  });
});

describe('evidence fixtures', () => {
  it('expires the fire certificate before the scrutiny date and keeps the replacement valid', () => {
    expect(Date.parse(fireExpired.expires_on!)).toBeLessThan(Date.now());
    expect(Date.parse(fireValid.expires_on!)).toBeGreaterThan(Date.now());
  });

  it('shares the expired certificate hash with the duplicate case', () => {
    expect(fireExpired.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fireDuplicate.sha256).toBe(fireExpired.sha256);
    expect(fireDuplicate.expires_on).toBe(fireExpired.expires_on);
  });

  it('uses the real SHA-256 of each source document ID', () => {
    const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
    for (const document of workspace.documents) {
      const expected = document.id === 'demo-doc-demo-app-4-extra-0' ? sha256('demo-doc-demo-app-0-1') : sha256(document.id);
      expect(document.sha256).toBe(expected);
    }
  });

  it('gives every other document a unique deterministic hash', () => {
    expect(documents.every(document => /^[a-f0-9]{64}$/.test(document.sha256!))).toBe(true);
    expect(new Set(workspace.documents.map(document => document.sha256)).size).toBe(workspace.documents.length - 1);
  });
});

describe('deficiency seed', () => {
  it('raises one open deficiency against the fire safety claim', () => {
    const deficiency = workspace.deficiencies.find(item => item.id === 'demo-def-0')!;
    expect(deficiency).toMatchObject({ application_id: 'demo-app-0', claim_id: 'demo-claim-7', clause: 'APH safety', status: 'open', raised_by: 'demo-scrutiny' });
  });
});

describe('demo claim actions', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
    });
  });

  it('verifies a claim with current clean evidence and audits the action', async () => {
    const repo = createDemoRepository('scrutiny_officer');
    const before = await repo.workspace();
    const app = before.applications.find(item => item.id === 'demo-app-0')!;
    const claim = before.claims.find(item => item.id === 'demo-claim-3')!;
    await repo.verifyClaim(app, claim, 'verified', 'Synthetic faculty list reviewed.');
    const after = await repo.workspace();
    expect(after.claims.find(item => item.id === 'demo-claim-3')!.status).toBe('verified');
    expect(after.claims.find(item => item.id === 'demo-claim-3')!.verified_by).toBe('demo-scrutiny');
    expect(after.events.some(event => event.action === 'claim_verified' && event.application_id === 'demo-app-0')).toBe(true);
  });

  it('rejects verification when no current clean evidence is linked', async () => {
    const repo = createDemoRepository('scrutiny_officer');
    const data = await repo.workspace();
    const app = data.applications.find(item => item.id === 'demo-app-0')!;
    const claim = data.claims.find(item => item.id === 'demo-claim-6')!;
    await expect(repo.verifyClaim(app, claim, 'verified', 'Attempt without evidence.')).rejects.toThrow('Link current clean evidence');
  });

  it('rejects verification against the expired fire certificate', async () => {
    const repo = createDemoRepository('scrutiny_officer');
    const data = await repo.workspace();
    const app = data.applications.find(item => item.id === 'demo-app-0')!;
    const claim = data.claims.find(item => item.id === 'demo-claim-7')!;
    await expect(repo.verifyClaim(app, claim, 'verified', 'Expired certificate attempt.')).rejects.toThrow('Resolve and re-check');
  });

  it('blocks accepting scrutiny while claims or deficiencies remain unresolved', async () => {
    const repo = createDemoRepository('scrutiny_officer');
    const data = await repo.workspace();
    const app = data.applications.find(item => item.id === 'demo-app-0')!;
    await expect(repo.transition({ application: app, action: 'pass_scrutiny', reason: 'All evidence appears satisfactory.', payload: {}, requestId: 'gate-1' })).rejects.toThrow('Resolve all claims and open deficiencies before accepting scrutiny.');
  });

  it('raises one claim deficiency and blocks a duplicate', async () => {
    const repo = createDemoRepository('scrutiny_officer');
    const data = await repo.workspace();
    const app = data.applications.find(item => item.id === 'demo-app-0')!;
    const claim = data.claims.find(item => item.id === 'demo-claim-3')!;
    await repo.raiseClaimDeficiency(app, claim, 'The faculty list does not reconcile with the sanctioned intake.', 'Provide a reconciled faculty list signed by the registrar.', new Date(Date.now() + 7 * 86400000).toISOString());
    const after = await repo.workspace();
    expect(after.claims.find(item => item.id === 'demo-claim-3')!.status).toBe('deficient');
    expect(after.deficiencies.filter(item => item.claim_id === 'demo-claim-3' && item.status === 'open')).toHaveLength(1);
    await expect(repo.raiseClaimDeficiency(after.applications.find(item=>item.id===app.id)!, claim, 'A second observation for the same claim.', 'Provide another document for review.', new Date(Date.now() + 7 * 86400000).toISOString())).rejects.toThrow('already open');
  });

  it('lets the institution link replacement evidence and resolve, then scrutiny verifies', async () => {
    const institution = createDemoRepository('institution');
    const before = await institution.workspace();
    const app = before.applications.find(item => item.id === 'demo-app-0')!;
    const claim = before.claims.find(item => item.id === 'demo-claim-7')!;
    const deficiency = before.deficiencies.find(item => item.id === 'demo-def-0')!;
    const valid = before.documents.find(item => item.id === 'demo-doc-demo-app-0-5')!;
    await institution.linkClaimEvidence(app, claim, valid, 'Replacement certificate uploaded.');
    await institution.resolveClaimDeficiency((await institution.workspace()).applications.find(item=>item.id===app.id)!, deficiency, valid, 'Replacement fire certificate valid for the scrutiny date.');
    const resolved = await institution.workspace();
    expect(resolved.deficiencies.find(item => item.id === 'demo-def-0')!.status).toBe('resolved');
    expect(resolved.claims.find(item => item.id === 'demo-claim-7')!.status).toBe('unverified');
    expect(resolved.claim_evidence.some(link => link.claim_id === 'demo-claim-7' && link.document_id === valid.id)).toBe(true);

    const scrutiny = createDemoRepository('scrutiny_officer');
    const officerView = await scrutiny.workspace();
    const officerApp = officerView.applications.find(item => item.id === 'demo-app-0')!;
    const officerClaim = officerView.claims.find(item => item.id === 'demo-claim-7')!;
    await scrutiny.recheckClaimDeficiency(officerApp,officerView.deficiencies.find(item=>item.id===deficiency.id)!,'accepted','Replacement fire certificate is current and clean.');
    expect((await scrutiny.workspace()).claims.find(item => item.id === 'demo-claim-7')!.status).toBe('verified');
  });

  it('rejects a response, then accepts the second response and retains both snapshots',async()=>{
    let institution=createDemoRepository('institution');let view=await institution.workspace();
    const appId='demo-app-0',defId='demo-def-0';const replacement=view.documents.find(item=>item.id==='demo-doc-demo-app-0-5')!;
    await institution.resolveClaimDeficiency(view.applications.find(item=>item.id===appId)!,view.deficiencies.find(item=>item.id===defId)!,replacement,'First synthetic replacement response.');
    const scrutiny=createDemoRepository('scrutiny_officer');view=await scrutiny.workspace();
    await expect(scrutiny.recheckClaimDeficiency(view.applications.find(item=>item.id===appId)!,view.deficiencies.find(item=>item.id===defId)!,'accepted','Short')).rejects.toThrow('re-check note');
    await scrutiny.recheckClaimDeficiency(view.applications.find(item=>item.id===appId)!,view.deficiencies.find(item=>item.id===defId)!,'reopened','Please clarify the synthetic certificate number.');
    institution=createDemoRepository('institution');view=await institution.workspace();
    await institution.resolveClaimDeficiency(view.applications.find(item=>item.id===appId)!,view.deficiencies.find(item=>item.id===defId)!,replacement,'Second synthetic response with clarification.');
    const reviewer=createDemoRepository('scrutiny_officer');view=await reviewer.workspace();
    const response=view.deficiencies.find(item=>item.id===defId)!;
    expect(response.response_revision).toBe(2);expect(response.rechecked_at).toBeNull();
    await reviewer.recheckClaimDeficiency(view.applications.find(item=>item.id===appId)!,response,'accepted','The corrected response is now accepted.');
    const after=await reviewer.workspace();expect(after.claims.find(item=>item.id==='demo-claim-7')!.status).toBe('verified');
    const history=await reviewer.history(after.applications.find(item=>item.id===appId)!);
    expect(history.events.filter(item=>item.action==='deficiency_resolved')).toHaveLength(2);
    expect(history.events.filter(item=>item.action==='deficiency_rechecked').map(item=>item.payload.result)).toEqual(['reopened','accepted']);
  });
});
