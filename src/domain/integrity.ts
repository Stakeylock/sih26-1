export const claimStatuses = ['unverified', 'verified', 'deficient', 'not_applicable'] as const;
export type ClaimStatus = typeof claimStatuses[number];

export const verificationMethods = ['document_review', 'cross_check', 'evc_physical', 'system_check'] as const;
export type VerificationMethod = typeof verificationMethods[number];

export const deficiencyStatuses = ['open', 'resolved', 'waived', 'escalated'] as const;
export type DeficiencyStatus = typeof deficiencyStatuses[number];

export const signalTypes = ['duplicate_document', 'expired_document', 'name_mismatch', 'faculty_overlap', 'submission_velocity', 'access_anomaly', 'risk_score'] as const;
export type SignalType = typeof signalTypes[number];

export const signalDispositions = ['open', 'explained', 'confirmed', 'dismissed'] as const;
export type SignalDisposition = typeof signalDispositions[number];

export interface Requirement {
  id: string;
  app_type: string;
  version: number;
  code: string;
  clause: string;
  statement: string;
  evidence_types: string[];
  verification_method: VerificationMethod;
  /** Declared application fields a system check evaluates; document checks leave this unset. */
  system_fields?: string[];
  input_fields?: string[];
  is_mandatory: boolean;
  sort_order: number;
  active: boolean;
}

