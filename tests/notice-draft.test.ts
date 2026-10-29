import { describe, expect, it } from 'vitest';
import { draftNotice } from '../src/domain/noticeDraft';
import type { AnalysisSnapshot } from '../src/domain/intelligence';

const baseApplication = {
  id: 'app-1', ref_no: 'APP-0001', title: 'Test application', owner_id: 'user-1', institution_id: 'inst-1',
  app_type: 'extension_self_disclosure', status: 'submitted', region: 'North', version: 1, template_version: 1,
  template_snapshot: { evc_mode: 'none', required_fields: [], required_documents: [], checklist: [], undertakings: [], disclaimer: 'Synthetic template.' },
  form_data: {}, evc_required: false, assigned_officer: null, sla_due_at: null, submitted_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', decision_reason: null, decision_evidence: null, is_demo: false,
};
const baseFacts = {
  application: baseApplication,
  documents: [], claims: [], claim_evidence: [], deficiencies: [], obligations: [], visits: [], signals: [],
  scope_requests: [], approvals: [], notices: [], deadlines: [],
  history: { through: 0, head_hash: null, events: [], complete: true },
};

function minimalSnapshot(overrides: Partial<AnalysisSnapshot['facts']> = {}): AnalysisSnapshot {
  return {
    schema: 1,
    id: 'snapshot-test',
    application_id: 'app-1',
    captured_at: '2026-10-29T10:00:00Z',
    captured_by: 'tester',
    app_version: 1,
    head_sequence: 0,
    head_hash: null,
    source_hash: 'source-hash-test',
    coverage: 'current',
    limitations: [],
    facts: { ...baseFacts, ...overrides },
  } as unknown as AnalysisSnapshot;
}

describe('notice draft', () => {
  it('produces a synthetic read-only draft for a clean captured record', () => {
    const draft = draftNotice(minimalSnapshot());
    expect(draft.synthetic).toBe(true);
    expect(draft.title).toContain('APP-0001');
    expect(draft.body).toContain('DRAFT FOR HUMAN REVIEW');
    expect(draft.body).toContain('No open issue was identified in the captured record.');
    expect(draft.body).toContain('No seeded handbook clause matched the captured issue terms.');
    expect(draft.body).toContain('Synthetic demonstration draft. The handbook references are seeded excerpts');
    expect(draft.disclaimer).toContain('does not issue a notice');
    expect(draft.citations).toEqual([]);
    expect(draft.generatedAt).toBe('2026-10-29T10:00:00Z');
    expect(draft.sourceHash).toBe('source-hash-test');
  });

  it('cites a seeded handbook clause for a missing required document category', () => {
    const snapshot = minimalSnapshot({
      application: { ...baseApplication, template_snapshot: { ...baseApplication.template_snapshot, required_documents: ['Land Document'] } },
    });
    const draft = draftNotice(snapshot);
    expect(draft.citations.length).toBeGreaterThan(0);
    expect(draft.body).toMatch(/Clause \d+\.\d+/);
    expect(draft.citations[0]?.reason).toBe('Required document category: Land Document');
  });
});
