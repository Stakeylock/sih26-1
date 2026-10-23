import type { AccessAssignment, AgentRecord, AuditVerification, Claim, ClaimEvidence, Deficiency, IntegritySignal, Requirement } from './integrity';
export const roles = ['institution', 'scrutiny_officer', 'evc_coordinator', 'regional_officer', 'national_admin'] as const;
export type Role = typeof roles[number];
export const regions = ['North', 'South', 'East', 'West', 'Central', 'North-East'] as const;
export const statusLabels = {
  draft: 'Draft', submitted: 'Submitted', under_scrutiny: 'Under review', deficiency_raised: 'Changes requested',
  resubmitted: 'Resubmitted', evc_pending: 'Visit pending', evc_scheduled: 'Visit scheduled',
  pending_decision: 'Decision pending', approved: 'Approved', rejected: 'Rejected',
} as const;
export type Status = keyof typeof statusLabels;
export const typeLabels = { extension_self_disclosure: 'Self-disclosure extension', name_change: 'Institution name change', new_programme: 'New programme' } as const;
export type AppType = keyof typeof typeLabels;
export const roleLabels: Record<Role, string> = { institution: 'Institution', scrutiny_officer: 'Scrutiny officer', evc_coordinator: 'EVC coordinator', regional_officer: 'Regional officer', national_admin: 'National administrator' };
export interface Identity { id: string; name: string; email: string; roles: { role: Role; region: string | null }[] }
export interface TemplateDefinition {
  evc_mode: 'none' | 'conditional' | 'required'; disclaimer: string;
  stages: { key: string; label: string; role: Role; sla_days: number }[];
  required_fields: { key: string; label: string }[]; required_documents: string[]; checklist: string[]; undertakings: string[];
}
export interface Template { id: string; app_type: AppType; version: number; status: string; name: string; definition: TemplateDefinition }
export interface Institution { id: string; owner_id: string; name: string; aicte_ref: string; region: string; state: string }
export interface Application {
  id: string; ref_no: string; title: string; owner_id: string; institution_id: string; app_type: AppType; status: Status;
  region: string; version: number; template_version: number; template_snapshot: TemplateDefinition;
  form_data: Record<string, string>; evc_required: boolean; assigned_officer: string | null;
  sla_due_at: string | null; submitted_at: string | null; created_at: string; updated_at: string;
  decision_reason: string | null; decision_evidence: string | null; is_demo: boolean;
}
export interface DocumentRecord { id: string; application_id: string; doc_type: string; file_name: string; file_path: string; size_bytes: number; mime_type: string; scan_status: 'pending' | 'clean' | 'rejected'; sha256: string | null; uploaded_at: string; expires_on?: string | null; issuer?: string | null; document_number?: string | null }
export interface AuditEvent { id: number; application_id: string; actor_id: string | null; actor_role: string | null; action: string; from_status: Status | null; to_status: Status | null; reason: string | null; created_at: string; payload: Record<string, unknown>; sequence?: number | null; prev_hash?: string | null; event_hash?: string | null }
export interface ChecklistItem { id: string; application_id: string; item: string; passed: boolean | null; note: string }
export interface Visit { id: string; application_id: string; coordinator_id: string; scheduled_for: string; completed_at: string | null; report: string | null; recommendation: string | null }
export interface Obligation { id: string; application_id: string; institution_id: string; title: string; due_date: string; status: string; deadline_source: string; region: string }
export interface Notification { id: string; title: string; body: string; read_at: string | null; created_at: string }
export interface Workspace { applications: Application[]; institutions: Institution[]; templates: Template[]; documents: DocumentRecord[]; events: AuditEvent[]; checklist: ChecklistItem[]; visits: Visit[]; obligations: Obligation[]; notifications: Notification[]; requirements: Requirement[]; claims: Claim[]; claim_evidence: ClaimEvidence[]; deficiencies: Deficiency[]; integrity_signals: IntegritySignal[]; access_assignments: AccessAssignment[]; agents: AgentRecord[] }
export const routeStages = [
  { key: 'submission', label: 'Submission', statuses: ['draft'] },
  { key: 'scrutiny', label: 'Scrutiny', statuses: ['submitted', 'resubmitted', 'under_scrutiny', 'deficiency_raised'] },
  { key: 'expert_visit', label: 'Expert visit', statuses: ['evc_pending', 'evc_scheduled'] },
  { key: 'final_decision', label: 'Final decision', statuses: ['pending_decision'] },
  { key: 'outcome', label: 'Outcome', statuses: ['approved', 'rejected'] },
] as const satisfies readonly { key: string; label: string; statuses: readonly Status[] }[];
export type RouteStage = typeof routeStages[number];
export function routeStageIndex(status: Status) {
  const index = routeStages.findIndex(stage => (stage.statuses as readonly Status[]).includes(status));
  return index < 0 ? 0 : index;
}
export function routeStage(status: Status): RouteStage { return routeStages[routeStageIndex(status)]; }
export function nextAuthority(status: Status) {
  if (status === 'deficiency_raised') return roleLabels.institution;
  return ({
    submission: roleLabels.institution,
    scrutiny: roleLabels.scrutiny_officer,
    expert_visit: roleLabels.evc_coordinator,
    final_decision: roleLabels.regional_officer,
    outcome: 'Record complete',
  } as const)[routeStage(status).key];
}
export type Action = 'submit' | 'resubmit' | 'start_scrutiny' | 'raise_deficiency' | 'pass_scrutiny' | 'schedule_evc' | 'submit_evc_report' | 'approve' | 'reject';
export const actionLabels: Record<Action, string> = { submit: 'Submit application', resubmit: 'Resubmit application', start_scrutiny: 'Start scrutiny', raise_deficiency: 'Return for deficiency', pass_scrutiny: 'Accept scrutiny', schedule_evc: 'Schedule visit', submit_evc_report: 'Submit visit report', approve: 'Record demo approval', reject: 'Record demo rejection' };
export interface Transition { application: Application; action: Action; reason: string; payload: Record<string, unknown>; requestId: string }
export interface Advisory {engine:string;advisoryOnly:boolean;model:string;summary:string;warnings:string[];trace:string[];disclaimer:string;automation:{id:string;state:string}}
export interface Repository {
  mode: 'demo' | 'connected'; identity(): Promise<Identity | null>; subscribeAuth(callback: () => void): () => void;
  signIn(email: string, password: string): Promise<void>; signOut(): Promise<void>; workspace(): Promise<Workspace>;
  createInstitution(input: Omit<Institution, 'id' | 'owner_id'>): Promise<void>;
  createApplication(type: AppType, title: string): Promise<string>;
  saveDraft(application: Application, title: string, form: Record<string, string>): Promise<void>;
  transition(input: Transition): Promise<void>; checklist(application: Application, item: string, passed: boolean, note: string): Promise<void>;
  verifyClaim(application: Application, claim: Claim, result: 'verified' | 'not_applicable', note: string): Promise<void>;
  linkClaimEvidence(application: Application, claim: Claim, document: DocumentRecord, note: string): Promise<void>;
  raiseClaimDeficiency(application: Application, claim: Claim, observation: string, remedy: string, dueAt: string): Promise<void>;
  resolveClaimDeficiency(application: Application, deficiency: Deficiency, evidence: DocumentRecord, note: string): Promise<void>;
  recheckClaimDeficiency(application: Application, deficiency: Deficiency, result: 'accepted' | 'reopened', note: string): Promise<void>;
  verifyAudit(application: Application): Promise<AuditVerification>;
  tamperReplay(application: Application): Promise<AuditVerification>;
  upload(application: Application, type: string, file: File): Promise<void>; download(document: DocumentRecord): Promise<void>;
  markRead(id: string): Promise<void>; fulfil(id: string, reason: string): Promise<void>;
  advisory(application:Application,documents:DocumentRecord[]):Promise<Advisory>;
}
export function allowedActions(app: Application, identity: Identity): Action[] {
  const has = (role: Role) => identity.roles.some(r => r.role === role && (r.region === app.region || role === 'national_admin'));
  if (app.owner_id === identity.id) return app.status === 'draft' ? ['submit'] : app.status === 'deficiency_raised' ? ['resubmit'] : [];
  if (['submitted', 'resubmitted'].includes(app.status) && has('scrutiny_officer')) return ['start_scrutiny'];
  if (app.status === 'under_scrutiny' && app.assigned_officer === identity.id && has('scrutiny_officer')) return ['raise_deficiency', 'pass_scrutiny'];
  if (app.status === 'evc_pending' && has('evc_coordinator')) return ['schedule_evc'];
  if (app.status === 'evc_scheduled' && has('evc_coordinator')) return ['submit_evc_report'];
  if (app.status === 'pending_decision' && (has('regional_officer') || has('national_admin'))) return ['approve', 'reject'];
  return [];
}
export function daysUntil(date: string | null, now = Date.now()) { return date ? Math.ceil((Date.parse(date) - now) / 86400000) : null; }
export function missingInputs(app: Application, documents: DocumentRecord[]) {
  return [...app.template_snapshot.required_fields.filter(f => !app.form_data[f.key]?.trim()).map(f => f.label),
    ...app.template_snapshot.required_documents.filter(type => !documents.some(d => d.application_id === app.id && d.doc_type === type && d.scan_status === 'clean')).map(d => `${d} (clean scan required)`)];
}