export interface ClaimSystemInput { field: string; label: string; value: string }
export interface Claim {
  id: string;
  application_id: string;
  requirement_id: string;
  status: ClaimStatus;
  statement_snapshot: string;
  clause_snapshot: string;
  evidence_types_snapshot: string[];
  verification_method: VerificationMethod;
  input_fields_snapshot?: string[];
  requirement_version_snapshot?: number;
  is_mandatory_snapshot?: boolean;
  verification_basis?: ReviewBasis | null;
  /** Inputs the system check evaluated, for claims verified without a document link. */
  system_inputs?: ClaimSystemInput[];
  system_rule_snapshot?: {id:string;version:number;max_ratio:number;source:string} | null;
  system_result?: {passed:boolean;ratio?:number;reason?:string;inputs:ClaimSystemInput[];rule?:{id:string;version:number;max_ratio:number;source:string}} | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimEvidence {
  claim_id: string;
  document_id: string;
  linked_by: string;
  linked_at: string;
  note: string | null;
}

export interface Deficiency {
  id: string;
  application_id: string;
  claim_id: string;
  clause: string;
  observation: string;
  remedy: string;
  due_at: string;
  status: DeficiencyStatus;
  raised_by: string;
  raised_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  evidence_id: string | null;
  rechecked_by: string | null;
  rechecked_at: string | null;
  recheck_note: string | null;
  response_revision?: number;
}

export interface ReviewBasis {
  schema: 1; result: 'verified'|'not_applicable'; method: VerificationMethod; clause: string;
  requirement_version: number; mandatory: boolean; evidence_types: string[];
  inputs: Record<string,string|null>;
  documents: {id:string;sha256:string|null;doc_type:string;expires_on:string|null;scan_status:string}[];
  system_result: Claim['system_result'] | null;
}

export interface IntegritySignal {
  id: string;
  application_id: string;
  document_id: string | null;
  signal_type: SignalType;
  severity: 'info' | 'warning' | 'critical';
  fingerprint: string;
  detail: Record<string, unknown>;
  disposition: SignalDisposition;
  disposition_reason: string | null;
  disposed_by: string | null;
  disposed_at: string | null;
  created_at: string;
}

export interface RecordIntegritySignalInput {
  application_id: string;
  document_id: string | null;
  signal_type: SignalType;
  severity: IntegritySignal['severity'];
  fingerprint: string;
  detail: Record<string, unknown>;
  reason: string;
}

export interface AccessAssignment {
  user_id: string;
  role: string;
  region: string | null;
  active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  granted_by: string | null;
  grant_reason: string | null;
}

export interface AgentRecord {
  id: string;
  name: string;
  purpose: string;
  scopes: string[];
  can_approve: boolean;
  enabled: boolean;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AuditEventLike {
  application_id: string;
  sequence: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  prev_hash: string | null;
  event_hash: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
}

export interface AuditVerification {
  intact: boolean;
  checked: number;
  head: string | null;
  broken_at: number | null;
}

export function stableJson(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : stableJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Audit payload contains a non-finite number.');
  return JSON.stringify(value);
}

function auditTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Audit event has an invalid timestamp.');
  const [head, tail] = date.toISOString().split('.');
  return `${head}.${(tail ?? '000Z').replace('Z', '').padEnd(6, '0')}Z`;
}

export function canonicalAuditPayload(event: AuditEventLike): string {
  if (!Number.isInteger(event.sequence) || event.sequence < 1) throw new Error('Audit event sequence must be a positive integer.');
  return stableJson([
    event.application_id,
    event.sequence,
    event.prev_hash ?? '',
    event.actor_id ?? '',
    event.actor_role ?? '',
    event.action,
    event.from_status ?? '',
    event.to_status ?? '',
    event.reason ?? '',
    event.payload,
    event.resource_type ?? '',
    event.resource_id ?? '',
    auditTimestamp(event.created_at),
  ]);
}

export async function sha256Hex(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}

export async function sha256Bytes(value: ArrayBuffer | ArrayBufferView | Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable in this environment.');
  const bytes = typeof Blob !== 'undefined' && value instanceof Blob ? await value.arrayBuffer() : value;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyAuditChain(events: readonly AuditEventLike[]): Promise<AuditVerification> {
  if (events.length === 0) return { intact: true, checked: 0, head: null, broken_at: null };
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const applicationId = ordered[0].application_id;
  let previousHash = '';
  for (const [index, event] of ordered.entries()) {
    const expectedSequence = index + 1;
    if (event.application_id !== applicationId || event.sequence !== expectedSequence || (event.prev_hash ?? '') !== previousHash) {
      return { intact: false, checked: index, head: previousHash || null, broken_at: expectedSequence };
    }
    const expectedHash = await sha256Hex(canonicalAuditPayload({ ...event, prev_hash: previousHash }));
    if (event.event_hash !== expectedHash) {
      return { intact: false, checked: index, head: previousHash || null, broken_at: event.sequence };
    }
    previousHash = expectedHash;
  }
  return { intact: true, checked: ordered.length, head: previousHash, broken_at: null };
}

/** A declared application value that disagrees with a value extracted from linked evidence. */
export interface EvidenceContradiction {
  claim_id: string;
  field: string;
  label: string;
  declared: string;
  observed: string;
  document_id: string;
  document_name: string;
}

/**
 * Cross-document contradiction review: flags any claim whose linked evidence carries an
 * extracted value that disagrees with the value declared in the dossier. Pure and advisory —
 * it never mutates state; a human resolves the conflict.
 */
export function detectContradictions(
  app: { form_data: Record<string, string>; template_snapshot: { required_fields: { key: string; label: string }[] } },
  claims: readonly Claim[],
  claimEvidence: readonly { claim_id: string; document_id: string }[],
  documents: readonly { id: string; file_name: string; extracted?: Record<string, string> }[],
): EvidenceContradiction[] {
  const byId = new Map(documents.map(document => [document.id, document]));
  const labelFor = (field: string) => app.template_snapshot.required_fields.find(item => item.key === field)?.label ?? field;
  const contradictions: EvidenceContradiction[] = [];
  for (const claim of claims) {
    for (const link of claimEvidence.filter(item => item.claim_id === claim.id)) {
      const document = byId.get(link.document_id);
      if (!document?.extracted) continue;
      for (const [field, rawObserved] of Object.entries(document.extracted)) {
        const declared = (app.form_data[field] ?? '').trim();
        const observed = (rawObserved ?? '').trim();
        if (!declared || !observed || declared === observed) continue;
        contradictions.push({ claim_id: claim.id, field, label: labelFor(field), declared, observed, document_id: document.id, document_name: document.file_name });
      }
    }
  }
  return contradictions;
}

/**
 * Targeted correction & re-review: which claims a replacement document of `docType` touches
 * (affected) versus which verified / not-applicable claims stay untouched (preserved).
 */
export function replacementImpact(claims: readonly Claim[], docType: string): { affected: Claim[]; preserved: Claim[] } {
  const affected = claims.filter(claim => claim.evidence_types_snapshot.includes(docType));
  const affectedIds = new Set(affected.map(claim => claim.id));
  const preserved = claims.filter(claim => ['verified', 'not_applicable'].includes(claim.status) && !affectedIds.has(claim.id));
  return { affected, preserved };
}

export interface EvidenceVersionComparison {
  doc_type: string;
  expired: { id: string; file_name: string; expires_on: string }[];
  replacements: { id: string; file_name: string; expires_on: string | null; linked: boolean }[];
}

/**
 * Groups a claim's evidence into expired originals (linked but lapsed) beside current valid
 * replacements of the same document type, for the side-by-side review card.
 */
export function compareEvidenceVersions(
  claim: Pick<Claim, 'id' | 'evidence_types_snapshot'>,
  claimEvidence: readonly { claim_id: string; document_id: string }[],
  documents: readonly { id: string; doc_type: string; file_name: string; scan_status: string; expires_on?: string | null }[],
  today = new Date().toISOString().slice(0, 10),
): EvidenceVersionComparison[] {
  const linkedIds = new Set(claimEvidence.filter(link => link.claim_id === claim.id).map(link => link.document_id));
  const comparisons: EvidenceVersionComparison[] = [];
  for (const docType of claim.evidence_types_snapshot) {
    const ofType = documents.filter(document => document.doc_type === docType && document.scan_status === 'clean');
    const expired = ofType.filter(document => document.expires_on && document.expires_on < today && linkedIds.has(document.id));
    const replacements = ofType.filter(document => !document.expires_on || document.expires_on >= today);
    if (expired.length && replacements.length) {
      comparisons.push({
        doc_type: docType,
        expired: expired.map(document => ({ id: document.id, file_name: document.file_name, expires_on: document.expires_on! })),
        replacements: replacements.map(document => ({ id: document.id, file_name: document.file_name, expires_on: document.expires_on ?? null, linked: linkedIds.has(document.id) })),
      });
    }
  }
  return comparisons;
}
