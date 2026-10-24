import type {Application,AuditEvent,DocumentRecord,Workspace} from './model';
import type {Claim,ClaimEvidence,Deficiency} from './integrity';
import {reviewBasisCurrent} from './evidence';

export interface ReviewSnapshot {
  schema:1;
  application:{id:string;version:number;status:Application['status'];workflow_version:number;form_data:Record<string,string>};
  calendar:string;
  claims:(Claim&{basis_current:boolean})[];
  deficiencies:Deficiency[];
  links:ClaimEvidence[];
  documents:Pick<DocumentRecord,'id'|'doc_type'|'file_name'|'sha256'|'scan_status'|'expires_on'|'uploaded_at'>[];
}
export interface CaseHistory {events:AuditEvent[];through:number;head_hash:string|null;complete:boolean;message?:string}
export interface HistoryPage {events:AuditEvent[];through:number;head_hash:string|null;next_after:number;complete:boolean}
export interface ReviewEntry {at:string;actor:string|null;kind:string;claim_id:string;clause:string;statement:string;note:string|null;sequence:number;result?:string;snapshot:ReviewSnapshot|null;baseline:boolean}

export function captureReviewSnapshot(data:Workspace,app:Application):ReviewSnapshot{
  const claims=data.claims.filter(claim=>claim.application_id===app.id);
  const snapshot:ReviewSnapshot={schema:1,application:{id:app.id,version:app.version,status:app.status,workflow_version:app.template_version,form_data:{...app.form_data}},calendar:'Asia/Kolkata / synthetic weekdays',
    claims:claims.map(claim=>({...claim,basis_current:reviewBasisCurrent(app,claim,data.claim_evidence,data.documents)})),
    deficiencies:data.deficiencies.filter(item=>item.application_id===app.id),links:data.claim_evidence.filter(link=>claims.some(claim=>claim.id===link.claim_id)),
    documents:data.documents.filter(document=>document.application_id===app.id).map(({id,doc_type,file_name,sha256,scan_status,expires_on,uploaded_at})=>({id,doc_type,file_name,sha256,scan_status,expires_on:expires_on??null,uploaded_at}))};
  return structuredClone(snapshot);
}
export function recordedSnapshot(event:AuditEvent):ReviewSnapshot|null{
  const value=event.payload.review_snapshot as ReviewSnapshot|undefined;
  return value?.schema===1&&value.application?.id===event.application_id&&Array.isArray(value.claims)&&Array.isArray(value.deficiencies)&&Array.isArray(value.links)&&Array.isArray(value.documents)?value:null;
}
export function historyCoverage(history:CaseHistory){
  const events=[...history.events].sort((a,b)=>(a.sequence??0)-(b.sequence??0));
  const contiguous=events.every((event,index)=>event.sequence===index+1);
  const unsupported=events.some(event=>event.payload.review_snapshot&&!recordedSnapshot(event));
  const full=history.complete&&contiguous&&(events.at(-1)?.sequence??0)===history.through&&!unsupported;
  return {complete:full,unsupported,baseline:events.find(event=>event.action==='review_baseline')??null,
    message:unsupported?'This history contains an unsupported snapshot version.':!full?'History is incomplete; no complete reconstruction is claimed.':undefined};
}
export function reviewTimeline(events:readonly AuditEvent[]):ReviewEntry[]{
  return [...events].sort((a,b)=>(a.sequence??0)-(b.sequence??0)||Date.parse(a.created_at)-Date.parse(b.created_at)).map(event=>{
    const snapshot=recordedSnapshot(event),claimId=String(event.payload.claim_id??'');
    const claim=snapshot?.claims.find(item=>item.id===claimId);
    return {at:event.created_at,actor:event.actor_id,kind:event.action,claim_id:claimId,clause:claim?.clause_snapshot??'',statement:claim?.statement_snapshot??event.action.replaceAll('_',' '),note:event.reason,sequence:event.sequence??0,
      result:typeof event.payload.result==='string'?event.payload.result:undefined,snapshot,baseline:event.action==='review_baseline'};
  });
}
export function replayClaimState(_claims:readonly Claim[],entries:readonly ReviewEntry[],throughIndex:number){
  const entry=entries[throughIndex];if(!entry?.snapshot)return null;
  const claims=entry.snapshot.claims;
  return {verified:claims.filter(claim=>['verified','not_applicable'].includes(claim.status)).length,
    current:claims.filter(claim=>claim.basis_current).length,deficient:claims.filter(claim=>claim.status==='deficient').length,
    unverified:claims.filter(claim=>claim.status==='unverified').length,total:claims.length,
    statuses:Object.fromEntries(claims.map(claim=>[claim.id,claim.status]))};
}
export function evidenceImpact(claim:Claim,claims:Claim[]){
  return {affected:[claim],preserved:claims.filter(other=>other.id!==claim.id&&['verified','not_applicable'].includes(other.status))};
}
