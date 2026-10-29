import { Download, FileText, ShieldAlert, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AnalysisSnapshot } from '../domain/intelligence';
import { draftNotice, type NoticeDraft } from '../domain/noticeDraft';
import { formatRiskFeatureValue, riskFeatureRows } from '../domain/riskFeatures';
import { RISK_MODEL, explainRisk, riskBand, type RiskBand } from '../domain/riskModel';
import { formatDateTime } from './DisplayPreferences';
import type { Application, IntegritySignal, Repository } from '../domain/model';
import type { DispatchNotificationParams } from '../domain/notification';
import './advisory.css';

const BAND_COPY: Record<RiskBand, string> = {
  low: 'Low advisory band',
  watch: 'Watch advisory band',
  high: 'High advisory band',
};

const BAND_SEVERITY: Record<RiskBand, IntegritySignal['severity']> = {
  low: 'info',
  watch: 'warning',
  high: 'critical',
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdvisoryPanel({ snapshot, app, repo, busy }: { snapshot: AnalysisSnapshot; app: Application; repo: Repository; busy: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState<NoticeDraft | null>(null);
  const [draftError, setDraftError] = useState('');
  const [signalRecorded, setSignalRecorded] = useState<IntegritySignal | null>(null);
  const [signalError, setSignalError] = useState('');
  const [escalationDispatched, setEscalationDispatched] = useState<{ notificationId: string; status: string } | null>(null);
  const [escalationError, setEscalationError] = useState('');
  const rows = useMemo(() => riskFeatureRows(snapshot), [snapshot]);
  const rowByKey = useMemo(() => new Map(rows.map(row => [row.key, row])), [rows]);
  const evaluation = useMemo(() => {
    try {
      return { explanation: explainRisk(rows.map(row => row.value)), error: '' };
    } catch {
      return { explanation: null, error: 'The advisory model artifact could not be evaluated for this captured record.' };
    }
  }, [rows]);
  const explanation = evaluation.explanation;
  const band = explanation ? riskBand(explanation.probability) : 'watch';
  const percentage = explanation ? (explanation.probability * 100).toFixed(1) : '—';
  const visible = explanation ? (showAll ? explanation.contributions : explanation.contributions.slice(0, 8)) : [];

  function createDraft() {
    try {
      setDraft(draftNotice(snapshot));
      setDraftError('');
    } catch {
      setDraftError('The notice draft could not be generated from this captured record.');
    }
  }

  const recordSignal = async () => {
    if (!explanation) return;
    setSignalError('');
    try {
      const severity = BAND_SEVERITY[band];
      const reason = `Advisory risk score ${percentage}% (${band}) computed for application ${app.ref_no}. Top factors: ${visible.slice(0, 3).map(c => c.label).join(', ')}.`;
      const signal = await repo.recordIntegritySignal({
        application_id: app.id,
        document_id: null,
        signal_type: 'risk_score',
        severity,
        fingerprint: `risk:${app.id}:risk_score:${explanation.raw.toFixed(3)}`,
        detail: {
          raw: explanation.raw,
          probability: explanation.probability,
          expected_value: explanation.expectedValue,
          band,
          top_factors: visible.map(c => ({ key: c.key, label: c.label, contribution: c.contribution })),
        },
        reason,
      });
      setSignalRecorded(signal);
    } catch (err) {
      setSignalError(err instanceof Error ? err.message : 'Risk signal could not be recorded.');
    }
  };

  const dispatchEscalation = async () => {
    if (!explanation) return;
    setEscalationError('');
    try {
      const params: DispatchNotificationParams = {
        applicationId: app.id,
        kind: 'ESCALATION',
        subject: `High advisory risk score for ${app.ref_no}`,
        body: `Advisory risk score ${percentage}% (high band). Top contributing factors: ${visible.slice(0, 3).map(c => `${c.label}: ${c.contribution.toFixed(3)}`).join('; ')}. Review the advisory panel and recorded risk signal before acting.`,
        channel: ['in_app'],
      };
      const result = await repo.dispatchNotification(params);
      const attempt = result.attempts[0];
      setEscalationDispatched({ notificationId: result.notificationId, status: attempt.status });
    } catch (err) {
      setEscalationError(err instanceof Error ? err.message : 'Escalation could not be dispatched.');
    }
  };

  return (
    <section className="dossier-paper intelligence-panel advisory-panel">
      <div className="spread advisory-heading">
        <div>
          <h2>Breach-risk advisory</h2>
          <p className="muted">TreeSHAP risk score computed from captured case metadata. It is a reviewer aid, not an official decision, and it is recorded as an integrity signal when confirmed.</p>
        </div>
        <span className={`advisory-chip ${band}`}>{band.charAt(0).toUpperCase() + band.slice(1)} band</span>
      </div>
      {snapshot.coverage !== 'current' && <p className="callout warning">This snapshot is marked {snapshot.coverage}. The advisory uses the captured facts that are present and does not reconstruct missing historical fields.</p>}
      {evaluation.error && <p className="callout warning" role="alert">{evaluation.error}</p>}
      {explanation && (
        <>
          <div className="analysis-comparison advisory-summary">
            <article>
              <span>Estimated 14-day escalation risk</span>
              <strong>{percentage}<small>%</small></strong>
              <p>{BAND_COPY[band]} · model baseline {explanation.expectedValue.toFixed(3)} log-odds.</p>
              <progress max={100} value={Math.round(explanation.probability * 100)} aria-label="Advisory risk" />
            </article>
            <article>
              <span>Model artifact</span>
              <strong>{RISK_MODEL.trees.length}<small> trees</small></strong>
              <p>{RISK_MODEL.training.rows.toLocaleString()} synthetic training rows · validation AUC {RISK_MODEL.training.auc.toFixed(2)} · seed {RISK_MODEL.training.seed}.</p>
            </article>
          </div>
          <h3>Why this estimate</h3>
          <p className="muted">Contributions are log-odds changes from the model baseline. They describe this synthetic model, not causal effects or a judgment about the institution.</p>
          <div className="table-scroll" tabIndex={0}>
            <table>
              <caption>Captured feature values and TreeSHAP contributions, largest absolute contribution first</caption>
              <thead><tr><th>Feature</th><th>Captured value</th><th>Contribution</th></tr></thead>
              <tbody>
                {visible.map(contribution => {
                  const row = rowByKey.get(contribution.key);
                  return (
                    <tr key={contribution.key}>
                      <td>{contribution.label}<small>{row?.description}</small></td>
                      <td>{row ? formatRiskFeatureValue(row, rows) : '—'}</td>
                      <td className={contribution.contribution >= 0 ? 'advisory-positive' : 'advisory-negative'}>{contribution.contribution >= 0 ? '+' : ''}{contribution.contribution.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="button secondary small" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show top 8 features' : `Show all ${explanation.contributions.length} features`}</button>
          </div>
        </>
      )}
      <div className="advisory-actions">
        <button className="button" type="button" onClick={recordSignal} disabled={busy||!explanation||!!signalRecorded}>
          <ShieldAlert size={14}/> Record advisory risk signal
        </button>
        {signalRecorded && (
          <span className="muted">Signal recorded · {signalRecorded.signal_type} · {signalRecorded.severity}</span>
        )}
        {band === 'high' && (
          <>
            <button className="button" type="button" onClick={dispatchEscalation} disabled={busy||!!escalationDispatched}>
              <Send size={14}/> Dispatch escalation notification
            </button>
            {escalationDispatched && (
              <span className="muted">Escalation dispatched · {escalationDispatched.status}</span>
            )}
          </>
        )}
        {signalError && <p className="callout warning" role="alert">{signalError}</p>}
        {escalationError && <p className="callout warning" role="alert">{escalationError}</p>}
      </div>
      <h3>Draft a notice for human review</h3>
      <p className="muted">Builds a deterministic draft from the captured issues and the seeded handbook corpus. It does not call an external model and does not issue anything.</p>
      <div className="form-actions">
        <button type="button" className="button" onClick={createDraft}><FileText size={14}/>Draft notice</button>
        {draft && <button type="button" className="button secondary" onClick={() => download(`review-notice-${snapshot.facts.application.ref_no.replace(/[^a-z0-9-]+/gi, '-')}.txt`, draft.body)}><Download size={14}/>Export draft</button>}
      </div>
      {draftError && <p className="callout warning" role="alert">{draftError}</p>}
      {draft && (
        <>
          <label className="field">Draft for human review<textarea readOnly rows={18} value={draft.body}/></label>
          <details>
            <summary>Handbook references used · {draft.citations.length}</summary>
            {draft.citations.length ? (
              <ul className="advisory-citations">
                {draft.citations.map(citation => (
                  <li key={citation.clause.clause_number}>
                    <strong>Clause {citation.clause.clause_number} — {citation.clause.clause_title}</strong>
                    <p>{citation.reason}</p>
                    <code>chapter {citation.clause.chapter_number} · page {citation.clause.page_number} · synthetic seed</code>
                  </li>
                ))}
              </ul>
            ) : <p>No seeded handbook clause matched the captured issue terms.</p>}
          </details>
          <p className="muted">{draft.disclaimer}</p>
          <p className="muted">Draft generated from snapshot captured {formatDateTime(draft.generatedAt)} · source {draft.sourceHash.slice(0, 20)}…</p>
        </>
      )}
      <details>
        <summary>Model card and limitations</summary>
        <ul>
          <li>Synthetic label: a 14-day escalation or breach event generated from a documented latent-risk process. The model was not trained on real applications and is not validated for operational use.</li>
          <li>Training used {RISK_MODEL.training.rows.toLocaleString()} synthetic rows and {RISK_MODEL.training.validation_rows.toLocaleString()} held-out synthetic rows; validation AUC {RISK_MODEL.training.auc.toFixed(3)}, log loss {RISK_MODEL.training.log_loss.toFixed(3)}.</li>
          <li>Features are counts and dates from the captured snapshot. Missing or stale source fields reduce the meaning of the score; they are not silently reconstructed.</li>
          <li>TreeSHAP contributions explain this model's log-odds output. They are not probabilities, causal effects, or evidence that an institution is non-compliant.</li>
          <li>The notice draft cites seeded synthetic handbook excerpts. A permitted human reviewer must verify every fact and citation before any action.</li>
          <li>The risk score is recorded as an integrity signal and high-risk scores trigger an escalation notification. The signal and notification are part of the case audit trail.</li>
        </ul>
      </details>
    </section>
  );
}
