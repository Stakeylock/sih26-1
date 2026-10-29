import { neutralCopy } from '../domain/presentation';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  FileText,
} from 'lucide-react';
import { claimThreads } from './dossierFlow';
import { Badge } from './common';
import type { Application, Status, Workspace } from '../domain/model';

interface Props {
  app: Application;
  data: Workspace;
  openCase: (id: string) => void;
}

const stateLabel: Record<string, string> = {
  unverified: 'Awaiting human review',
  verified: 'Verified',
  deficient: 'Correction open',
  not_applicable: 'Not applicable',
};

export function PrototypeFlow({ app, data, openCase }: Props) {
  const threads = claimThreads(app, data);
  const corrected = threads.filter(thread => thread.corrections.length > 0).length;
  const verified = threads.filter(thread => thread.state === 'verified').length;
  const institution = data.institutions.find(item => item.id === app.institution_id)?.name ?? 'Synthetic institution';

  return (
    <div className="prototype-flow-shell" data-prototype="flow">
      <header className="prototype-dossier-header">
        <div className="prototype-dossier-header-top">
          <button className="text-button button-small" onClick={() => openCase(app.id)}>
            <ArrowLeft size={15} />
            Full dossier
          </button>
          <span className="mono">{app.ref_no}</span>
          <Badge status={app.status as Status} />
          <span className="document-tag">{app.is_demo ? 'Synthetic record' : 'Connected record'}</span>
        </div>
        <h1 className="prototype-institution">{institution}</h1>
        <p className="prototype-case-subtitle">Relationship view · claim → evidence → correction → review. Actions still live in the full dossier; this screen only reads the record.</p>
        <p className="prototype-flow-counts" role="status">
          {threads.length} claims · {verified} recorded as verified · {corrected} with an open correction
        </p>
      </header>

      <ol className="prototype-flow-threads">
        {threads.map((thread, index) => (
          <li
            key={thread.claim.id}
            className={`prototype-flow-thread ${thread.state}`}
            style={{ '--flow-index': index } as CSSProperties}
          >
            <div className="prototype-flow-thread-body">
              <section className="prototype-flow-node claim" aria-label="Claim">
                <div className="prototype-flow-node-head">
                  <span className="prototype-flow-node-title">Claim</span>
                  {thread.claim.is_mandatory_snapshot && <span className="document-tag pending">Mandatory</span>}
                  <span className="prototype-flow-state">{stateLabel[thread.state]}</span>
                </div>
                <p>{neutralCopy(thread.claim.statement_snapshot)}</p>
                <small className="mono">{neutralCopy(thread.claim.clause_snapshot)}</small>
              </section>

              <section className="prototype-flow-node evidence" aria-label="Evidence">
                <div className="prototype-flow-node-head">
                  <span className="prototype-flow-node-title">Evidence</span>
                  <span className="quiet">{thread.evidence.length} linked</span>
                </div>
                {thread.evidence.length ? (
                  <ul>
                    {thread.evidence.map(item => (
                      <li key={item.id} className={item.expired ? 'expired' : undefined}>
                        <FileText size={13} />
                        <span>{neutralCopy(item.file_name)}</span>
                        {item.expired
                          ? <span className="document-tag">Expired {item.expires_on}</span>
                          : item.scan_status === 'clean' && <span className="document-tag clean"><Check size={10} />Clean scan</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="quiet">{thread.claim.verification_method === 'system_check' ? 'Checked by the recorded system rule, not a file.' : 'No file is linked to this claim yet.'}</p>
                )}
                {thread.replacements.length > 0 && (
                  <div className="prototype-flow-replacements">
                    <span>Valid replacement available · not linked yet:</span>
                    <ul>
                      {thread.replacements.map(item => <li key={item.id}>{neutralCopy(item.file_name)}</li>)}
                    </ul>
                  </div>
                )}
              </section>

              <section className="prototype-flow-node correction" aria-label="Correction">
                <div className="prototype-flow-node-head">
                  <span className="prototype-flow-node-title">Correction</span>
                  {thread.state === 'deficient' && thread.corrections.length > 0 && <CircleAlert size={13} />}
                </div>
                {thread.corrections.length ? (
                  <ul>
                    {thread.corrections.map(item => (
                      <li key={item.id}>
                        <p><strong>{neutralCopy(item.observation)}</strong></p>
                        <p>Remedy: {neutralCopy(item.remedy)}</p>
                        <small>Due {item.due_at.slice(0, 10)} · {item.status}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="quiet">{thread.state === 'deficient' ? 'Correction is being drafted at scrutiny.' : 'No correction has been raised for this claim.'}</p>
                )}
              </section>

              <section className="prototype-flow-node review" aria-label="Review">
                <div className="prototype-flow-node-head">
                  <span className="prototype-flow-node-title">Review</span>
                </div>
                {thread.reviews.length ? (
                  thread.reviews.map((item, reviewIndex) => (
                    <p key={reviewIndex}>
                      <strong>{item.actor ? roleTag(item.actor) : 'Recorded'} reviewed this claim</strong>
                      {item.detail && <> — {neutralCopy(item.detail)}</>}
                      <small className="prototype-flow-when">{item.when.slice(0, 10)}</small>
                    </p>
                  ))
                ) : (
                  <p className="quiet">{thread.state === 'verified' ? 'Review record incomplete.' : 'No human review recorded yet.'}</p>
                )}
              </section>
            </div>
          </li>
        ))}
      </ol>

      <footer className="prototype-flow-footer">
        <p>Thread content is read from the same record the full dossier reviews. Recording a review there moves these threads on the next load — the relationships never advance on their own.</p>
        <button className="button" type="button" onClick={() => openCase(app.id)}>
          Open full dossier <ArrowRight size={14} />
        </button>
      </footer>
    </div>
  );
}

function roleTag(actorId: string) {
  if (actorId === 'demo-scrutiny') return 'Scrutiny officer';
  return actorId;
}
