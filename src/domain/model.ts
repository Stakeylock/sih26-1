import type {CaseReview,Delivery,DeliveryAttempt,WorkerHealth,Candidate,Readiness,PolicyRevision} from './operations';
import type {AnalysisCalendar} from './intelligence';
import type {InspectionExpert,ExpertAvailability,ExpertConflict,ExpertReservation,PanelSnapshot} from './planning';
import type {AnalysisSnapshot,SavedScenario,ScenarioParameters} from './intelligence';
import type { AccessAssignment, AgentRecord, AuditVerification, Claim, ClaimEvidence, Deficiency, IntegritySignal, Requirement, SignalDisposition } from './integrity';
import type { DispatchNotificationParams, DispatchNotificationResult, DeliveryStatus, NotificationChannel } from './notification';
import type {CaseHistory} from './review';
import type {ApprovalRecord,ApprovalScopeItem,DeadlineNotice,DeadlineRevision,NoticeImpact,NoticeInput,ReminderIntent,ScopeInput,ScopeRequest,ValidityInput,ValidityMode} from './approvals';
import {demoNow} from './virtualClock';
import type {ClockReport} from './consequences';

export type { Claim, ClaimEvidence, Deficiency, IntegritySignal, Requirement } from './integrity';
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
  calendar?:AnalysisCalendar;inspection_planning_required?:boolean;
  evc_mode: 'none' | 'conditional' | 'required'; disclaimer: string;
  stages: { key: string; label: string; role: Role; sla_days: number }[];
  required_fields: { key: string; label: string }[]; required_documents: string[]; checklist: string[]; undertakings: string[];
}
export interface Template extends Omit<PolicyRevision,'definition'> { id: string; app_type: AppType; version: number; status: string; name: string; definition: TemplateDefinition }
export interface Institution { id: string; owner_id: string; name: string; aicte_ref: string; region: string; state: string }
export interface Application {
  academic_year_start?:number|null;scope_revision?:number;scope_reviewed_revision?:number|null;scope_reviewed_by?:string|null;scope_review_note?:string|null;paused_remaining_working_days?:number|null;paused_at?:string|null;pause_reason?:string|null;
  id: string; ref_no: string; title: string; owner_id: string; institution_id: string; app_type: AppType; status: Status;
  region: string; version: number; template_version: number; template_snapshot: TemplateDefinition;
  form_data: Record<string, string>; evc_required: boolean; assigned_officer: string | null;
  sla_due_at: string | null; submitted_at: string | null; created_at: string; updated_at: string;
  decision_reason: string | null; decision_evidence: string | null; is_demo: boolean;
}
export interface DocumentRecord { validity_mode?:ValidityMode;issue_date?:string|null;subject_institution_id?:string|null;supersedes_document_id?:string|null;validity_reviewed_by?:string|null;validity_reviewed_at?:string|null;validity_review_note?:string|null; id: string; application_id: string; doc_type: string; file_name: string; file_path: string; size_bytes: number; mime_type: string; scan_status: 'pending' | 'clean' | 'rejected'; sha256: string | null; /** SHA-256 of the generated watermarked sample bytes served from file_path (demo seed only). */ sample_sha256?: string | null; /** Origin label for the generated sample shown by the preview/passport (demo seed only). */ origin_label?: string | null; uploaded_at: string; expires_on?: string | null; issuer?: string | null; document_number?: string | null; /** Synthetic extraction metadata (demo only) — e.g. values read off a roster, used for cross-document consistency checks. */ extracted?: Record<string,string> }
export interface AuditEvent { id: number; application_id: string; actor_id: string | null; actor_role: string | null; action: string; from_status: Status | null; to_status: Status | null; reason: string | null; created_at: string; payload: Record<string, unknown>; sequence?: number | null; prev_hash?: string | null; event_hash?: string | null; resource_type?: string | null; resource_id?: string | null }
export interface ChecklistItem { id: string; application_id: string; item: string; passed: boolean | null; note: string }
export interface ExpertMember {
  name: string;
  designation: string;
  domain: 'Academic (Chairman)' | 'Architectural / Civil' | 'Regional Nominee';
  institution: string;
  no_conflict_signed: boolean;
}
export interface Visit { ends_at?:string|null;visit_mode?:'physical'|'online'|'hybrid'|null;planning_state?:'legacy'|'tentative'|'confirmed'|'completed'|'cancelled';resource_planned?:boolean;version?:number;panel_snapshot?:PanelSnapshot[];planning_note?:string|null;report_due_at?:string|null;report_basis?:Record<string,unknown>|null; id: string; application_id: string; coordinator_id: string; scheduled_for: string; completed_at: string | null; report: string | null; recommendation: string | null; committee?: ExpertMember[] }
export interface Obligation { kind?:string;approval_id?:string|null;document_id?:string|null;document_expiry_on?:string|null;deadline_revision?:number; id: string; application_id: string; institution_id: string; title: string; due_date: string; status: string; deadline_source: string; region: string; escalation_level?: 'normal' | 't_minus_30' | 't_minus_0' | 'escalated_ro' | 'escalated_hq'; statutory_norm?: string; lease_years_remaining?: number; required_evidence?: string[]; delay_risk_advisory?: string | null }
export interface Notification { id: string; title: string; body: string; read_at: string | null; created_at: string; application_id?: string | null; target_stage?: string | null; channel?: NotificationChannel; deliveryStatus?: DeliveryStatus; previewUrl?: string }
export interface Workspace { case_reviews?:CaseReview[];delivery_outbox?:Delivery[];delivery_attempts?:DeliveryAttempt[];worker_health?:WorkerHealth[]; inspection_experts?:InspectionExpert[];expert_availability?:ExpertAvailability[];expert_conflicts?:ExpertConflict[];expert_reservations?:ExpertReservation[]; analysis_snapshots?:AnalysisSnapshot[];analysis_scenarios?:SavedScenario[]; scope_requests?:ScopeRequest[];approvals?:ApprovalRecord[];approval_scope?:ApprovalScopeItem[];notices?:DeadlineNotice[];deadlines?:DeadlineRevision[];reminder_intents?:ReminderIntent[]; applications: Application[]; institutions: Institution[]; templates: Template[]; documents: DocumentRecord[]; events: AuditEvent[]; checklist: ChecklistItem[]; visits: Visit[]; obligations: Obligation[]; notifications: Notification[]; requirements: Requirement[]; claims: Claim[]; claim_evidence: ClaimEvidence[]; deficiencies: Deficiency[]; integrity_signals: IntegritySignal[]; access_assignments: AccessAssignment[]; agents: AgentRecord[] }
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
export type Action = 'submit' | 'resubmit' | 'start_scrutiny' | 'raise_deficiency' | 'pass_scrutiny' | 'schedule_evc' | 'submit_evc_report' | 'approve' | 'reject' | 'request_shc';
export const actionLabels: Record<Action, string> = { submit: 'Submit application', resubmit: 'Resubmit application', start_scrutiny: 'Start scrutiny', raise_deficiency: 'Return for deficiency', pass_scrutiny: 'Accept scrutiny', schedule_evc: 'Schedule visit', submit_evc_report: 'Submit visit report', approve: 'Record demo approval', reject: 'Record demo rejection', request_shc: 'File SHC appeal' };
export interface Transition { application: Application; action: Action; reason: string; payload: Record<string, unknown>; requestId: string }
export interface RenewalInput { file?: File; documentId?: string; note: string }
export interface Advisory {engine:string;advisoryOnly:boolean;model:string;summary:string;warnings:string[];trace:string[];disclaimer:string;automation:{id:string;state:string}}
export interface Repository {
  applicationPage?(query:import('./register').RegisterQuery):Promise<import('./register').ApplicationPage>;
  caseBundle?(id:string):Promise<Partial<Workspace>>;
  workerJobs?(id:string):Promise<import('./register').WorkerJobs>;
  retryJob?(kind:'scan'|'deadline',id:string,version:number,note:string,key?:string):Promise<void>;
  operationsCommand(kind:string,id:string|null,payload:Record<string,unknown>,expected:number|null,requestId?:string):Promise<Record<string,unknown>>;
  caseCandidates(applicationId:string):Promise<Candidate[]>;readiness():Promise<Readiness>;
  policyCommand(kind:string,id:string|null,payload:Record<string,unknown>,expected:number|null,requestId?:string):Promise<Record<string,unknown>>;
  inspectionCommand(kind:string,id:string|null,payload:Record<string,unknown>,expectedVersion:number|null,requestId?:string):Promise<Record<string,unknown>>;
  captureAnalysis(application:Application,requestId?:string):Promise<AnalysisSnapshot>;
  saveScenario(snapshot:AnalysisSnapshot,parameters:ScenarioParameters,requestId?:string):Promise<SavedScenario>;
  saveScope(application:Application,year:number,items:ScopeInput[],requestId?:string):Promise<void>;
  reviewScope(application:Application,note:string,requestId?:string):Promise<void>;
  reviewDocumentValidity(application:Application,document:DocumentRecord,input:ValidityInput,requestId?:string):Promise<void>;
  submitRenewal(application:Application,expired:DocumentRecord,input:RenewalInput,requestId?:string):Promise<void>;
  createNotice(input:NoticeInput,requestId?:string):Promise<void>;
  reviewNotice(notice:DeadlineNotice,note:string,requestId?:string):Promise<void>;
  previewNotice(notice:DeadlineNotice):Promise<NoticeImpact>;
  adoptNotice(notice:DeadlineNotice,impact:NoticeImpact,note:string,requestId?:string):Promise<void>;
  fulfilWithEvidence(application:Application,obligation:Obligation,evidence:string[],reason:string,requestId?:string):Promise<void>;
  mode: 'demo' | 'connected'; identity(): Promise<Identity | null>; subscribeAuth(callback: () => void): () => void;
  signIn(email: string, password: string): Promise<void>; signOut(): Promise<void>; workspace(): Promise<Workspace>;
  createInstitution(input: Omit<Institution, 'id' | 'owner_id'>): Promise<void>;
  createApplication(type: AppType, title: string, initialForm?: Record<string,string>): Promise<string>;
  saveDraft(application: Application, title: string, form: Record<string, string>): Promise<void>;
  transition(input: Transition): Promise<void>; checklist(application: Application, item: string, passed: boolean, note: string): Promise<void>;
  verifyClaim(application: Application, claim: Claim, result: 'verified' | 'not_applicable', note: string, requestId?: string): Promise<void>;
  linkClaimEvidence(application: Application, claim: Claim, document: DocumentRecord, note: string, requestId?: string): Promise<void>;
  raiseClaimDeficiency(application: Application, claim: Claim, observation: string, remedy: string, dueAt: string, requestId?: string): Promise<void>;
  resolveClaimDeficiency(application: Application, deficiency: Deficiency, evidence: DocumentRecord, note: string, requestId?: string): Promise<void>;
  recheckClaimDeficiency(application: Application, deficiency: Deficiency, result: 'accepted' | 'reopened', note: string, requestId?: string): Promise<void>;
  verifyAudit(application: Application): Promise<AuditVerification>;
  history(application: Application): Promise<CaseHistory>;
  tamperReplay(application: Application): Promise<AuditVerification>;
  upload(application: Application, type: string, file: File): Promise<void>; download(document: DocumentRecord): Promise<void>;
  markRead(id: string): Promise<void>; fulfil(id: string, reason: string): Promise<void>; dispositionSignal(signalId: string, disposition: SignalDisposition, reason: string, requestId?: string): Promise<void>; dispatchNotification(params: DispatchNotificationParams): Promise<DispatchNotificationResult>;
  advanceClock?(days: number): Promise<ClockReport>;
  advisory(application:Application,documents:DocumentRecord[]):Promise<Advisory>;
}
export interface Workspace {read_window?:{loaded_cases:number;total_cases:number;as_of:string}}
export function allowedActions(app: Application, identity: Identity, mode: 'demo'|'connected' = 'connected'): Action[] {
  const has = (role: Role) => identity.roles.some(r => r.role === role && (r.region === app.region || role === 'national_admin'));
  if (app.owner_id === identity.id) {
    if (app.status === 'draft') return ['submit'];
    if (app.status === 'deficiency_raised') return ['resubmit'];
    if (mode === 'demo' && app.status === 'rejected' && !app.form_data['shc_appeal_submitted']) return ['request_shc'];
    return [];
  }
  if (['submitted', 'resubmitted'].includes(app.status) && (!app.assigned_officer||app.assigned_officer===identity.id) && has('scrutiny_officer')) return ['start_scrutiny'];
  if (app.status === 'under_scrutiny' && app.assigned_officer === identity.id && has('scrutiny_officer')) return ['raise_deficiency', 'pass_scrutiny'];
  if (app.status === 'evc_pending' && has('evc_coordinator')) return ['schedule_evc'];
  if (app.status === 'evc_scheduled' && has('evc_coordinator')) return ['submit_evc_report'];
  if (app.status === 'pending_decision' && (has('regional_officer') || has('national_admin'))) return ['approve', 'reject'];
  return [];
}
export function daysUntil(date: string | null, now = demoNow()) { return date ? Math.ceil((Date.parse(date) - now) / 86400000) : null; }
export function missingInputs(app: Application, documents: DocumentRecord[]) {
  return [...app.template_snapshot.required_fields.filter(f => !app.form_data[f.key]?.trim()).map(f => f.label),
    ...app.template_snapshot.required_documents.filter(type => !documents.some(d => d.application_id === app.id && d.doc_type === type && d.scan_status === 'clean')).map(d => `${d} (clean scan required)`)];
}
