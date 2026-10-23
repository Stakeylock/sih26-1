import {useState} from 'react';
import {Check,CircleAlert,Clock3,FileCheck2,Link2,RotateCcw} from 'lucide-react';
import type {Claim,ClaimEvidence,Deficiency} from '../domain/integrity';
import {reviewTimeline,replayClaimState} from '../domain/policy';
import type {Application} from '../domain/model';

const kindLabels: Record<string,string> = {evidence_linked:'Evidence linked',verified:'Claim verified',not_applicable:'Marked not applicable',deficiency_raised:'Deficiency raised',deficiency_resolved:'Deficiency resolved',rechecked:'Re-check recorded'};
const kindIcons: Record<string,typeof Check> = {evidence_linked:Link2,verified:Check,not_applicable:FileCheck2,deficiency_raised:CircleAlert,deficiency_resolved:RotateCcw,rechecked:Clock3};

function stamp(value:string){return new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+' · '+new Date(value).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});}

export function ReviewReplay({app,claims,deficiencies,claimEvidence}:{app:Application;claims:Claim[];deficiencies:Deficiency[];claimEvidence:ClaimEvidence[]}){
  const entries=reviewTimeline(claims,deficiencies,claimEvidence);
  const [index,setIndex]=useState(entries.length-1);
  const snapshot=replayClaimState(claims,entries,index);
  const selected=entries[index];

  return <section id="replay" className="dossier-paper"><div className="dossier-paper-heading"><div><span className="section-index">07</span><div><h2>Replayable review record</h2><p>Step through the recorded reasoning to see the claim state the reviewer saw at each moment.</p></div></div><span className="mono">POLICY v{app.template_version} · {entries.length} ENTRIES</span></div>
    {entries.length?<div className="replay-body">
      <ol className="replay-track">{entries.map((entry,i)=>{const Icon=kindIcons[entry.kind]??Check;return <li key={i}><button type="button" className={`replay-node ${entry.kind}${i===index?' active':''}`} aria-pressed={i===index} onClick={()=>setIndex(i)}><Icon size={13}/><span><strong>{kindLabels[entry.kind]}</strong><small>{entry.clause}{entry.result?` · ${entry.result}`:''}</small></span></button></li>;})}</ol>
      <div className="replay-panel">
        <div className="replay-snapshot"><span className="replay-snapshot-label">Reconstructed state · as of entry {index+1} of {entries.length}</span><div className="replay-counts"><span><b>{snapshot.verified}</b>verified or n/a</span><span><b>{snapshot.deficient}</b>deficient</span><span><b>{snapshot.unverified}</b>awaiting</span><span><b>{snapshot.total}</b>total claims</span></div></div>
        {selected&&<div className="replay-detail"><div className="replay-detail-head"><span className={`replay-chip ${selected.kind}`}>{kindLabels[selected.kind]}</span><span className="mono">{stamp(selected.at)}</span></div><strong>{selected.statement}</strong>{selected.actor&&<small>by {selected.actor.replaceAll('-',' ')}</small>}{selected.note&&<p>{selected.note}</p>}<small className="replay-basis">Recorded against policy snapshot v{app.template_version}. Replaying does not change stored state.</small></div>}
      </div>
    </div>:<p className="policy-none replay-empty">No review reasoning has been recorded on this case yet.</p>}
  </section>;
}
