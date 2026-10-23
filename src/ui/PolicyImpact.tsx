import { useMemo } from 'react';
import {ArrowRight, FilePlus2, FileMinus2, Shuffle} from 'lucide-react';
import requirementsV2Json from '../data/requirements-v2.json';
import type {Requirement} from '../domain/integrity';
import {diffRequirements, policyImpact} from '../domain/policy';
import type {Application, Workspace} from '../domain/model';

const proposed = requirementsV2Json as Requirement[];

export function PolicyImpact({data, app}:{data:Workspace; app:Application}){
  const current = useMemo(() => data.requirements.filter(r => r.app_type === app.app_type), [data.requirements, app.app_type]);
  const diff = useMemo(() => diffRequirements(current, proposed.filter(r => r.app_type === app.app_type)), [current, app.app_type]);
  const impacts = useMemo(() => policyImpact(data.applications, data.claims, diff), [data.applications, data.claims, diff]);
  const changedCodes = new Set(diff.changed.map(c => c.code));

  return <section id="policy" className="dossier-paper"><div className="dossier-paper-heading"><div><span className="section-index">06</span><div><h2>Policy change impact</h2><p>Preview a handbook revision and see which live cases and evidence requirements it touches.</p></div></div><span className="mono">APH v{diff.fromVersion} → v{diff.toVersion}</span></div>
    <div className="policy-body">
      <div className="policy-diff">
        <div className="policy-group added"><span className="policy-group-label"><FilePlus2 size={12}/>New required checks</span>{diff.added.length?diff.added.map(r=><div className="policy-item" key={r.code}><code>{r.code}</code><span>{r.statement}</span><small>Evidence: {r.evidence_types.join(' · ')}</small></div>):<p className="policy-none">None — no new checks introduced.</p>}</div>
        <div className="policy-group removed"><span className="policy-group-label"><FileMinus2 size={12}/>Retired checks</span>{diff.removed.length?diff.removed.map(r=><div className="policy-item" key={r.code}><code>{r.code}</code><span>{r.statement}</span></div>):<p className="policy-none">None — no checks retired.</p>}</div>
        <div className="policy-group changed"><span className="policy-group-label"><Shuffle size={12}/>Changed checks</span>{diff.changed.length?diff.changed.map(c=><div className="policy-item" key={c.code}><code>{c.code}</code><span>{c.to.statement}</span>{c.fields.includes('evidence_types')&&<small>Evidence: {c.from.evidence_types.join(' · ')} <ArrowRight size={10}/> {c.to.evidence_types.join(' · ')}</small>}{c.fields.includes('statement')&&<small>Wording revised</small>}</div>):<p className="policy-none">None — no checks changed.</p>}</div>
      </div>

      <div className="policy-cases"><span className="policy-cases-label">Affected live cases · {impacts.length}</span>{impacts.length?impacts.map(impact=><div className="policy-case" key={impact.application_id}><span className="mono">{impact.ref_no}</span><div className="policy-case-tags">{impact.added.map(a=><b key={a.code} className="tag add">+ {a.code}</b>)}{impact.removed.map(r=><b key={r.code} className="tag remove">− {r.code}</b>)}{impact.changed.map(c=><b key={c.code} className="tag change">~ {c.code}</b>)}</div></div>):<p className="policy-none">No live case on this route is affected.</p>}</div>

      <p className="policy-note"><strong>Snapshot preserved.</strong> Each dossier keeps the policy snapshot recorded at its own review ({changedCodes.size?`${[...changedCodes].join(', ')} changes apply to new or re-opened checks only`:'no recorded verification is rewritten'}). Recorded verifications retain their original basis; adopting v{diff.toVersion} never silently re-clears a cleared claim.</p>
    </div>
  </section>;
}
