import type { Claim, Deficiency } from '../domain/integrity';
import type { Application, Workspace } from '../domain/model';

export type FlowState = Claim['status'];

export interface FlowEvidence {
  id: string;
  file_name: string;
  doc_type: string;
  expires_on: string | null;
  scan_status: string;
  expired: boolean;
}

export interface FlowCorrection {
  id: string;
  observation: string;
  remedy: string;
  due_at: string;
  status: Deficiency['status'];
  raised_by: string;
  raised_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  rechecked_at: string | null;
  recheck_note: string | null;
}

export interface FlowReview {
  kind: 'verified';
  detail: string;
  when: string;
  actor: string | null;
}

export interface FlowThread {
  claim: Claim;
  state: FlowState;
  evidence: FlowEvidence[];
  replacements: FlowEvidence[];
  corrections: FlowCorrection[];
  reviews: FlowReview[];
}

export function claimThreads(app: Application, data: Workspace): FlowThread[] {
  const claims = data.claims.filter(claim => claim.application_id === app.id);
  const documents = data.documents.filter(document => document.application_id === app.id);
  const byId = new Map(documents.map(document => [document.id, document]));
  const today = new Date().toISOString().slice(0, 10);
  return claims.map(claim => {
    const evidence: FlowEvidence[] = [];
    for (const link of data.claim_evidence.filter(item => item.claim_id === claim.id)) {
      const document = byId.get(link.document_id);
      if (!document) continue;
      evidence.push({ id: document.id, file_name: document.file_name, doc_type: document.doc_type, expires_on: document.expires_on ?? null, scan_status: document.scan_status, expired: Boolean(document.expires_on && document.expires_on < today) });
    }
    const corrections: FlowCorrection[] = data.deficiencies.filter(item => item.claim_id === claim.id).map(item => ({ id: item.id, observation: item.observation, remedy: item.remedy, due_at: item.due_at, status: item.status, raised_by: item.raised_by, raised_at: item.raised_at, resolved_at: item.resolved_at, resolution_note: item.resolution_note, rechecked_at: item.rechecked_at, recheck_note: item.recheck_note }));
    const linkedIds = new Set(evidence.map(item => item.id));
    const replacements: FlowEvidence[] = [];
    for (const docType of claim.evidence_types_snapshot) {
      for (const document of documents) {
        if (document.doc_type !== docType || linkedIds.has(document.id)) continue;
        if (document.scan_status !== 'clean') continue;
        if (document.expires_on && document.expires_on < today) continue;
        replacements.push({ id: document.id, file_name: document.file_name, doc_type: document.doc_type, expires_on: document.expires_on ?? null, scan_status: document.scan_status, expired: false });
      }
    }
    const reviews: FlowReview[] = claim.verified_at ? [{ kind: 'verified', detail: claim.verification_note ?? '', when: claim.verified_at, actor: claim.verified_by }] : [];
    return { claim, state: claim.status, evidence, replacements, corrections, reviews };
  });
}
