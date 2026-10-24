import {z} from 'zod';
import type {Application,AuditEvent,DocumentRecord,Workspace} from './model';
import type {CaseHistory} from './review';
import {recordedSnapshot} from './review';
import {documentEligible} from './approvals';
import {reviewBasisCurrent} from './evidence';
import {workingDaysBetween,isWorkingDay} from './clock';
import {sha256Hex,stableJson} from './integrity';

export const ANALYSIS_ENGINE='review-analysis-v1';
export const dateOnly=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value,'Use a real calendar date.');
export const calendarSchema=z.strictObject({id:z.string().min(3).max(100),version:z.number().int().positive(),label:z.string().min(3).max(160),basis:z.enum(['calendar_days','weekdays']),timezone:z.literal('Asia/Kolkata'),holidays:z.array(dateOnly).max(200),source:z.string().min(3).max(1000)}).refine(value=>new Set(value.holidays).size===value.holidays.length,'Holiday dates must be unique.');
export type AnalysisCalendar=z.infer<typeof calendarSchema>;
export const demoCalendar:AnalysisCalendar={id:'demo-weekdays',version:1,label:'Synthetic weekdays; no official holidays',basis:'weekdays',timezone:'Asia/Kolkata',holidays:[],source:'demo://calendar/weekdays/v1'};
export const scenarioSchema=z.strictObject({name:z.string().trim().min(3).max(120),horizonDays:z.number().int().min(0).max(365),scrutinyDelayDays:z.number().int().min(0).max(60),evcDelayDays:z.number().int().min(0).max(60),workloadMultiplier:z.number().min(1).max(3),extraMissingClaimIds:z.array(z.string().min(1).max(100)).max(100),assumedAcceptedClaimIds:z.array(z.string().min(1).max(100)).max(100),calendar:calendarSchema});
export type ScenarioParameters=z.infer<typeof scenarioSchema>;
export const defaultScenario=():ScenarioParameters=>({name:'Current-case comparison',horizonDays:14,scrutinyDelayDays:0,evcDelayDays:0,workloadMultiplier:1,extraMissingClaimIds:[],assumedAcceptedClaimIds:[],calendar:structuredClone(demoCalendar)});
export interface AnalysisSnapshot{
  schema:1;id:string;application_id:string;captured_at:string;captured_by:string;app_version:number;head_sequence:number;head_hash:string|null;source_hash:string;
  facts:{case_reviews?:NonNullable<Workspace['case_reviews']>;application:Application;institution_name:string;documents:Omit<DocumentRecord,'file_path'>[];claims:Workspace['claims'];claim_evidence:Workspace['claim_evidence'];deficiencies:Workspace['deficiencies'];obligations:Workspace['obligations'];visits:Workspace['visits'];signals:Workspace['integrity_signals'];scope_requests:NonNullable<Workspace['scope_requests']>;approvals:NonNullable<Workspace['approvals']>;notices:NonNullable<Workspace['notices']>;deadlines:NonNullable<Workspace['deadlines']>;history:CaseHistory};
  coverage:'current'|'historical'|'partial';limitations:string[];
}
export interface SavedScenario{id:string;application_id:string;snapshot_id:string;created_by:string;created_at:string;engine_version:string;parameters:ScenarioParameters;source_hash:string;parameter_hash:string;name:string}
const DAY=86400000,IST=19800000;
export function indiaDate(at:string|number){return new Date(new Date(at).getTime()+IST).toISOString().slice(0,10);}
export function addCalendarDays(start:string,days:number,calendar:AnalysisCalendar){
  calendarSchema.parse(calendar);if(!Number.isInteger(days)||days<0||days>3660)throw new Error('Duration outside the supported range.');
  let value=Date.parse(start);if(!Number.isFinite(value))throw new Error('Trigger date is unavailable.');
  for(let count=0;count<days;){value+=DAY;if(calendar.basis==='calendar_days'||isWorkingDay(new Date(value),calendar.holidays))count++;}
  return new Date(value).toISOString();
}
export async function captureAnalysis(data:Workspace,application:Application,history:CaseHistory,actor:string,at=new Date().toISOString()):Promise<AnalysisSnapshot>{
  const same=(item:{application_id:string})=>item.application_id===application.id;
  const facts:AnalysisSnapshot['facts']={case_reviews:data.case_reviews?.filter(same)??[],application:structuredClone(application),institution_name:data.institutions.find(item=>item.id===application.institution_id)?.name??'Institution name unavailable',documents:data.documents.filter(same).map(({file_path:privatePath,...document})=>{void privatePath;return document;}),claims:data.claims.filter(same),claim_evidence:data.claim_evidence.filter(link=>data.claims.some(claim=>claim.id===link.claim_id&&same(claim))),deficiencies:data.deficiencies.filter(same),obligations:data.obligations.filter(same),visits:data.visits.filter(same),signals:data.integrity_signals.filter(same),scope_requests:data.scope_requests?.filter(same)??[],approvals:data.approvals?.filter(item=>item.application_id===application.id)??[],notices:data.notices?.filter(item=>data.deadlines?.some(deadline=>deadline.notice_id===item.id&&same(deadline)))??[],deadlines:data.deadlines?.filter(same)??[],history:structuredClone(history)};
  return {schema:1,id:'snapshot-'+crypto.randomUUID(),application_id:application.id,captured_at:at,captured_by:actor,app_version:application.version,head_sequence:history.through,head_hash:history.head_hash,source_hash:await sha256Hex(stableJson(facts)),facts:structuredClone(facts),coverage:'current',limitations:history.complete?[]:['Case history is incomplete; current facts remain available, but complete past reconstruction is not claimed.']};
}
export function snapshotAtEvent(snapshot:AnalysisSnapshot,sequence:number):AnalysisSnapshot{
  const event=snapshot.facts.history.events.find(item=>item.sequence===sequence),record=event&&recordedSnapshot(event);
  if(!event||!record)throw new Error('This event has no supported recorded snapshot.');
  const governance=record.governance as {academic_year_start?:number|null;scope_revision?:number;scope_reviewed_revision?:number|null;sla_due_at?:string|null;scope_requests?:AnalysisSnapshot['facts']['scope_requests'];approvals?:AnalysisSnapshot['facts']['approvals'];obligations?:AnalysisSnapshot['facts']['obligations'];deadlines?:AnalysisSnapshot['facts']['deadlines'];documents?:Partial<DocumentRecord>[]} | undefined;
  const documents=record.documents.map(doc=>({...doc,file_path:undefined,size_bytes:0,mime_type:'',...governance?.documents?.find(item=>item.id===doc.id)})) as unknown as AnalysisSnapshot['facts']['documents'];
  const facts:AnalysisSnapshot['facts']={...structuredClone(snapshot.facts),application:{...snapshot.facts.application,version:record.application.version,status:record.application.status,form_data:record.application.form_data,template_version:record.application.workflow_version,sla_due_at:governance?.sla_due_at??null,scope_revision:governance?.scope_revision,scope_reviewed_revision:governance?.scope_reviewed_revision,academic_year_start:governance?.academic_year_start},documents,claims:record.claims,claim_evidence:record.links,deficiencies:record.deficiencies,obligations:governance?.obligations??[],deadlines:governance?.deadlines??[],approvals:governance?.approvals??[],scope_requests:governance?.scope_requests??[],visits:[],case_reviews:[],signals:[],history:{...snapshot.facts.history,events:snapshot.facts.history.events.filter(item=>(item.sequence??0)<=sequence),through:sequence,head_hash:event.event_hash??null}};
  return {...snapshot,id:snapshot.id+':event:'+sequence,captured_at:event.created_at,app_version:record.application.version,head_sequence:sequence,head_hash:event.event_hash??null,source_hash:event.event_hash??snapshot.source_hash,facts,coverage:'partial',limitations:['Historical claim/evidence state comes from this recorded event. Visit, independent-review, signal and incomplete legacy metadata are not reconstructed from current data.',...(!governance?['This event predates governance snapshots; approval, obligation and deadline coverage is unavailable.']:[])]};
}
export interface AttentionFactor{key:string;label:string;points:number;count:number;ids:string[]}
export interface Attention{score:number|null;band:'low'|'watch'|'high'|'unknown';factors:AttentionFactor[];blockers:string[];currentClaims:number;mandatoryClaims:number;requiredEvidenceCurrent:number;requiredEvidenceTotal:number;overdueObligations:number;dueDays:number|null;scopeReviewCurrent:boolean}
export function assessSnapshot(snapshot:AnalysisSnapshot,at=snapshot.captured_at,parameters?:ScenarioParameters):Attention{
  const f=snapshot.facts,app=f.application,today=indiaDate(at),docs=f.documents.map(item=>({...item,file_path:''}));
  const extra=new Set(parameters?.extraMissingClaimIds??[]),accepted=new Set(parameters?.assumedAcceptedClaimIds??[]);
  const mandatory=f.claims.filter(claim=>claim.is_mandatory_snapshot??true);
  const current=(claim:typeof f.claims[number])=>!extra.has(claim.id)&&(accepted.has(claim.id)||(((claim as typeof claim&{basis_current?:boolean}).basis_current??reviewBasisCurrent(app,claim,f.claim_evidence,docs,today))&&(claim.status==='not_applicable'||claim.verification_method==='system_check'||f.claim_evidence.some(link=>link.claim_id===claim.id&&docs.some(doc=>doc.id===link.document_id&&claim.evidence_types_snapshot.includes(doc.doc_type)&&documentEligible(doc,today))))));
  const waiting=mandatory.filter(claim=>!current(claim));
  const open=f.deficiencies.filter(item=>(['open','escalated'].includes(item.status)||(item.status==='resolved'&&!item.rechecked_at))&&!accepted.has(item.claim_id));
  const missing=app.template_snapshot.required_documents.filter(type=>!docs.some(doc=>doc.doc_type===type&&documentEligible(doc,today)));
  const dueDays=app.sla_due_at?Math.ceil((Date.parse(app.sla_due_at)-Date.parse(at))/DAY):null;
  const overdue=f.obligations.filter(item=>item.status!=='fulfilled'&&item.due_date<today);
  const confirmed=f.signals.filter(item=>item.disposition==='confirmed');
  const scopeCurrent=!(app.scope_revision??0)||app.scope_revision===app.scope_reviewed_revision;
  const extraReviews=(f.case_reviews??[]).filter(item=>item.mandatory&&item.status!=='cancelled'&&(item.status!=='completed'||item.basis_current===false));
  const factors:AttentionFactor[]=[
    {key:'claims',label:'Mandatory claims need a current review',points:mandatory.length?Math.round(waiting.length/mandatory.length*35):0,count:waiting.length,ids:waiting.map(item=>item.id)},
    {key:'corrections',label:'Open or unchecked corrections',points:Math.min(20,open.length*10),count:open.length,ids:open.map(item=>item.id)},
    {key:'evidence',label:'Required evidence categories lack reviewed current validity',points:Math.min(35,missing.length*12),count:missing.length,ids:missing},
    {key:'deadline',label:dueDays!==null&&dueDays<0?'Application deadline passed':'Application deadline pressure',points:dueDays===null?0:dueDays<0?20:dueDays<=3?10:0,count:dueDays!==null&&dueDays<=3?1:0,ids:[]},
    {key:'obligations',label:'Continuing obligations overdue',points:Math.min(15,overdue.length*5),count:overdue.length,ids:overdue.map(item=>item.id)},
    {key:'integrity',label:'Confirmed integrity signals',points:confirmed.length?20:0,count:confirmed.length,ids:confirmed.map(item=>item.id)},
    {key:'scope',label:'Requested course scope needs current review',points:scopeCurrent?0:10,count:scopeCurrent?0:1,ids:[]},
  ];
  if(extraReviews.length)factors.push({key:'independent_review',label:'Required independent reviews need a current basis',points:Math.min(15,extraReviews.length*5),count:extraReviews.length,ids:extraReviews.map(item=>item.id)});
  const score=snapshot.coverage==='partial'?null:Math.min(100,factors.reduce((sum,item)=>sum+item.points,0));
  return {score,band:score===null?'unknown':score>=60?'high':score>=25?'watch':'low',factors,blockers:factors.filter(item=>item.count>0).map(item=>`${item.label}: ${item.count}`),currentClaims:mandatory.filter(current).length,mandatoryClaims:mandatory.length,requiredEvidenceCurrent:app.template_snapshot.required_documents.length-missing.length,requiredEvidenceTotal:app.template_snapshot.required_documents.length,overdueObligations:overdue.length,dueDays,scopeReviewCurrent:scopeCurrent};
}
export interface Milestone{key:string;label:string;role:string;baseline_at:string;projected_at:string;baseline_days:number;projected_days:number;delay_days:number}
export interface ScenarioResult{engine_version:string;source_hash:string;baseline:Attention;projected:Attention;as_of:string;projected_as_of:string;parameters:ScenarioParameters;timeline:Milestone[];delayDays:number;assumptions:string[];limitations:string[];recommendations:{title:string;owner:string;basis:string;claim_id?:string;document_id?:string}[];disclaimer:string}
export function runScenario(snapshot:AnalysisSnapshot,input:unknown):ScenarioResult{
  const p=scenarioSchema.parse(input),claims=new Set(snapshot.facts.claims.map(item=>item.id));
  for(const id of [...p.extraMissingClaimIds,...p.assumedAcceptedClaimIds])if(!claims.has(id))throw new Error('Scenario claim is outside the captured case.');
  if(new Set(p.extraMissingClaimIds).size!==p.extraMissingClaimIds.length||new Set(p.assumedAcceptedClaimIds).size!==p.assumedAcceptedClaimIds.length||p.extraMissingClaimIds.some(id=>p.assumedAcceptedClaimIds.includes(id)))throw new Error('Scenario assumptions must be unique and consistent.');
  const projectedAt=addCalendarDays(snapshot.captured_at,p.horizonDays,{...p.calendar,basis:'calendar_days'}),app=snapshot.facts.application;
  let baselineAt=snapshot.captured_at,projectedStageAt=snapshot.captured_at;
  const activeStages=app.template_snapshot.stages.filter(stage=>!['outcome','submission'].includes(stage.key)&&(!(stage.key.includes('expert')||stage.key.includes('evc'))||app.evc_required||app.template_snapshot.evc_mode==='required'));
  const stageKeys=app.status.includes('evc')?['expert','evc']:app.status==='pending_decision'?['decision']:['scrutiny'];
  const start=activeStages.findIndex(stage=>stageKeys.some(key=>stage.key.includes(key)));
  const timeline:Milestone[]=[];
  if(start>=0&&!['approved','rejected','draft'].includes(app.status))for(const [index,stage] of activeStages.slice(start).entries()){
    let baselineDays=Math.max(1,stage.sla_days);const extra=stage.key.includes('scrutiny')?p.scrutinyDelayDays:stage.key.includes('expert')||stage.key.includes('evc')?p.evcDelayDays:0;
    let projectedDays=Math.max(1,Math.ceil(baselineDays*p.workloadMultiplier)+extra);
    if(index===0&&app.sla_due_at){baselineAt=app.sla_due_at;const remaining=p.calendar.basis==='weekdays'?Math.max(0,workingDaysBetween(snapshot.captured_at,baselineAt,p.calendar.holidays)):Math.max(0,Math.ceil((Date.parse(baselineAt)-Date.parse(snapshot.captured_at))/DAY));baselineDays=remaining;projectedDays=remaining+extra+Math.ceil(remaining*(p.workloadMultiplier-1));projectedStageAt=addCalendarDays(baselineAt,projectedDays-remaining,p.calendar);}
    else{baselineAt=addCalendarDays(baselineAt,baselineDays,p.calendar);projectedStageAt=addCalendarDays(projectedStageAt,projectedDays,p.calendar);}
    timeline.push({key:stage.key,label:stage.label,role:stage.role,baseline_at:baselineAt,projected_at:projectedStageAt,baseline_days:baselineDays,projected_days:projectedDays,delay_days:projectedDays-baselineDays});
  }
  const recommendations:ScenarioResult['recommendations']=[];
  for(const deficiency of snapshot.facts.deficiencies.filter(item=>['open','escalated'].includes(item.status)))recommendations.push({title:deficiency.remedy,owner:'Institution, followed by assigned reviewer',basis:`Recorded correction: ${deficiency.clause}`,claim_id:deficiency.claim_id});
  for(const doc of snapshot.facts.documents.filter(item=>!documentEligible(item,indiaDate(snapshot.captured_at))))recommendations.push({title:`Review ${doc.doc_type} validity and its recorded source`,owner:'Authorised evidence reviewer',basis:`Document ${doc.id}; ${doc.validity_mode??'unknown'} validity; ${doc.scan_status} scan`,document_id:doc.id});
  if(app.evc_required&&!snapshot.facts.visits.some(item=>item.completed_at))recommendations.push({title:'Check expert availability, declared conflicts and visit prerequisites',owner:'EVC coordinator',basis:'A required visit has no completed report in the captured record.'});
  if((app.scope_revision??0)>0&&app.scope_reviewed_revision!==app.scope_revision)recommendations.push({title:'Review the saved course/intake scope revision',owner:'Assigned scrutiny officer',basis:`Scope revision ${app.scope_revision} has no current acknowledgement.`});
  return {engine_version:ANALYSIS_ENGINE,source_hash:snapshot.source_hash,baseline:assessSnapshot(snapshot),projected:assessSnapshot(snapshot,projectedAt,p),as_of:snapshot.captured_at,projected_as_of:projectedAt,parameters:p,timeline,delayDays:timeline.reduce((sum,item)=>sum+item.delay_days,0),assumptions:[`Calendar: ${p.calendar.label}, version ${p.calendar.version}; ${p.calendar.holidays.length} explicitly supplied holiday dates.`,`Workload multiplier ${p.workloadMultiplier}; scrutiny delay ${p.scrutinyDelayDays} days; EVC delay ${p.evcDelayDays} days.`,`${p.assumedAcceptedClaimIds.length} claim reviews are hypothetical acceptances, not recorded decisions.`,`${p.extraMissingClaimIds.length} additional missing checks are hypothetical.`,`Stage durations are pinned template targets, not a promise of completion. A decision milestone does not imply approval.`],limitations:[...snapshot.limitations,'Attention is a transparent demo operational score, not a legal eligibility score, calibrated probability or trained prediction.','Recorded document validity is not replaced by a hypothetical claim acceptance.'],recommendations,disclaimer:'SIMULATION — not an official decision. Current application records are unchanged.'};
}
export interface DependencyNode{id:string;kind:'review'|'application'|'claim'|'document'|'deficiency'|'visit'|'obligation'|'approval';label:string;state:string;reference:string}
export interface DependencyEdge{from:string;to:string;relationship:string}
export function evidenceGraph(snapshot:AnalysisSnapshot,at=snapshot.captured_at,parameters?:ScenarioParameters):{nodes:DependencyNode[];edges:DependencyEdge[]}{
  const f=snapshot.facts,nodes:DependencyNode[]=[{id:f.application.id,kind:'application',label:f.application.ref_no,state:f.application.status,reference:f.application.id}],edges:DependencyEdge[]=[];
  const add=(node:DependencyNode,parent:string,relationship:string)=>{nodes.push(node);edges.push({from:parent,to:node.id,relationship});};
  for(const claim of f.claims)add({id:claim.id,kind:'claim',label:claim.statement_snapshot,state:parameters?.extraMissingClaimIds.includes(claim.id)?'hypothetical missing':parameters?.assumedAcceptedClaimIds.includes(claim.id)?'hypothetical accepted':claim.status,reference:claim.id},f.application.id,'requires review');
  for(const doc of f.documents)add({id:doc.id,kind:'document',label:doc.file_name,state:doc.scan_status==='clean'?(documentEligible(doc,indiaDate(at))?'current reviewed validity':`${doc.validity_mode??'unknown'} · review required`):doc.scan_status,reference:doc.id},f.application.id,'contains evidence');
  for(const link of f.claim_evidence)if(nodes.some(item=>item.id===link.claim_id)&&nodes.some(item=>item.id===link.document_id))edges.push({from:link.document_id,to:link.claim_id,relationship:'supports claim'});
  for(const item of f.deficiencies)add({id:item.id,kind:'deficiency',label:item.observation,state:item.status,reference:item.claim_id},item.claim_id,'has correction');
  for(const item of f.visits)add({id:item.id,kind:'visit',label:'Expert visit',state:item.completed_at?'completed':'scheduled',reference:item.id},f.application.id,'requires inspection');
  for(const item of f.case_reviews??[]){add({id:item.id,kind:'review',label:item.kind.replaceAll('_',' '),state:item.basis_current===false?'source changed':item.status,reference:item.id},f.application.id,'has independent review');for(const id of item.evidence_ids)if(nodes.some(node=>node.id===id))edges.push({from:id,to:item.id,relationship:'cited by review'});}
  for(const item of f.approvals)add({id:item.id,kind:'approval',label:item.source_ref,state:`${item.valid_from} to ${item.valid_to}`,reference:item.id},f.application.id,'records coverage');
  for(const item of f.obligations)add({id:item.id,kind:'obligation',label:item.title,state:item.status,reference:item.id},item.approval_id&&nodes.some(node=>node.id===item.approval_id)?item.approval_id:f.application.id,'has continuing condition');
  return {nodes,edges:edges.filter(edge=>nodes.some(node=>node.id===edge.from)&&nodes.some(node=>node.id===edge.to))};
}
export function csvCell(value:unknown){const text=String(value??'');return '"'+(/^[=+@\-\t\r]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';}
export function csv(rows:unknown[][]){return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');}
export async function evidenceBundle(snapshot:AnalysisSnapshot,result:ScenarioResult){return {schema:1,kind:'clauseway-analysis-evidence',snapshot,result,checksums:{algorithm:'SHA-256 / stable sorted-key JSON',snapshot:await sha256Hex(stableJson(snapshot)),result:await sha256Hex(stableJson(result))},disclaimer:'Unkeyed checksums detect changes to this export. They are not a digital signature, official certificate or proof of external delivery.'};}
export async function verifyEvidenceBundle(value:Awaited<ReturnType<typeof evidenceBundle>>){return value.schema===1&&await sha256Hex(stableJson(value.snapshot))===value.checksums.snapshot&&await sha256Hex(stableJson(value.result))===value.checksums.result;}
export function bottlenecks(snapshots:AnalysisSnapshot[]){return [...new Set(snapshots.map(item=>item.facts.application.status))].map(stage=>{const cases=snapshots.filter(item=>item.facts.application.status===stage),scores=cases.map(item=>assessSnapshot(item).score).filter((item):item is number=>item!==null),mean=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0;return {stage,count:cases.length,mean_attention:Math.round(mean*10)/10,index:Math.round(mean*cases.length*10)/10,coverage:scores.length===cases.length?'complete':'partial'};}).sort((a,b)=>b.index-a.index||a.stage.localeCompare(b.stage));}
export function eventCheckpoint(events:AuditEvent[]){return [...events].sort((a,b)=>(a.sequence??0)-(b.sequence??0)).at(-1);}
