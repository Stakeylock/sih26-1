import type { Claim, Requirement } from './integrity';

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

export {reviewTimeline,replayClaimState} from './review';
export type {ReviewEntry} from './review';
