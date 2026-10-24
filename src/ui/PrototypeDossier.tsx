import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Download,
  FileText,
  LockKeyhole,
} from 'lucide-react';
import { DocumentPreview } from './DocumentPreview';
import {
  actionLabels,
  allowedActions,
  missingInputs,
  nextAuthority,
  roleLabels,
  routeStageIndex,
  routeStages,
  type Application,
  type Identity,
  type Advisory,
  type Repository,
  type Status,
  type Workspace,
} from '../domain/model';
import { Badge, Due } from './common';

interface Props {
  app: Application;
  data: Workspace;
  identity: Identity;
  repo: Repository;
  busy: boolean;
  back: () => void;
  openReceipt?: (id: string) => void;
  openCase?: (id: string) => void;
}

type Tab = 'evidence' | 'history' | 'precheck';

export function PrototypeDossier({
  app,
  data,
  identity,
  repo,
  busy,
  back,
  openReceipt,
  openCase,
}: Props) {
  const documents = data.documents.filter(d => d.application_id === app.id);
  const claims = data.claims.filter(c => c.application_id === app.id);
  const deficiencies = data.deficiencies.filter(d => d.application_id === app.id);
  const events = data.events.filter(e => e.application_id === app.id);
  const verifiedClaims = claims.filter(c => ['verified', 'not_applicable'].includes(c.status)).length;
  const openDeficiencies = deficiencies.filter(d => ['open', 'escalated'].includes(d.status)).length;
  const actions = allowedActions(app, identity, repo.mode);
  const institution = data.institutions.find(i => i.id === app.institution_id)?.name ?? 'Demo institution';
  const nextGate = nextAuthority(app.status);
  const roleName = roleLabels[identity.roles[0]?.role ?? 'national_admin'];
  const closed = ['approved', 'rejected'].includes(app.status);

  const reqFields = app.template_snapshot.required_fields;
  const completedFields = reqFields.filter(f => app.form_data[f.key]?.trim()).length;
  const reqDocs = app.template_snapshot.required_documents;
  const cleanDocs = reqDocs.filter(type =>
    documents.some(d => d.doc_type === type && d.scan_status === 'clean'),
  ).length;

  const missing = missingInputs(app, documents);

  const [tab, setTab] = useState<Tab>('evidence');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(
    documents.find(d => d.scan_status === 'clean')?.id ?? documents[0]?.id ?? null,
  );
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [advisoryError, setAdvisoryError] = useState('');

  const selectedDoc = documents.find(d => d.id === selectedDocId) ?? null;
  const linkedClaimIds = selectedDoc
    ? data.claim_evidence.filter(l => l.document_id === selectedDoc.id).map(l => l.claim_id)
    : [];
  const docClaims = claims.filter(c => linkedClaimIds.includes(c.id));
  const docSignals = selectedDoc
    ? data.integrity_signals.filter(s => s.document_id === selectedDoc.id)
    : [];

  const runPrecheck = async () => {
    setAdvisoryError('');
    try {
      setAdvisory(await repo.advisory(app, documents));
    } catch (e) {
      setAdvisoryError(e instanceof Error ? e.message : 'Pre-check could not run.');
    }
  };

  const downloadDoc = async (id: string) => {
    const doc = documents.find(d => d.id === id);
    if (doc) {
      try {
        await repo.download(doc);
      } catch (e) {
        setAdvisoryError(e instanceof Error ? e.message : 'Download failed.');
      }
    }
  };

  return (
    <div className="prototype-dossier-shell" data-prototype="dossier">
      <header className="prototype-dossier-header">
        <div className="prototype-dossier-header-top">
          <button className="text-button" onClick={back}>
            <ArrowLeft size={15} />
            Worklist
          </button>
          <span className="mono">{app.ref_no}</span>
          <Badge status={app.status as Status} />
          <span className="document-tag">{app.is_demo ? 'Synthetic record' : 'Connected record'}</span>
          <Due app={app} />
        </div>
        <h1 className="prototype-institution" id="prototype-dossier-title">
          {institution}
        </h1>
        <p className="prototype-case-subtitle">{app.title}</p>
        <div className="prototype-dossier-meta">
          <span>{app.region} region</span>
          <span>Next authority: {nextGate}</span>
          <span className="mono">template v{app.template_version}.0</span>
        </div>
      </header>

      {app.form_data?.shc_appeal_active === 'true' && (
        <div className="prototype-shc-alert" role="status" style={{ padding: '0.85rem 1.25rem', background: 'var(--info-soft)', border: '1px solid var(--info-border)', color: 'var(--info-text)', borderRadius: '8px', margin: '0 0 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <strong style={{ color: 'var(--info-strong)' }}>APH Standing Hearing Committee (SHC) Appeal In Progress</strong>
          <span style={{ fontSize: '0.85rem', color: 'var(--info-text)' }}>A statutory appeal under APH Chapter 2 has been registered. Hearing panel review and compliance verification are underway.</span>
        </div>
      )}

      <div className="prototype-role-line">
        <LockKeyhole size={14} />
        <span>
          Viewing as <strong>{roleName}</strong>.{' '}
          {closed
            ? 'This record is closed.'
            : actions.length
              ? 'You hold the next permitted action.'
              : `Read-only at this gate. ${nextGate} holds the next action.`}
        </span>
      </div>

      <ol className="prototype-route" aria-label="Approval route">
        {routeStages.map((stage, idx) => {
          const current = routeStageIndex(app.status);
          return (
            <li
              key={stage.key}
              className={
                idx < current
                  ? 'prototype-route-step done'
                  : idx === current
                    ? 'prototype-route-step current'
                    : 'prototype-route-step'
              }
            >
              <span className="prototype-route-dot" aria-hidden="true">
                {idx < current ? <Check size={11} /> : idx === current ? '•' : idx + 1}
              </span>
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>

      {missing.length > 0 && (
        <div className="prototype-blocker" role="note">
          <CircleAlert size={15} />
          <div>
            <strong>
              {missing.length} blocker{missing.length === 1 ? '' : 's'} before this dossier can
              advance
            </strong>
            <p>
              {missing.slice(0, 3).join(' · ')}
              {missing.length > 3 ? ` · +${missing.length - 3} more` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="prototype-tabs" role="tablist" aria-label="Dossier sections">
        {([
          ['evidence', 'Evidence'],
          ['history', `History (${events.length})`],
          ['precheck', 'Pre-check'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-label={label}
            aria-selected={tab === key}
            className={tab === key ? 'prototype-tab active' : 'prototype-tab'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'evidence' && (
        <div className="prototype-dossier-grid" role="tabpanel" aria-label="Evidence">
          <aside className="prototype-dossier-nav" aria-label="Documents">
            <span className="prototype-nav-label">DOCUMENTS</span>
            {reqDocs.map(type => {
              const matches = documents.filter(d => d.doc_type === type);
              const hasClean = matches.some(d => d.scan_status === 'clean');
              return (
                <div key={type} className="prototype-nav-group">
                  <div className="prototype-nav-group-head">
                    <span>{type}</span>
                    {hasClean ? (
                      <span className="document-tag clean">
                        <Check size={10} />
                        Attached
                      </span>
                    ) : (
                      <span className="document-tag pending">Required</span>
                    )}
                  </div>
                  {matches.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      className={
                        selectedDoc?.id === d.id
                          ? 'prototype-doc-link selected'
                          : 'prototype-doc-link'
                      }
                      aria-pressed={selectedDoc?.id === d.id}
                      onClick={() => setSelectedDocId(d.id)}
                    >
                      <FileText size={13} />
                      <span>{d.file_name}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            <div className="prototype-nav-facts">
              <span>{documents.length} files</span>
              <span>
                {verifiedClaims} of {claims.length} claims resolved
              </span>
            </div>
          </aside>

          <div className="prototype-dossier-main">
            <section className="prototype-evidence" aria-label="Selected document">
              <div className="prototype-section-head">
                <h2>{selectedDoc ? selectedDoc.file_name : 'No document selected'}</h2>
              </div>

              {selectedDoc ? (
                <div className="prototype-document-surface">
                  <DocumentPreview
                    document={selectedDoc}
                    claim={docClaims[0]?.statement_snapshot}
                  />
                  <dl className="prototype-document-facts">
                    <div>
                      <dt>File security</dt>
                      <dd>
                        {selectedDoc.scan_status === 'clean'
                          ? 'Clean scan'
                          : selectedDoc.scan_status === 'pending'
                            ? 'Quarantined'
                            : 'Rejected'}
                      </dd>
                    </div>
                    <div>
                      <dt>Validity</dt>
                      <dd>
                        {selectedDoc.expires_on
                          ? selectedDoc.expires_on < new Date().toISOString().slice(0, 10)
                            ? `Expired ${selectedDoc.expires_on}`
                            : `Valid to ${selectedDoc.expires_on}`
                          : 'No expiry recorded'}
                      </dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>{selectedDoc.doc_type}</dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>{(selectedDoc.size_bytes / 1024).toFixed(0)} KB</dd>
                    </div>
                    <div>
                      <dt>Uploaded</dt>
                      <dd>{new Date(selectedDoc.uploaded_at).toLocaleDateString('en-IN')}</dd>
                    </div>
                    <div>
                      <dt>Origin</dt>
                      <dd>Synthetic file</dd>
                    </div>
                  </dl>
                  <button
                    className="button outline"
                    disabled={selectedDoc.scan_status !== 'clean' || busy}
                    onClick={() => void downloadDoc(selectedDoc.id)}
                  >
                    <Download size={15} />
                    Download
                  </button>

                  {docSignals.length > 0 && (
                    <div className="prototype-signal-list">
                      <h3>Integrity signals</h3>
                      <ul>
                        {docSignals.map(s => (
                          <li key={s.id}>
                            <CircleAlert size={13} />
                            <span>
                              {s.signal_type.replaceAll('_', ' ')} · {s.disposition}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="prototype-doc-claims">
                    <h3>Claims backed by this document</h3>
                    {docClaims.length > 0 ? (
                      <ul>
                        {docClaims.map(c => (
                          <li key={c.id}>
                            <span>{c.statement_snapshot}</span>
                            <Badge status={c.status as any} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="quiet">This document is not linked to any claim.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="prototype-empty-surface">
                  <FileText size={30} />
                  <p className="quiet">No document is attached to this case yet.</p>
                </div>
              )}
            </section>
          </div>

          <aside className="prototype-dossier-aside" aria-label="Claims and actions">
            <div className="prototype-readiness">
              <div className="prototype-readiness-row">
                <div>
                  <span className="prototype-readiness-label">Submission</span>
                  <small>
                    {completedFields} of {reqFields.length} fields · {cleanDocs} of {reqDocs.length}{' '}
                    required documents
                  </small>
                </div>
                <strong>
                  {completedFields === reqFields.length && cleanDocs === reqDocs.length
                    ? 'Complete'
                    : 'Incomplete'}
                </strong>
              </div>
              {claims.length > 0 && (
                <div className="prototype-readiness-row">
                  <div>
                    <span className="prototype-readiness-label">Review</span>
                    <small>
                      {claims.length - verifiedClaims} unresolved claim
                      {claims.length - verifiedClaims === 1 ? '' : 's'} · {openDeficiencies} open
                      deficiency{openDeficiencies === 1 ? '' : 'ies'}
                    </small>
                  </div>
                  <strong>
                    {closed
                      ? 'Closed'
                      : verifiedClaims === claims.length && openDeficiencies === 0
                        ? 'Complete'
                        : 'Pending'}
                  </strong>
                </div>
              )}
              <div className="prototype-readiness-row">
                <div>
                  <span className="prototype-readiness-label">Current authority</span>
                  <small>The next permitted action belongs to this role</small>
                </div>
                <strong>{nextGate}</strong>
              </div>
            </div>

            <div className="prototype-claims-block">
              <h3>Claims</h3>
              {claims.length > 0 ? (
                <ul className="prototype-claim-list">
                  {claims.map(c => {
                    const def = deficiencies.find(
                      d => d.claim_id === c.id && ['open', 'escalated'].includes(d.status),
                    );
                    return (
                      <li key={c.id} className="prototype-claim">
                        <div className="prototype-claim-head">
                          <span>{c.statement_snapshot}</span>
                          <Badge status={c.status as any} />
                        </div>
                        <small className="quiet">{c.clause_snapshot}</small>
                        {c.verified_by && (
                          <small className="quiet">Verified by {c.verified_by}</small>
                        )}
                        {def && (
                          <small className="quiet amber">
                            Open deficiency · due {def.due_at.slice(0, 10)}
                          </small>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="quiet">No claims recorded for this case.</p>
              )}
            </div>

            {app.decision_reason && (
              <div className="prototype-receipt-card">
                <span className="prototype-receipt-label">DECISION RECEIPT</span>
                <strong>{app.status === 'approved' ? 'Approved' : 'Rejected'}</strong>
                <p>{app.decision_reason}</p>
                {openReceipt && (
                  <button className="text-button" type="button" onClick={() => openReceipt(app.id)}>
                    Open full receipt <ArrowRight size={12} />
                  </button>
                )}
              </div>
            )}

            <div className="prototype-access-card">
              <span className="prototype-access-label">YOUR ACCESS</span>
              <strong>{roleName}</strong>
              <p>
                {actions.length
                  ? 'You hold the next permitted action.'
                  : closed
                    ? 'This record is closed and read-only.'
                    : `Read-only at this gate. ${nextGate} holds the next action.`}
              </p>
              <div className="prototype-access-actions">
                {actions.map(a => (
                  <button
                    key={a}
                    type="button"
                    className={`button ${['reject', 'raise_deficiency'].includes(a) ? 'outline' : ''}`}
                    disabled={busy}
                    onClick={() => openCase?.(app.id)}
                  >
                    {actionLabels[a]}
                  </button>
                ))}
                {!actions.length && (
                  <span className="quiet">
                    <LockKeyhole size={14} /> No actions available to your role
                  </span>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {tab === 'history' && (
        <section className="prototype-history" role="tabpanel" aria-label="History">
          <div className="prototype-section-head">
            <h2>Decision history</h2>
            <span className="mono">{events.length} events</span>
          </div>
          <ol className="prototype-timeline">
            {events
              .slice()
              .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
              .map(e => (
                <li key={e.id}>
                  <span className="prototype-timeline-dot" aria-hidden="true" />
                  <div>
                    <strong>{e.action.replaceAll('_', ' ')}</strong>
                    <small className="mono">
                      {new Date(e.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </small>
                    <p>
                      {e.reason ||
                        `${e.from_status ? e.from_status + ' → ' : ''}${e.to_status ?? ''}`}
                    </p>
                    <small className="quiet">{e.actor_role?.replaceAll('_', ' ') || 'system'}</small>
                  </div>
                </li>
              ))}
          </ol>
        </section>
      )}

      {tab === 'precheck' && (
        <section className="prototype-precheck" role="tabpanel" aria-label="Pre-check">
          <div className="prototype-section-head">
            <div>
              <h2>Evidence pre-check</h2>
              <p className="quiet">Metadata review for human decision support · no external model</p>
            </div>
            <button className="button outline" type="button" disabled={busy} onClick={() => void runPrecheck()}>
              Run pre-check
            </button>
          </div>
          {advisoryError && (
            <div className="callout warning" role="alert">
              <strong>Pre-check unavailable</strong>
              <p>{advisoryError}</p>
            </div>
          )}
          {advisory ? (
            <div className="prototype-advisory">
              <div className="spread">
                <span className="document-tag clean">Advisory only</span>
                <span className="quiet">Follow-up: {advisory.automation.state}</span>
              </div>
              <p>{advisory.summary}</p>
              {advisory.warnings.length > 0 && (
                <ul>
                  {advisory.warnings.map(w => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <small className="quiet">{advisory.disclaimer}</small>
            </div>
          ) : (
            <div className="callout">
              <strong>Advisory only</strong>
              <p>
                Run a scoped evidence check before human review. The result can explain metadata
                gaps, but it cannot change workflow status.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

