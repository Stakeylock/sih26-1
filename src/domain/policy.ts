import type { Claim, ClaimEvidence, ClaimStatus, Deficiency, Requirement } from './integrity';

/* ------------------------------------------------------------------ *
 * Policy-change impact preview
 * ------------------------------------------------------------------ */

export interface ChangedRequirement {
  code: string;
  from: Requirement;
  to: Requirement;
  /** Which review-relevant fields changed. */
  fields: string[];
}

export interface RequirementDiff {
  app_type: string;
  fromVersion: number;
  toVersion: number;
  added: Requirement[];
  removed: Requirement[];
  changed: ChangedRequirement[];
  unchanged: string[];
}

function evidenceKey(requirement: Requirement) {
  return [...requirement.evidence_types].sort().join('|');
}

/** Compares two requirement sets (by `code`) and reports what a handbook revision changes. */
export function diffRequirements(from: readonly Requirement[], to: readonly Requirement[]): RequirementDiff {
  const fromByCode = new Map(from.map(requirement => [requirement.code, requirement]));
  const toByCode = new Map(to.map(requirement => [requirement.code, requirement]));
  const added = to.filter(requirement => !fromByCode.has(requirement.code));
  const removed = from.filter(requirement => !toByCode.has(requirement.code));
  const changed: ChangedRequirement[] = [];
  const unchanged: string[] = [];
  for (const requirement of to) {
    const prior = fromByCode.get(requirement.code);
    if (!prior) continue;
    const fields: string[] = [];
    if (prior.statement !== requirement.statement) fields.push('statement');
    if (evidenceKey(prior) !== evidenceKey(requirement)) fields.push('evidence_types');
    if (prior.is_mandatory !== requirement.is_mandatory) fields.push('is_mandatory');
    if (prior.verification_method !== requirement.verification_method) fields.push('verification_method');
    if (fields.length) changed.push({ code: requirement.code, from: prior, to: requirement, fields });
    else unchanged.push(requirement.code);
  }
  return {
    app_type: to[0]?.app_type ?? from[0]?.app_type ?? '',
    fromVersion: from[0]?.version ?? 0,
    toVersion: to[0]?.version ?? 0,
    added,
    removed,
    changed,
    unchanged,
  };
}

export interface CasePolicyImpact {
  application_id: string;
  ref_no: string;
  /** New mandatory checks the case would inherit. */
  added: { code: string; statement: string; evidence_types: string[] }[];
  /** Checks that would be retired for this case. */
  removed: { code: string; statement: string }[];
  /** Existing checks whose evidence requirement or wording changes. */
  changed: { code: string; statement: string; from_evidence: string[]; to_evidence: string[]; fields: string[] }[];
}

/**
 * Maps a policy diff onto live cases: for every case that already carries claims, list the
 * added / removed / changed checks it would be affected by. Pure — the policy snapshot each
 * dossier already recorded is never mutated.
 */
export function policyImpact(
  applications: readonly { id: string; ref_no: string; app_type: string }[],
  claims: readonly Claim[],
  diff: RequirementDiff,
): CasePolicyImpact[] {
  const removedByRequirementId = new Map(diff.removed.map(requirement => [requirement.id, requirement]));
  const changedByRequirementId = new Map(diff.changed.flatMap(change => [[change.from.id, change] as const, [change.to.id, change] as const]));
  const impacts: CasePolicyImpact[] = [];
  for (const application of applications) {
    if (application.app_type !== diff.app_type) continue;
    const caseClaims = claims.filter(claim => claim.application_id === application.id);
    if (!caseClaims.length) continue;
    const impact: CasePolicyImpact = {
      application_id: application.id,
      ref_no: application.ref_no,
      added: diff.added.filter(requirement => requirement.is_mandatory).map(requirement => ({
        code: requirement.code,
        statement: requirement.statement,
        evidence_types: requirement.evidence_types,
      })),
      removed: [],
      changed: [],
    };
    for (const claim of caseClaims) {
      const removed = removedByRequirementId.get(claim.requirement_id);
      if (removed) impact.removed.push({ code: removed.code, statement: removed.statement });
      const change = changedByRequirementId.get(claim.requirement_id);
      if (change) {
        impact.changed.push({
          code: change.code,
          statement: change.to.statement,
          from_evidence: change.from.evidence_types,
          to_evidence: change.to.evidence_types,
          fields: change.fields,
        });
      }
    }
    if (impact.added.length || impact.removed.length || impact.changed.length) impacts.push(impact);
  }
  return impacts;
}

