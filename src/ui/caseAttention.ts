import type { Claim, Deficiency } from '../domain/integrity';
import { missingInputs, type Application, type DocumentRecord } from '../domain/model';

export interface AttentionFlag {
  id: string;
  owner: 'Institution' | 'Assigned scrutiny officer' | 'EVC coordinator' | 'Regional officer' | 'National administrator';
  reason: string;
  next: string;
  nextEscalationAt: string | null;
  priority: number;
}

function sortFlags(flags: AttentionFlag[]) {
  return flags
    .sort((left, right) => left.priority - right.priority || (left.nextEscalationAt ?? '9999').localeCompare(right.nextEscalationAt ?? '9999') || left.owner.localeCompare(right.owner) || left.reason.localeCompare(right.reason) || left.id.localeCompare(right.id))
    .slice(0, 5);
}

export function attentionFlags(app: Application, documents: DocumentRecord[], claims: Claim[], deficiencies: Deficiency[]): AttentionFlag[] {
  const flags: AttentionFlag[] = [];
  const caseClaims = claims.filter(claim => claim.application_id === app.id);
  const caseDeficiencies = deficiencies.filter(deficiency => deficiency.application_id === app.id);
  const openDeficiencies = caseDeficiencies.filter(deficiency => deficiency.status === 'open' || deficiency.status === 'escalated');

  for (const deficiency of openDeficiencies) {
    flags.push({
      id: `deficiency:${deficiency.id}`,
      owner: 'Institution',
      reason: `${deficiency.clause}: ${deficiency.observation}`,
      next: 'Submit the requested correction; assigned scrutiny officer re-checks it next.',
      nextEscalationAt: deficiency.due_at,
      priority: 0,
    });
  }

  const missing = missingInputs(app, documents);
  if (missing.length) {
    const shown = missing.slice(0, 2).join(', ');
    const more = missing.length > 2 ? ` and ${missing.length - 2} more` : '';
    flags.push({
      id: `missing:${app.id}`,
      owner: 'Institution',
      reason: `Missing ${missing.length === 1 ? 'required input' : `${missing.length} required inputs`}: ${shown}${more}.`,
      next: 'Complete the missing application fields or upload a clean scan.',
      nextEscalationAt: app.sla_due_at,
      priority: 1,
    });
  }

  const awaiting = caseClaims.filter(claim => claim.status === 'unverified').length;
  if (awaiting) flags.push({
    id: `claims:${app.id}`,
    owner: 'Assigned scrutiny officer',
    reason: `${awaiting} of ${caseClaims.length} claim${caseClaims.length === 1 ? '' : 's'} awaiting verification.`,
    next: 'Record findings against the cited evidence before accepting scrutiny.',
    nextEscalationAt: app.sla_due_at,
    priority: 2,
  });

  const rechecks = caseDeficiencies.filter(deficiency => deficiency.status === 'resolved' && !deficiency.rechecked_at).length;
  if (rechecks) flags.push({
    id: `recheck:${app.id}`,
    owner: 'Assigned scrutiny officer',
    reason: `${rechecks} resolved deficienc${rechecks === 1 ? 'y' : 'ies'} awaiting re-check.`,
    next: 'Re-check the institution response and record the result.',
    nextEscalationAt: app.sla_due_at,
    priority: 1,
  });

  return sortFlags(flags);
}

export function attentionReasons(app: Application, documents: DocumentRecord[], claims: Claim[], deficiencies: Deficiency[]) {
  return attentionFlags(app, documents, claims, deficiencies).map(flag => flag.reason);
}
