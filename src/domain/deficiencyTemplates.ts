import type {Claim} from './integrity';

export interface DeficiencyTemplate {
  key: string;
  label: string;
  observation: string;
  remedy: string;
}

export function deficiencyTemplates(claim: Claim): DeficiencyTemplate[] {
  const types = claim.evidence_types_snapshot.length ? claim.evidence_types_snapshot.join(', ') : 'required';
  return [
    {key: 'missing', label: 'Required evidence not provided', observation: `No current evidence for the requirement "${claim.statement_snapshot}" is present in the dossier.`, remedy: `Submit the ${types} document through the dossier and link it to this claim.`},
    {key: 'stale', label: 'Linked evidence has lapsed', observation: `The linked ${types} evidence is not current, so the claim has no present supporting document.`, remedy: 'Submit a current signed document and record its validity review before re-check.'},
    {key: 'conflict', label: 'Declared values conflict with documents', observation: 'The declared values in this application conflict with the linked document record for this requirement.', remedy: 'Provide the corrected document or a reviewed explanation that reconciles both records.'},
  ];
}
