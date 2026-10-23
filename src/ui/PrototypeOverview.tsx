import { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { workingDaysUntil } from '../domain/clock';
import {
  actionLabels,
  allowedActions,
  missingInputs,
  nextAuthority,
  routeStage,
  routeStageIndex,
  type Application,
  type Identity,
  type Status,
  typeLabels,
} from '../domain/model';
import { Badge, Due, Empty } from './common';

const operationalStatus: Record<Status, string> = {
  draft: 'Draft in progress',
  submitted: 'Awaiting reviewer assignment',
  under_scrutiny: 'Officer reviewing',
  deficiency_raised: 'Awaiting institution correction',
  resubmitted: 'Awaiting reviewer assignment',
  evc_pending: 'Awaiting visit scheduling',
  evc_scheduled: 'Awaiting visit report',
  pending_decision: 'Awaiting decision',
  approved: 'Approved',
  rejected: 'Rejected',
};

type Scope = 'assigned' | 'at_risk' | 'all';

interface Props {
  data: {
    applications: Application[];
    institutions: Record<string, { name: string }>;
  };
  identity: Identity;
  open: (id: string) => void;
}

export function PrototypeOverview({ data, identity, open }: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const active = useMemo(
    () => data.applications.filter(a => !['approved', 'rejected'].includes(a.status)),
    [data.applications],
  );

  const assigned = useMemo(
    () => active.filter(a => a.owner_id === identity.id || a.assigned_officer === identity.id),
    [active, identity.id],
  );
  const atRisk = useMemo(
    () => active.filter(a => (workingDaysUntil(a.sla_due_at) ?? 99) <= 3),
    [active],
  );

  const scoped = scope === 'assigned' ? assigned : scope === 'at_risk' ? atRisk : active;

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? scoped.filter(a => {
          const institution = data.institutions[a.institution_id]?.name ?? '';
          return (
            a.ref_no.toLowerCase().includes(needle) ||
            a.title.toLowerCase().includes(needle) ||
            institution.toLowerCase().includes(needle)
          );
        })
      : scoped;
    return [...filtered].sort(
      (a, b) => (workingDaysUntil(a.sla_due_at) ?? 9999) - (workingDaysUntil(b.sla_due_at) ?? 9999),
    );
  }, [scoped, query, data.institutions]);

  const selected =
    list.find(a => a.id === selectedId) ?? list[0] ?? null;

  const canCreate = identity.roles.some(r => r.role === 'institution');

  return (
    <>
      <header className="prototype-worklist-head">
        <div>
          <h1 className="prototype-title">Applications requiring attention</h1>
          <p className="prototype-subtitle">
            {active.length} open case{active.length === 1 ? '' : 's'} · {atRisk.length} at or past risk
          </p>
        </div>
        <div className="prototype-head-actions">
          {canCreate && (
            <button className="button" onClick={() => open('new')}>
              <ArrowRight size={15} />
              New application
            </button>
          )}
        </div>
      </header>

      <div className="prototype-scope-bar" role="group" aria-label="Worklist scope">
        <div className="prototype-scope-chips">
          {([
            ['assigned', 'Assigned to me', assigned.length],
            ['at_risk', 'At risk', atRisk.length],
            ['all', 'All open', active.length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              aria-pressed={scope === key}
              className={scope === key ? 'prototype-scope-chip active' : 'prototype-scope-chip'}
              onClick={() => setScope(key)}
            >
              {label} <b>{count}</b>
            </button>
          ))}
        </div>
        <label className="prototype-search">
          <Search size={14} />
          <input
            aria-label="Search applications"
            placeholder="Search by reference, institution, or title"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="prototype-worklist-layout">
        <section className="prototype-worklist" aria-label="Applications">
          {list.length ? (
            list.map(app => {
              const institution = data.institutions[app.institution_id]?.name ?? 'Demo institution';
              const stage = routeStage(app.status);
              const actions = allowedActions(app, identity);
              const next = actions[0]
                ? actionLabels[actions[0]]
                : `Next: ${nextAuthority(app.status)}`;
              const isSelected = selected?.id === app.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  className={isSelected ? 'prototype-case selected' : 'prototype-case'}
                  aria-pressed={isSelected}
                  data-id={app.id}
                  onClick={() => setSelectedId(app.id)}
                >
                  <div className="prototype-case-top">
                    <span className="mono" data-id={app.id} title={app.id}>{app.ref_no}</span>
                    <strong>{institution}</strong>
                    <Badge status={app.status} />
                  </div>
                  <p className="prototype-case-title">{app.title}</p>
                  <div className="prototype-case-facts">
                    <span className="mono">{app.ref_no}</span>
                    <span>{typeLabels[app.app_type]}</span>
                    <span>{stage.label}</span>
                    <Due app={app} />
                  </div>
                  <div className="prototype-case-next">{next}</div>
                </button>
              );
            })
          ) : (
            <Empty title="No cases in this view">
              {query
                ? 'No case matches the current search.'
                : 'Nothing is assigned or at risk for your scope right now.'}
            </Empty>
          )}
        </section>

        {selected && (
          <aside className="prototype-preview" aria-label="Selected case preview">
            {(() => {
              const app = selected;
              const institution =
                data.institutions[app.institution_id]?.name ?? 'Demo institution';
              const stage = routeStage(app.status);
              const actions = allowedActions(app, identity);
              const missing = missingInputs(app, []);
              return (
                <>
                  <div className="prototype-preview-head">
                    <span className="mono">{app.ref_no}</span>
                    <Badge status={app.status} />
                  </div>
                  <h2>{institution}</h2>
                  <p className="prototype-preview-title">{app.title}</p>

                  <dl className="prototype-preview-facts">
                    <div>
                      <dt>Stage</dt>
                      <dd>
                        {routeStageIndex(app.status) + 1} of 5 · {stage.label}
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{operationalStatus[app.status]}</dd>
                    </div>
                    <div>
                      <dt>Deadline</dt>
                      <dd>
                        <Due app={app} />
                      </dd>
                    </div>
                    <div>
                      <dt>Next authority</dt>
                      <dd>{nextAuthority(app.status)}</dd>
                    </div>
                  </dl>

                  <div className="prototype-preview-block">
                    <h3>Why it needs attention</h3>
                    {missing.length > 0 ? (
                      <ul>
                        {missing.slice(0, 4).map(item => (
                          <li key={item}>{item}</li>
                        ))}
                        {missing.length > 4 && <li>+{missing.length - 4} more gaps</li>}
                      </ul>
                    ) : (
                      <p className="quiet">
                        Submission is complete; the case is waiting on the current authority.
                      </p>
                    )}
                  </div>

                  <div className="prototype-preview-actions">
                    {actions.length > 0 && (
                      <p className="quiet">
                        You hold the next permitted action: {actionLabels[actions[0]]}.
                      </p>
                    )}
                    {actions.length === 0 && (
                      <p className="quiet">
                        Read-only for your role. {nextAuthority(app.status)} holds the next action.
                      </p>
                    )}
                    <button className="button" onClick={() => open(app.id)}>
                      Open dossier <ArrowRight size={15} />
                    </button>
                  </div>
                </>
              );
            })()}
          </aside>
        )}
      </div>

      <footer className="prototype-footnote">
        <span>
          Worklist is calculated from visible synthetic cases. Stage and status are tracked
          separately.
        </span>
      </footer>
    </>
  );
}
