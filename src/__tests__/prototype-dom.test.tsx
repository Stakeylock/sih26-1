/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrototypeDossier } from '../ui/PrototypeDossier';
import {
  Application,
  Identity,
  Institution,
  Template,
  Workspace,
  ChecklistItem,
  type Repository,
} from '../domain/model';
import type { Claim } from '../domain/integrity';

function payload(): {
  app: Application;
  data: Workspace;
  identity: Identity;
  repo: Repository;
  busy: boolean;
} {
  const app: Application = {
    id: 'app-1',
    ref_no: 'APP/2026/014',
    title: 'Demo approval case',
    status: 'submitted',
    app_type: 'new_programme',
    region: 'North',
    institution_id: 'inst-1',
    is_demo: true,
    template_snapshot: {
      evc_mode: 'none',
      disclaimer: '',
      stages: [
        { key: 'submission', label: 'Submission', role: 'institution', sla_days: 0 },
        { key: 'scrutiny', label: 'Scrutiny', role: 'scrutiny_officer', sla_days: 1 },
        { key: 'expert_visit', label: 'Expert visit', role: 'evc_coordinator', sla_days: 1 },
        { key: 'final_decision', label: 'Final decision', role: 'regional_officer', sla_days: 1 },
        { key: 'outcome', label: 'Outcome', role: 'national_admin', sla_days: 1 },
      ],
      required_fields: [
        { key: 'project_title', label: 'Project title' },
        { key: 'founder_name', label: 'Founder name' },
      ],
      required_documents: ['proof-of-identity', 'constitution'],
      checklist: ['clerk_review', 'reviewer_review'],
      undertakings: [],
    },
    template_version: 2,
    sla_due_at: new Date(Date.now() + 86400000 * 5).toISOString(),
    form_data: { project_title: 'Full stack', founder_name: 'Demo founder' },
    evc_required: false,
    assigned_officer: null,
    owner_id: 'user-1',
    submitted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    decision_reason: null,
    decision_evidence: null,
    version: 1,
  };

  const institutions: Institution[] = [
    {
      id: 'inst-1',
      owner_id: 'owner-1',
      name: 'Demo institution',
      aicte_ref: 'AIC/1',
      region: 'North',
      state: 'State A',
    },
  ];

  const templates: Template[] = [
    {
      id: 'tpl-1',
      app_type: 'new_programme',
      version: 2,
      status: 'live',
      name: 'Technical school',
      definition: app.template_snapshot,
    },
  ];

  const checklist: ChecklistItem[] = [
    { id: 'ck-1', application_id: app.id, item: 'clerk_review', passed: true, note: '' },
    { id: 'ck-2', application_id: app.id, item: 'reviewer_review', passed: true, note: '' },
  ];

  const claim: Claim = {
    id: 'c1',
    application_id: app.id,
    requirement_id: 'req-1',
    statement_snapshot: 'Statement',
    clause_snapshot: 'Clause',
    evidence_types_snapshot: [],
    system_inputs: [{ field: 'x', label: 'x', value: 'x' }],
    status: 'verified',
    verified_by: 'Reviewer One',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    verified_at: new Date().toISOString(),
    verification_method: 'document_review',
    verification_note: null,
  };

  const data: Workspace = {
    applications: [],
    institutions,
    templates,
    documents: [
      {
        id: 'doc-1',
        application_id: app.id,
        doc_type: 'proof-of-identity',
        file_name: 'Demo-ID.pdf',
        file_path: '/demo/Demo-ID.pdf',
        size_bytes: 204800,
        mime_type: 'application/pdf',
        scan_status: 'clean',
        sha256: null,
        uploaded_at: new Date().toISOString(),
        expires_on: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10),
        issuer: null,
        document_number: null,
      },
    ],
    events: [
      {
        id: 1,
        application_id: app.id,
        actor_id: null,
        actor_role: 'institution',
        action: 'application_received',
        from_status: null,
        to_status: app.status,
        reason: null,
        created_at: new Date().toISOString(),
        payload: {},
        sequence: null,
        prev_hash: null,
        event_hash: null,
      },
    ],
    checklist,
    visits: [],
    obligations: [],
    notifications: [],
    requirements: [],
    claims: [claim],
    claim_evidence: [],
    deficiencies: [],
    integrity_signals: [],
    access_assignments: [],
    agents: [],
    evc_visits: [],
    evc_members: [],
    evc_unavailability: [],
    evc_schedule_history: [],
    inspection_evidence: [],
  };

  const identity: Identity = {
    id: 'user-1',
    name: 'Demo Reviewer',
    email: 'reviewer@example.test',
    roles: [{ role: 'scrutiny_officer' as const, region: 'North' }],
  };

  const repo = {
    download: vi.fn().mockResolvedValue(undefined),
    advisory: vi.fn(),
  } as unknown as Repository;

  return { app, data, identity, repo, busy: false };
}

describe('PrototypeDossier', () => {
  it.each([
    ['renders the institution title', 'Demo institution'],
    ['renders the case reference', 'APP/2026/014'],
    ['renders the role restriction line near the header', 'Read-only at this stage'],
    ['renders submission completeness', '2 of 2 fields'],
    ['renders the current authority', 'Scrutiny officer'],
    ['renders the document navigation', 'proof-of-identity'],
    ['renders the selected document surface', 'Demo-ID.pdf'],
    ['lists the verified claim', 'Statement'],
  ])('%s', (_description, text) => {
    const back = () => {};
    const openReceipt = vi.fn();
    const openCase = vi.fn();
    const html = renderToStaticMarkup(
      <PrototypeDossier {...payload()} back={back} openReceipt={openReceipt} openCase={openCase} />,
    );
    expect(html).toContain(text);
  });

  it('shows a clearly synthetic specimen preview instead of fabricating file bytes', () => {
    const html = renderToStaticMarkup(
      <PrototypeDossier {...payload()} back={() => {}} openReceipt={vi.fn()} openCase={vi.fn()} />,
    );
    expect(html).toContain('SYNTHETIC SPECIMEN');
    expect(html).toContain('no file bytes are stored or displayed');
  });

  it('does not offer an action button when the role holds no permitted action', () => {
    const subject = payload();
    const html = renderToStaticMarkup(
      <PrototypeDossier {...subject} back={() => {}} openReceipt={vi.fn()} openCase={vi.fn()} />,
    );
    expect(html).toContain('No actions available to your role');
  });
});
