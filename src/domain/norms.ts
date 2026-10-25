import type {Claim, Requirement} from './integrity';

export interface EvidenceNorm {
  docType: string;
  clause: string;
  statement: string;
}

export function evidenceNorms(claims: readonly Claim[], requirements: readonly Requirement[]): EvidenceNorm[] {
  const byId = new Map(requirements.map(requirement => [requirement.id, requirement]));
  const seen = new Map<string, EvidenceNorm>();
  for (const claim of claims) {
    const requirement = byId.get(claim.requirement_id);
    if (!requirement) continue;
    for (const type of claim.evidence_types_snapshot) {
      if (!seen.has(type)) seen.set(type, {docType: type, clause: requirement.clause, statement: requirement.statement});
    }
  }
  return [...seen.values()].sort((left, right) => left.docType.localeCompare(right.docType));
}
