// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createDemoRepository } from '../src/data/demo';

const STORAGE = 'clauseway-isolated-demo-v12';

describe('obligations compliance evidence submission and verification', () => {
  beforeEach(() => { localStorage.removeItem(STORAGE); });
  afterEach(() => { localStorage.removeItem(STORAGE); });

  it('allows institution owner to submit compliance evidence for an obligation', async () => {
    const instRepo = await createDemoRepository('institution');
    const ws = await instRepo.workspace();
    const app = ws.applications.find(a => a.id === 'demo-app-0');
    expect(app).toBeDefined();

    const obligation = ws.obligations.find(o => o.application_id === app!.id);
    expect(obligation).toBeDefined();

    const doc = ws.documents.find(d => d.application_id === app!.id && d.scan_status === 'clean');
    expect(doc).toBeDefined();

    const res = await instRepo.submitComplianceEvidence(app!, obligation!.id, {
      document_id: doc!.id,
      remarks: 'Certified audited statement fulfilling annual condition.',
    });
    expect(res.evidence_id).toBeDefined();

    const evidenceList = await instRepo.getComplianceEvidence(obligation!.id);
    expect(evidenceList.length).toBeGreaterThanOrEqual(1);
    const item = evidenceList.find(e => e.id === res.evidence_id);
    expect(item).toBeDefined();
    expect(item?.status).toBe('PENDING');
    expect(item?.remarks).toBe('Certified audited statement fulfilling annual condition.');
    expect(item?.document_id).toBe(doc!.id);
  });

  it('rejects evidence submission with invalid document or obligation', async () => {
    const instRepo = await createDemoRepository('institution');
    const ws = await instRepo.workspace();
    const app = ws.applications[0];

    await expect(instRepo.submitComplianceEvidence(app, 'non-existent-obligation', {
      document_id: 'any-doc',
    })).rejects.toThrow('Obligation is unavailable for this application.');

    const obligation = ws.obligations[0];
    await expect(instRepo.submitComplianceEvidence(app, obligation.id, {
      document_id: 'non-existent-doc',
    })).rejects.toThrow('Document is not a current case document.');
  });

  it('allows national admin to approve submitted compliance evidence and fulfills obligation', async () => {
    const instRepo = await createDemoRepository('institution');
    const ws = await instRepo.workspace();
    const app = ws.applications.find(a => a.id === 'demo-app-0')!;
    const obligation = ws.obligations.find(o => o.application_id === app.id)!;
    const doc = ws.documents.find(d => d.application_id === app.id && d.scan_status === 'clean')!;

    const sub = await instRepo.submitComplianceEvidence(app, obligation.id, {
      document_id: doc.id,
      remarks: 'Submitted for verification.',
    });

    const adminRepo = await createDemoRepository('national_admin');
    await adminRepo.verifyComplianceEvidence(
      sub.evidence_id,
      'APPROVED',
      'The submitted evidence strictly complies with the condition guidelines.'
    );

    const evidenceList = await adminRepo.getComplianceEvidence(obligation.id);
    const verified = evidenceList.find(e => e.id === sub.evidence_id);
    expect(verified?.status).toBe('APPROVED');
    expect(verified?.verified_by).toBe('demo-national');
    expect(verified?.verified_remarks).toBe('The submitted evidence strictly complies with the condition guidelines.');

    const freshWs = await adminRepo.workspace();
    const freshObligation = freshWs.obligations.find(o => o.id === obligation.id);
    expect(freshObligation?.status).toBe('fulfilled');
  });

  it('allows regional officer to reject submitted compliance evidence', async () => {
    const instRepo = await createDemoRepository('institution');
    const ws = await instRepo.workspace();
    const app = ws.applications.find(a => a.id === 'demo-app-0')!;
    const obligation = ws.obligations.find(o => o.application_id === app.id)!;
    const doc = ws.documents.find(d => d.application_id === app.id && d.scan_status === 'clean')!;

    const sub = await instRepo.submitComplianceEvidence(app, obligation.id, {
      document_id: doc.id,
      remarks: 'Submitted for review.',
    });

    const officerRepo = await createDemoRepository('regional_officer');
    await officerRepo.verifyComplianceEvidence(
      sub.evidence_id,
      'REJECTED',
      'The provided document is incomplete and missing authorised signatory stamp.'
    );

    const evidenceList = await officerRepo.getComplianceEvidence(obligation.id);
    const verified = evidenceList.find(e => e.id === sub.evidence_id);
    expect(verified?.status).toBe('REJECTED');
    expect(verified?.verified_remarks).toContain('incomplete');

    const freshWs = await officerRepo.workspace();
    const freshObligation = freshWs.obligations.find(o => o.id === obligation.id);
    expect(freshObligation?.status).toBe('submitted');
  });

  it('rejects verification with insufficient reason or by institution role', async () => {
    const instRepo = await createDemoRepository('institution');
    const ws = await instRepo.workspace();
    const app = ws.applications.find(a => a.id === 'demo-app-0')!;
    const obligation = ws.obligations.find(o => o.application_id === app.id)!;
    const doc = ws.documents.find(d => d.application_id === app.id && d.scan_status === 'clean')!;

    const sub = await instRepo.submitComplianceEvidence(app, obligation.id, {
      document_id: doc.id,
    });

    // Institution cannot verify its own evidence
    await expect(instRepo.verifyComplianceEvidence(sub.evidence_id, 'APPROVED', 'Looks good to me.'))
      .rejects.toThrow('Only a national administrator or regional officer can verify evidence.');

    const adminRepo = await createDemoRepository('national_admin');
    // Reason too short (< 10 chars)
    await expect(adminRepo.verifyComplianceEvidence(sub.evidence_id, 'APPROVED', 'Short.'))
      .rejects.toThrow('Provide a review reason of at least 10 characters.');
  });
});
