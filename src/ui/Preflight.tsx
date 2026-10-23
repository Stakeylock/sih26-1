import {CircleAlert,Clock3,FileCheck2,FileWarning,Link2,ShieldCheck} from 'lucide-react';
import type {Application,Workspace} from '../domain/model';

type PreflightItem={tone:'danger'|'warning'|'info';label:string;detail:string;href:string};
const money=(date:string)=>new Date(date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
export function Preflight({app,data}:{app:Application;data:Workspace}){
  const claims=data.claims.filter(claim=>claim.application_id===app.id);const links=data.claim_evidence.filter(link=>claims.some(claim=>claim.id===link.claim_id));const documents=data.documents.filter(document=>document.application_id===app.id);const deficiencies=data.deficiencies.filter(item=>item.application_id===app.id);
  const today=new Date().toISOString().slice(0,10);const items:PreflightItem[]=[];
  const claimed=new Set(links.map(link=>link.document_id));
  for(const document of documents){
    if(document.expires_on&&document.expires_on<today)items.push({tone:'danger',label:`${document.doc_type} expired`,detail:`Expired ${money(document.expires_on)}. A current document is required before the claim can verify.`,href:`#document-${document.id}`});
    const other=data.documents.find(item=>item.id!==document.id&&item.application_id!==app.id&&item.sha256&&item.sha256===document.sha256);
    if(other&&document.sha256){const otherApp=data.applications.find(item=>item.id===other.application_id);items.push({tone:'warning',label:`Duplicate hash · ${document.doc_type}`,detail:`The same SHA-256 appears in ${otherApp?.ref_no??'another case'} (${other.doc_type}). A human must disposition the signal; the duplicate alone is not a verdict.`,href:`#document-${document.id}`});}
    if(claimed.has(document.id)&&document.scan_status!=='clean')items.push({tone:'warning',label:`${document.doc_type} is not scan-clean`,detail:'Linked evidence must pass the trusted scanner before verification.',href:`#document-${document.id}`});
  }
  for(const deficiency of deficiencies){if(['open','escalated'].includes(deficiency.status))items.push({tone:'danger',label:`Open deficiency · ${deficiency.clause}`,detail:`${deficiency.observation} Due ${money(deficiency.due_at)}.`,href:`#claim-${deficiency.claim_id}`});else if(deficiency.status==='resolved'&&!deficiency.rechecked_at)items.push({tone:'info',label:`Re-check pending · ${deficiency.clause}`,detail:'The institution resolved this deficiency. The assigned scrutiny officer must re-check it.',href:`#claim-${deficiency.claim_id}`});}
  for(const claim of claims){
    if(claim.status==='unverified')items.push({tone:'warning',label:`Unverified · ${claim.clause_snapshot}`,detail:'This disclosure has not been verified or marked not applicable.',href:`#claim-${claim.id}`});
    if(claim.status==='deficient')continue;
    const current=links.some(link=>link.claim_id===claim.id&&documents.some(document=>document.id===link.document_id&&document.scan_status==='clean'&&(!document.expires_on||document.expires_on>=today)));
    if(claim.verification_method!=='system_check'&&claim.status!=='not_applicable'&&!current)items.push({tone:'warning',label:`Evidence missing · ${claim.clause_snapshot}`,detail:`Link a current clean document of type: ${claim.evidence_types_snapshot.join(' · ')}.`,href:`#claim-${claim.id}`});
  }
  return <section className="dossier-paper preflight-panel" aria-labelledby="preflight-title"><div className="dossier-paper-heading"><div className="dossier-heading-group"><span className="preflight-mark"><ShieldCheck size={15}/></span><div><h2 id="preflight-title">Pre-flight</h2><p>Advisory checks before a human decision. Server gates remain authoritative.</p></div></div><span className={items.length?'preflight-count attention':'preflight-count'}>{items.length?`${items.length} ITEM${items.length===1?'':'S'}`:<><ShieldCheck size={11}/> CLEAR</>}</span></div>{items.length?<ul className="preflight-list">{items.map((item,index)=><li className={`preflight-item ${item.tone}`} key={`${item.href}-${index}`}><span className="preflight-icon">{item.tone==='danger'?<CircleAlert size={15}/>:item.tone==='warning'?<FileWarning size={15}/>:<Clock3 size={15}/>}</span><div><a href={item.href}>{item.label}<Link2 size={11}/></a><p>{item.detail}</p></div></li>)}</ul>:<div className="preflight-clear"><FileCheck2 size={16}/><p>No advisory blockers found. The claim ledger and server gate still decide whether this record can advance.</p></div>}</section>;
}
