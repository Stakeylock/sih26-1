import { assessSnapshot, indiaDate, type AnalysisSnapshot } from './intelligence';
import { routeStageIndex } from './model';
import { RISK_MODEL, type RiskFeatureDefinition } from './riskModel';

const DAY = 86400000;
const STAGE_LABELS = ['Submission', 'Scrutiny', 'Expert visit', 'Final decision', 'Outcome'];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export interface RiskFeatureRow extends RiskFeatureDefinition {
  value: number;
}

export function riskFeatureValues(snapshot: AnalysisSnapshot): number[] {
  const facts = snapshot.facts;
  const application = facts.application;
  const today = indiaDate(snapshot.captured_at);
  const attention = assessSnapshot(snapshot);
  const waitingRatio = attention.mandatoryClaims === 0 ? 0 : (attention.mandatoryClaims - attention.currentClaims) / attention.mandatoryClaims;
  const deadlineRecorded = application.sla_due_at && Number.isFinite(Date.parse(application.sla_due_at)) ? 1 : 0;
  const deadlineDays = deadlineRecorded && attention.dueDays !== null && Number.isFinite(attention.dueDays) ? clamp(attention.dueDays, -365, 365) : 365;
  const createdAt = Date.parse(application.created_at);
  const ageDays = Number.isFinite(createdAt) ? clamp(Math.floor((Date.parse(snapshot.captured_at) - createdAt) / DAY), 0, 1200) : 0;
  const computed: Record<string, number> = {
    waiting_claim_ratio: waitingRatio,
    open_deficiencies: attention.factors.find(factor => factor.key === 'corrections')?.count ?? 0,
    missing_required_documents: attention.requiredEvidenceTotal - attention.requiredEvidenceCurrent,
    deadline_days: deadlineDays,
    deadline_recorded: deadlineRecorded,
    overdue_obligations: attention.overdueObligations,
    confirmed_signals: attention.factors.find(factor => factor.key === 'integrity')?.count ?? 0,
    scope_review_pending: attention.scopeReviewCurrent ? 0 : 1,
    pending_independent_reviews: attention.factors.find(factor => factor.key === 'independent_review')?.count ?? 0,
    expired_documents: facts.documents.filter(document => document.expires_on && document.expires_on < today).length,
    rejected_scans: facts.documents.filter(document => document.scan_status === 'rejected').length,
    pending_scans: facts.documents.filter(document => document.scan_status === 'pending').length,
    application_age_days: ageDays,
    stage_index: routeStageIndex(application.status),
    evc_required: application.evc_required ? 1 : 0,
    documents_count: facts.documents.length,
    claims_count: facts.claims.length,
  };
  return RISK_MODEL.features.map(feature => {
    const value = computed[feature.key];
    if (value === undefined) throw new Error(`Missing risk feature: ${feature.key}`);
    return Number.isFinite(value) ? value : 0;
  });
}

export function riskFeatureRows(snapshot: AnalysisSnapshot): RiskFeatureRow[] {
  const values = riskFeatureValues(snapshot);
  return RISK_MODEL.features.map((feature, index) => ({ ...feature, value: values[index] }));
}

export function formatRiskFeatureValue(row: RiskFeatureRow, rows: RiskFeatureRow[]) {
  if (row.key === 'deadline_days') {
    const recorded = rows.find(candidate => candidate.key === 'deadline_recorded')?.value ?? 0;
    if (!recorded) return 'Not recorded';
    return row.value < 0 ? `${Math.round(Math.abs(row.value))} days past due` : `${Math.round(row.value)} days`;
  }
  if (row.key === 'stage_index') return STAGE_LABELS[clamp(Math.round(row.value), 0, STAGE_LABELS.length - 1)];
  if (row.unit === 'ratio') return `${Math.round(row.value * 100)}%`;
  if (row.unit === 'flag') return row.value ? 'Yes' : 'No';
  if (row.unit === 'days') return `${Math.round(row.value)} days`;
  return `${Math.round(row.value)}`;
}
