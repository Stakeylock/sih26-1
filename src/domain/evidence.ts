import {documentEligible} from './approvals';
import type {Application,DocumentRecord,Identity,Obligation} from './model';
import {stableJson,type Claim,type Deficiency,type ReviewBasis} from './integrity';
export const demoRatioRule={id:'demo-student-faculty-ratio',version:1,max_ratio:20,source:'demo_rule'} as const;
export function evaluateDemoRatio(form:Record<string,string>,rule:{id:string;version:number;max_ratio:number;source:string}=demoRatioRule){
  const inputs=[{field:'intake',label:'Sanctioned intake',value:form.intake??''},{field:'faculty_count',label:'Faculty count',value:form.faculty_count??''}];
  if(!/^[1-9][0-9]{0,5}$/.test(form.intake??'')||!/^[1-9][0-9]{0,5}$/.test(form.faculty_count??''))return {passed:false,reason:'Positive integer intake and faculty count are required',inputs,rule};
  const ratio=Number(form.intake)/Number(form.faculty_count);
  return {passed:ratio<=rule.max_ratio,ratio:Math.round(ratio*10000)/10000,inputs,rule,reason:ratio>rule.max_ratio?'Student/faculty ratio exceeds the configured demo maximum':undefined};
}
export function reviewToday(now=Date.now()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function buildReviewBasis(app:Application,claim:Claim,links:{claim_id:string;document_id:string}[],documents:DocumentRecord[],result:'verified'|'not_applicable',today=reviewToday()):ReviewBasis{
  const ids=new Set(links.filter(link=>link.claim_id===claim.id).map(link=>link.document_id));
  const evidence=documents.filter(document=>document.application_id===app.id&&ids.has(document.id)&&(result==='not_applicable'||(claim.verification_method!=='system_check'&&currentClaimEvidence(claim,document,today)&&document.sha256)))
    .sort((a,b)=>a.id.localeCompare(b.id)).map(document=>({id:document.id,sha256:document.sha256,doc_type:document.doc_type,expires_on:document.expires_on??null,scan_status:document.scan_status,validity_mode:document.validity_mode??'unknown',issue_date:document.issue_date??null,subject_institution_id:document.subject_institution_id??null,supersedes_document_id:document.supersedes_document_id??null,validity_reviewed_at:document.validity_reviewed_at??null,validity_reviewed_by:document.validity_reviewed_by??null}));
  const inputs=result==='not_applicable'?{...app.form_data}:Object.fromEntries((claim.input_fields_snapshot??[]).map(field=>[field,app.form_data[field]??null]));
  return {schema:1,result,method:claim.verification_method,clause:claim.clause_snapshot,requirement_version:claim.requirement_version_snapshot??1,
    mandatory:claim.is_mandatory_snapshot??true,evidence_types:[...claim.evidence_types_snapshot],inputs,documents:evidence,
    system_result:claim.verification_method==='system_check'&&result==='verified'?evaluateDemoRatio(app.form_data,claim.system_rule_snapshot??demoRatioRule):null};
}
export function reviewBasisCurrent(app:Application,claim:Claim,links:{claim_id:string;document_id:string}[],documents:DocumentRecord[],today=reviewToday()){
  if(!['verified','not_applicable'].includes(claim.status)||!claim.verification_basis)return false;
  const expected=buildReviewBasis(app,claim,links,documents,claim.status as 'verified'|'not_applicable',today);
  if(claim.status==='verified'&&(claim.verification_method==='system_check'?!expected.system_result?.passed:expected.documents.length===0))return false;
  return stableJson(expected)===stableJson(claim.verification_basis);
}
export function currentClaimEvidence(claim:Claim,document:DocumentRecord,today=reviewToday()){return documentEligible(document,today)&&claim.evidence_types_snapshot.includes(document.doc_type);}
export function canUploadEvidence(app:Application,identity:Identity,claims:Claim[],deficiencies:Deficiency[],kind:string,obligations:Obligation[]=[]){
  if(app.owner_id!==identity.id||!identity.roles.some(r=>r.role==='institution'))return false;
  if(obligations.some(item=>item.application_id===app.id&&item.status!=='fulfilled'&&item.required_evidence?.includes(kind)))return true;
  if(['draft','deficiency_raised'].includes(app.status))return app.template_snapshot.required_documents.includes(kind)||claims.some(c=>c.application_id===app.id&&c.evidence_types_snapshot.includes(kind));
  return app.status==='under_scrutiny'&&deficiencies.some(d=>d.application_id===app.id&&['open','escalated'].includes(d.status)&&claims.some(c=>c.id===d.claim_id&&c.evidence_types_snapshot.includes(kind)));
}
