import type { Claim, Deficiency } from '../domain/integrity';
import { missingInputs, type Application, type DocumentRecord } from '../domain/model';

export function attentionReasons(app: Application, documents: DocumentRecord[], claims: Claim[], deficiencies: Deficiency[]) {
  const reasons: string[] = [];
  const caseClaims = claims.filter(claim => claim.application_id === app.id);
  const caseDeficiencies = deficiencies.filter(deficiency => deficiency.application_id === app.id);
  const openDeficiencies = caseDeficiencies.filter(deficiency => deficiency.status === 'open' || deficiency.status === 'escalated');

  for (const deficiency of openDeficiencies.slice(0, 2)) {
    reasons.push(`Open deficiency (${deficiency.clause}): ${deficiency.observation}`);
  }

  const missing = missingInputs(app, documents);
  if (missing.length) {
    const shown = missing.slice(0, 2).join(', ');
    const more = missing.length > 2 ? ` and ${missing.length - 2} more` : '';
    reasons.push(`Missing ${missing.length === 1 ? 'required input' : `${missing.length} required inputs`}: ${shown}${more}.`);
  }

  const awaiting = caseClaims.filter(claim => claim.status === 'unverified').length;
  if (awaiting) reasons.push(`${awaiting} of ${caseClaims.length} claim${caseClaims.length === 1 ? '' : 's'} awaiting verification.`);

  const rechecks = caseDeficiencies.filter(deficiency => deficiency.status === 'resolved' && !deficiency.rechecked_at).length;
  if (rechecks) reasons.push(`${rechecks} resolved deficienc${rechecks === 1 ? 'y' : 'ies'} awaiting re-check.`);

  return reasons.slice(0, 4);
}
