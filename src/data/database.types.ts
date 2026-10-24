import type {CaseReview,Delivery,DeliveryAttempt,WorkerHealth,Candidate,Readiness} from '../domain/operations';
import type {InspectionExpert,ExpertAvailability,ExpertConflict,ExpertReservation} from '../domain/planning';
import type {AnalysisSnapshot,SavedScenario} from '../domain/intelligence';
import type {ApprovalRecord,ApprovalScopeItem,ScopeRequest,DeadlineNotice,DeadlineRevision,ReminderIntent,NoticeImpact} from '../domain/approvals';
import type { Application, AuditEvent, ChecklistItem, DocumentRecord, Institution, Notification, Obligation, Template, Visit, Role } from '../domain/model';
import type {HistoryPage} from '../domain/review';
import type { AuditVerification, Claim, ClaimEvidence, Deficiency, IntegritySignal, Requirement, AgentRecord } from '../domain/integrity';
// Matches the checked-in baseline + hardening migration. Mutations use RPC only.
type Table<T> = { Row: {[K in keyof T]: T[K]}; Insert: {[K in keyof T]?: T[K]}; Update: {[K in keyof T]?: T[K]}; Relationships: [] };
type Fn<A, R> = { Args: A; Returns: R };
export interface Database {
  public: {
    Tables: {
      case_reviews:Table<CaseReview>;delivery_outbox:Table<Delivery>;delivery_attempts:Table<DeliveryAttempt>;worker_health:Table<WorkerHealth>;
      inspection_experts:Table<InspectionExpert>;expert_availability:Table<ExpertAvailability>;expert_conflicts:Table<ExpertConflict>;expert_reservations:Table<ExpertReservation>;
      analysis_snapshots:Table<AnalysisSnapshot>;analysis_scenarios:Table<SavedScenario>;
      application_scope_items:Table<ScopeRequest>;approval_records:Table<ApprovalRecord>;approval_scope_items:Table<ApprovalScopeItem>;policy_notices:Table<DeadlineNotice>;applied_deadlines:Table<DeadlineRevision>;deadline_reminder_intents:Table<ReminderIntent>;
      applications: Table<Application>; application_events: Table<AuditEvent>; application_documents: Table<DocumentRecord>;
      requirements: Table<Requirement>; application_claims: Table<Claim>; claim_evidence: Table<ClaimEvidence>; deficiencies: Table<Deficiency>; integrity_signals: Table<IntegritySignal>;
      checklist_items: Table<ChecklistItem>; evc_visits: Table<Visit>; institutions: Table<Institution>;
      notifications: Table<Notification>; obligations: Table<Obligation>; workflow_templates: Table<Template>;
      profiles: Table<{id: string; full_name: string; email: string}>;
      user_roles: Table<{user_id: string; role: Role; region: string | null; active: boolean; expires_at: string | null; revoked_at: string | null; granted_by: string | null; grant_reason: string | null}>;
      agent_registry: Table<AgentRecord>;
    };
    Views: Record<string, never>;
    Functions: {
      fp_case_reviews:Fn<Record<string,never>,CaseReview[]>;
      fp_operations_command:Fn<{_kind:string;_id:string|null;_payload:Record<string,unknown>;_expected:number|null;_request:string},Record<string,unknown>>;
      fp_case_candidates:Fn<{_id:string},Candidate[]>;fp_operational_readiness:Fn<Record<string,never>,Readiness>;
      fp_policy_command:Fn<{_kind:string;_id:string|null;_payload:Record<string,unknown>;_expected:number|null;_request:string},Record<string,unknown>>;
      fp_inspection_command:Fn<{_kind:string;_id:string|null;_payload:Record<string,unknown>;_expected_version:number|null;_request_id:string},Record<string,unknown>>;
      fp_capture_analysis:Fn<{_application:string;_expected_version:number;_request_id:string},AnalysisSnapshot>;
      fp_save_analysis:Fn<{_snapshot:string;_parameters:Record<string,unknown>;_request_id:string},SavedScenario>;
      fp_governance_command:Fn<{_kind:string;_id:string|null;_payload:Record<string,unknown>;_expected_version:number|null;_request_id:string},Record<string,unknown>>;
      fp_notice_preview:Fn<{_id:string},NoticeImpact>;
      fp_create_institution: Fn<{_name: string; _ref: string; _region: string; _state: string}, undefined>;
      fp_create_application_draft: Fn<{_type:string;_title:string;_form:Record<string,string>},string>;
      fp_case_history: Fn<{_application:string;_after:number;_through:number|null;_limit:number},HistoryPage>;
      fp_create_application: Fn<{_type: string; _title: string}, string>;
      fp_save_draft: Fn<{_id: string; _title: string; _form: Record<string, string>; _version: number}, undefined>;
      fp_transition: Fn<{_id: string; _action: string; _reason: string; _payload: Record<string, unknown>; _expected_version: number; _request_id: string}, {id: string; status: string; version: number}>;
      fp_checklist: Fn<{_id: string; _item: string; _passed: boolean; _note: string}, undefined>;
      fp_reserve_document: Fn<{_id: string; _type: string; _name: string; _mime: string; _size: number}, string>;
      fp_mark_read: Fn<{_id: string}, undefined>; fp_fulfil: Fn<{_id: string; _reason: string}, undefined>;
      fp_link_claim_evidence: Fn<{_claim: string; _document: string; _note: string | null; _expected_version: number; _request_id: string}, undefined>;
      fp_unlink_claim_evidence: Fn<{_claim: string; _document: string; _expected_version: number; _request_id: string}, undefined>;
      fp_verify_claim: Fn<{_claim: string; _result: string; _note: string | null; _expected_version: number; _request_id: string}, undefined>;
      fp_raise_deficiency: Fn<{_claim: string; _observation: string; _remedy: string; _due: string; _expected_version: number; _request_id: string}, string>;
      fp_resolve_deficiency: Fn<{_deficiency: string; _evidence: string; _note: string; _expected_version: number; _request_id: string}, undefined>;
      fp_recheck_deficiency: Fn<{_deficiency: string; _result: string; _note: string; _expected_version: number; _request_id: string}, undefined>;
      fp_disposition_signal: Fn<{_signal: string; _disposition: string; _reason: string}, undefined>;
      fp_document_passport: Fn<{_document: string}, Record<string, unknown>>;
      fp_verify_audit_chain: Fn<{_application: string}, AuditVerification>;
      fp_demo_tamper_replay: Fn<{_application: string}, AuditVerification>;
    };
    Enums: Record<string, never>; CompositeTypes: Record<string, never>;
  };
}
