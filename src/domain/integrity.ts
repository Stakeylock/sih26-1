export const claimStatuses = ['unverified', 'verified', 'deficient', 'not_applicable'] as const;
export type ClaimStatus = typeof claimStatuses[number];

export const verificationMethods = ['document_review', 'cross_check', 'evc_physical', 'system_check'] as const;
export type VerificationMethod = typeof verificationMethods[number];

export const deficiencyStatuses = ['open', 'resolved', 'waived', 'escalated'] as const;
export type DeficiencyStatus = typeof deficiencyStatuses[number];

export const signalTypes = ['duplicate_document', 'expired_document', 'name_mismatch', 'faculty_overlap', 'submission_velocity', 'access_anomaly'] as const;
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
  /** Inputs the system check evaluated, for claims verified without a document link. */
  system_inputs?: ClaimSystemInput[];
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
}

export interface AuditVerification {
  intact: boolean;
  checked: number;
  head: string | null;
  broken_at: number | null;
}

function stableJson(value: unknown): string {
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
    auditTimestamp(event.created_at),
  ]);
}

export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable in this environment.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
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
