import {assessSnapshot,indiaDate,type AnalysisSnapshot} from './intelligence';
import {documentEligible} from './approvals';
export interface GuideCitation{id:string;kind:string;label:string;excerpt:string}
export interface ReviewGuide{title:string;answer:string;citations:GuideCitation[];actions:{owner:string;task:string;source:string}[];draft?:string;disclaimer:string}
export function reviewGuide(snapshot:AnalysisSnapshot,topic:'blockers'|'evidence'|'deadline'|'scope'|'next'|'draft'):ReviewGuide{
 const f=snapshot.facts,a=f.application,attention=assessSnapshot(snapshot),citations:GuideCitation[]=[],actions:ReviewGuide['actions']=[];
 const cite=(id:string,kind:string,label:string,excerpt:string)=>citations.push({id,kind,label,excerpt});
 let title='Next review steps',answer='Use the recorded case and the current role’s permitted actions.';
 if(topic==='blockers'||topic==='next'||topic==='draft'){
  title=topic==='blockers'?'Why this captured case needs attention':'Recorded next steps';answer=attention.blockers.length?attention.blockers.join('\n'):'No blocker is visible in the captured metadata. This is not an approval or authenticity determination.';
  for(const d of f.deficiencies.filter(item=>['open','escalated'].includes(item.status))){cite(d.id,'correction',d.clause,d.observation+' Remedy: '+d.remedy);actions.push({owner:'Institution; then assigned reviewer',task:d.remedy,source:d.id});}
  for(const c of f.claims.filter(item=>!['verified','not_applicable'].includes(item.status))){cite(c.id,'claim',c.clause_snapshot,c.statement_snapshot+' Status: '+c.status);actions.push({owner:c.verification_method==='system_check'?'Assigned reviewer':'Institution and assigned reviewer',task:'Review '+c.statement_snapshot,source:c.id});}
  for(const review of f.case_reviews??[]){cite(review.id,'independent review',review.kind.replaceAll('_',' '),review.status+'; '+(review.recommendation??'recommendation pending')+'; '+review.assignment_reason);if(review.mandatory&&review.status!=='cancelled'&&(review.status!=='completed'||review.basis_current===false))actions.push({owner:'Assigned independent reviewer; or case manager',task:'Complete a recommendation bound to the current evidence or explicitly replace the stale review.',source:review.id});}
  if(!attention.scopeReviewCurrent)actions.push({owner:'Assigned scrutiny officer',task:'Review current requested course scope',source:'scope:'+a.scope_revision});
 }
 if(topic==='evidence'){
  title='Evidence versions and validity';answer=`${attention.requiredEvidenceCurrent} of ${attention.requiredEvidenceTotal} required categories have current reviewed validity. A clean scan and an accepted claim are separate facts.`;
  for(const d of f.documents){cite(d.id,'document',d.file_name,`SHA-256: ${d.sha256??'not released'}; scan: ${d.scan_status}; validity: ${d.validity_mode??'unknown'}; expiry: ${d.expires_on??'not stated'}; reviewed: ${d.validity_reviewed_at??'not reviewed'}`);if(!documentEligible(d,indiaDate(snapshot.captured_at)))actions.push({owner:'Authorised validity reviewer',task:'Inspect validity and source for '+d.doc_type,source:d.id});}
 }
 if(topic==='deadline'){
  title='Recorded deadline basis';answer=a.sla_due_at?`The captured application deadline is ${a.sla_due_at}. Continuing obligations have independent due dates.`:'No application deadline is captured. Continuing obligations may still be open.';
  for(const d of f.deadlines){const n=f.notices.find(item=>item.id===d.notice_id);cite(d.id,'deadline',n?.code??'Recorded deadline revision',`Due ${d.new_due_at}; trigger ${d.trigger_at??'fixed date'}; ${d.calendar_basis}; source version ${d.source_version}; ${d.status}.`);}
  for(const o of f.obligations)cite(o.id,'obligation',o.title,`Due ${o.due_date}; status ${o.status}; approval ${o.approval_id??'not linked'}.`);
 }
 if(topic==='scope'){
  title='Approval scope and continuing conditions';answer=`Academic year ${a.academic_year_start??'not captured'}; scope revision ${a.scope_revision??0}; reviewed revision ${a.scope_reviewed_revision??'not captured'}. Earlier outcomes are not reconstructed as approval records.`;
  for(const s of f.scope_requests)cite(s.id,'course',s.course_name,`Previous approved ${s.previous_approved_intake??'not captured'}; requested ${s.requested_intake}; course key ${s.course_key}.`);
  for(const p of f.approvals)cite(p.id,'approval',p.source_ref,`Coverage ${p.valid_from} to ${p.valid_to}; conditions ${p.conditions.join('; ')||'none recorded'}.`);
 }
 const draft=topic==='draft'?`DRAFT FOR HUMAN REVIEW — ${a.ref_no}\nCaptured source: ${snapshot.source_hash}\n${citations.length?citations.map((c,index)=>`${index+1}. ${c.label}: ${c.excerpt} [${c.id}]`).join('\n'):'No recorded correction is available to draft.'}\nA permitted human reviewer must inspect the exact evidence and record any action through the workflow. This draft does not issue a notice or decide the application.`:undefined;
 return {title,answer,citations,actions,draft,disclaimer:'Deterministic case guidance from this snapshot. No external model, legal-source verification, document-authenticity claim or automatic workflow action.'};
}
export function searchCaseFacts(snapshot:AnalysisSnapshot,query:string){
 const terms=query.toLowerCase().split(/\s+/).filter(word=>word.length>1).slice(0,12);
 const documents:GuideCitation[]=[...snapshot.facts.claims.map(c=>({id:c.id,kind:'claim',label:c.clause_snapshot,excerpt:c.statement_snapshot+' '+c.status})),...snapshot.facts.deficiencies.map(d=>({id:d.id,kind:'correction',label:d.clause,excerpt:d.observation+' '+d.remedy})),...snapshot.facts.documents.map(d=>({id:d.id,kind:'document',label:d.file_name,excerpt:d.doc_type+' '+(d.issuer??'')+' '+(d.validity_mode??'unknown')})),...snapshot.facts.obligations.map(o=>({id:o.id,kind:'obligation',label:o.title,excerpt:o.status+' '+o.due_date}))];
 return terms.length?documents.map(item=>({item,score:terms.filter(term=>(item.label+' '+item.excerpt).toLowerCase().includes(term)).length})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id)).map(item=>item.item):[];
}
