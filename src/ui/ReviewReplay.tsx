import {neutralCopy} from '../domain/presentation';
import {useEffect,useState} from 'react';
import {historyCoverage,reviewTimeline,replayClaimState,type CaseHistory} from '../domain/review';
import type {Application} from '../domain/model';

const kindLabels:Record<string,string>={review_baseline:'Current-state baseline',claim_verified:'Review recorded',claim_evidence_linked:'Evidence linked',claim_evidence_unlinked:'Evidence unlinked',review_invalidated:'Review requires reconsideration',deficiency_raised:'Correction requested',deficiency_resolved:'Response submitted',deficiency_rechecked:'Response rechecked'};

function stamp(value:string){return new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+' · '+new Date(value).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});}

export function ReviewReplay({app,history,error,retry}:{app:Application;history:CaseHistory|null;error:string;retry:()=>void}){
  const entries=reviewTimeline(history?.events??[]);
  const [index,setIndex]=useState(-1);
  useEffect(()=>setIndex(entries.length-1),[history?.through,entries.length]);
  const snapshot=replayClaimState([],entries,index);
  const selected=entries[index];
  const coverage=history?historyCoverage(history):null;
  return <section id="replay" className="dossier-paper"><div className="dossier-paper-heading"><div><div><h2>Replayable review record</h2><p>Inspect recorded snapshots. Earlier actions without a snapshot remain limited records.</p></div></div><span className="mono">WORKFLOW v{app.template_version} · {entries.length} EVENTS</span></div>
    <div className="replay-body">
      {error?<div className="callout warning"><strong>History unavailable</strong><p>{error}</p><button className="button outline" onClick={retry}>Retry history</button></div>:!history?<p role="status">Loading case history…</p>:<>
        {coverage?.message&&<p className="callout warning">{coverage.message}</p>}
        {coverage?.baseline&&<p className="history-coverage">History includes a current-state baseline. Earlier review evidence was not reconstructed. A recorded action does not establish its missing evidence basis.</p>}
        {history.message&&<p className="history-coverage">{history.message}</p>}
        {entries.length?<>
          <label className="field">Recorded event<select value={index} onChange={event=>setIndex(Number(event.target.value))}>{entries.map((entry,i)=><option value={i} key={entry.sequence}>#{entry.sequence} · {kindLabels[entry.kind]??entry.kind.replaceAll('_',' ')}{entry.result?' · '+entry.result:''}</option>)}</select></label>
          <div className="inline"><button className="button outline button-small" disabled={index<=0} onClick={()=>setIndex(value=>value-1)}>Previous event</button><button className="button outline button-small" disabled={index>=entries.length-1} onClick={()=>setIndex(value=>value+1)}>Next event</button></div>
          <div className="replay-panel">
            {snapshot?<div className="replay-snapshot"><span className="replay-snapshot-label">Recorded claim state · event {selected?.sequence}</span><div className="replay-counts"><span><b>{snapshot.verified}</b>recorded verified or n/a</span><span><b>{snapshot.current}</b>basis current at that event</span><span><b>{snapshot.deficient}</b>deficient</span><span><b>{snapshot.unverified}</b>awaiting review</span></div></div>:<p className="history-coverage">Recorded action only. Its historical claim state and evidence basis are unavailable.</p>}
            {selected&&<div className="replay-detail"><div className="replay-detail-head"><span className="replay-chip">{kindLabels[selected.kind]??selected.kind.replaceAll('_',' ')}</span><span className="mono">{stamp(selected.at)}</span></div><strong>{selected.statement}</strong>{selected.actor&&<small>Recorded actor: {selected.actor}</small>}{selected.note&&<p>{selected.note}</p>}
              {selected.snapshot&&<><small>Requirement pack versions: {[...new Set(selected.snapshot.claims.map(claim=>claim.requirement_version_snapshot??1))].join(', ')||'Not recorded'} · workflow v{selected.snapshot.application.workflow_version}</small>
                <details><summary>Claims and evidence at this event</summary><ul className="review-basis-list">{selected.snapshot.claims.map(claim=><li key={claim.id}><strong>{neutralCopy(claim.statement_snapshot)}</strong><span>{claim.status.replaceAll('_',' ')} · {claim.basis_current?'basis current when recorded':'review basis unavailable or stale when recorded'}</span><small>{claim.verification_basis?.documents.map(document=>document.doc_type+' · '+document.id).join('; ')||'No document review basis recorded'}{claim.verification_note?' · '+claim.verification_note:''}</small></li>)}</ul></details>
                {selected.snapshot.deficiencies.length>0&&<ul className="review-basis-list">{selected.snapshot.deficiencies.map(item=><li key={item.id}><strong>{neutralCopy(item.observation)}</strong><span>Response {item.response_revision??0} · {item.status}{item.rechecked_at?' · rechecked':''}</span><p>{item.resolution_note??item.remedy}</p>{item.evidence_id&&<small>Response evidence: {selected.snapshot!.documents.find(document=>document.id===item.evidence_id)?.file_name??item.evidence_id}</small>}{item.recheck_note&&<p>Reviewer: {item.recheck_note}</p>}</li>)}</ul>}
              </>}
              <small className="replay-basis">This view does not change stored state or assert document authenticity.</small>
            </div>}
          </div>
        </>:<p>No case events are available.</p>}
      </>}
    </div>
  </section>;
}