/* ------------------------------------------------------------------ *
 * Replayable review record
 * ------------------------------------------------------------------ */

export type ReviewKind = 'evidence_linked' | 'verified' | 'not_applicable' | 'deficiency_raised' | 'deficiency_resolved' | 'rechecked';

export interface ReviewEntry {
  at: string;
  actor: string | null;
  kind: ReviewKind;
  claim_id: string;
  clause: string;
  statement: string;
  note: string | null;
  /** For `rechecked`, whether the resolution was accepted or reopened. */
  result?: 'accepted' | 'reopened';
}

/**
 * Reconstructs the review reasoning recorded on a case (verifications, deficiency raises,
 * resolutions, re-checks, evidence links) as an ordered timeline, from the ledger itself.
 */
export function reviewTimeline(
  claims: readonly Claim[],
  deficiencies: readonly Deficiency[],
  claimEvidence: readonly ClaimEvidence[],
): ReviewEntry[] {
  const claimById = new Map(claims.map(claim => [claim.id, claim]));
  const entries: ReviewEntry[] = [];
  const base = (claim: Claim, at: string, actor: string | null, kind: ReviewKind, note: string | null, result?: 'accepted' | 'reopened') => {
    if (!at) return;
    entries.push({ at, actor, kind, claim_id: claim.id, clause: claim.clause_snapshot, statement: claim.statement_snapshot, note, ...(result ? { result } : {}) });
  };

  for (const claim of claims) {
    if (claim.verified_at) base(claim, claim.verified_at, claim.verified_by, claim.status === 'not_applicable' ? 'not_applicable' : 'verified', claim.verification_note);
  }
  for (const deficiency of deficiencies) {
    const claim = claimById.get(deficiency.claim_id);
    if (!claim) continue;
    base(claim, deficiency.raised_at, deficiency.raised_by, 'deficiency_raised', deficiency.observation);
    if (deficiency.resolved_at) base(claim, deficiency.resolved_at, deficiency.resolved_by, 'deficiency_resolved', deficiency.resolution_note);
    if (deficiency.rechecked_at) base(claim, deficiency.rechecked_at, deficiency.rechecked_by, 'rechecked', deficiency.recheck_note, deficiency.status === 'resolved' ? 'accepted' : 'reopened');
  }
  for (const link of claimEvidence) {
    const claim = claimById.get(link.claim_id);
    if (!claim) continue;
    base(claim, link.linked_at, link.linked_by, 'evidence_linked', link.note);
  }

  return entries.sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.claim_id.localeCompare(right.claim_id));
}

export interface ReplaySnapshot {
  verified: number;
  deficient: number;
  unverified: number;
  total: number;
  statuses: Record<string, ClaimStatus>;
}

/**
 * Replays the review timeline up to (and including) `throughIndex` and returns the reconstructed
 * claim state at that moment — what the reviewer could see when the entry was recorded.
 */
export function replayClaimState(claims: readonly Claim[], entries: readonly ReviewEntry[], throughIndex: number): ReplaySnapshot {
  const statuses: Record<string, ClaimStatus> = {};
  for (const claim of claims) statuses[claim.id] = 'unverified';
  const limit = Math.max(-1, Math.min(throughIndex, entries.length - 1));
  for (let index = 0; index <= limit; index += 1) {
    const entry = entries[index];
    if (!(entry.claim_id in statuses)) continue;
    switch (entry.kind) {
      case 'verified': statuses[entry.claim_id] = 'verified'; break;
      case 'not_applicable': statuses[entry.claim_id] = 'not_applicable'; break;
      case 'deficiency_raised': statuses[entry.claim_id] = 'deficient'; break;
      case 'deficiency_resolved': statuses[entry.claim_id] = 'unverified'; break;
      case 'rechecked': statuses[entry.claim_id] = entry.result === 'reopened' ? 'deficient' : 'verified'; break;
      case 'evidence_linked': break;
    }
  }
  const values = Object.values(statuses);
  return {
    verified: values.filter(status => status === 'verified' || status === 'not_applicable').length,
    deficient: values.filter(status => status === 'deficient').length,
    unverified: values.filter(status => status === 'unverified').length,
    total: values.length,
    statuses,
  };
}
