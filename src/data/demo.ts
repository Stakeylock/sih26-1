import {addCalendarDays} from '../domain/intelligence';
import {demoOperations,demoReviewContent} from './demoOperations';
import {demoPolicy} from './demoPolicy';
import {demoPlanning,seedPlanning} from './demoPlanning';
import {neutralDemoLabels} from '../domain/presentation';
import {demoIntelligence} from './demoIntelligence';
import {documentEligible} from '../domain/approvals';
import {seedGovernance,demoGovernance,approvalInput,recordApproval,closeApplicationDeadlines} from './demoGovernance';
import templatesJson from './templates.json';
import requirementsJson from './requirements.json';
import documentHashesJson from './document-hashes.json';
import samplePdfsJson from './sample-pdfs.json';
import {expiryState} from '../domain/expiry';
import {EVC_REQUIRED_SEATS,EVC_SEATS,canStaff,seatEligibility,validateComposition} from '../domain/evc';
import type {EVCSeat} from '../domain/evc';
import {demoEvcExperts,type DemoEVCExpert} from './demoEvc';
import {overlaps} from '../domain/planning';
import type {EVCAvailabilityResult,EVCMember,EVCOfficialAvailability,EVCVisit} from '../domain/model';
import type { Advisory,Application, AuditEvent, DocumentRecord, Identity, Notification, Repository, Role, Status, Template, Transition, Workspace } from '../domain/model';
import type { AccessAssignment, AgentRecord, AuditEventLike, AuditVerification, Claim, ClaimEvidence, Deficiency, IntegritySignal, Requirement } from '../domain/integrity';
import { canonicalAuditPayload, sha256Bytes, sha256Hex, verifyAuditChain } from '../domain/integrity';
import { allowedActions, missingInputs } from '../domain/model';
import { dispatchNotification } from '../domain/notification';
import { workingDaysUntil } from '../domain/clock';
import { titleSchema, validateFile } from '../domain/validation';
import {captureReviewSnapshot} from '../domain/review';
import {planClockAdvance} from '../domain/consequences';
import {workspaceHolidays} from '../domain/calendar';
import type {ClockConsequence} from '../domain/consequences';
import {buildReviewBasis,reviewBasisCurrent,canUploadEvidence,currentClaimEvidence,demoRatioRule,evaluateDemoRatio} from '../domain/evidence';
const templates = templatesJson as Template[];
const requirements = requirementsJson as Requirement[];
const documentHashes = documentHashesJson as Record<string,string>;
type SampleFixture={sha256:string;bytes:number};
const samplePdfs=(samplePdfsJson as {samples:Record<string,SampleFixture>}).samples;
/** Origin label for the seeded sample bytes; the preview (and the passport that embeds it) reads this string. */
const SAMPLE_ORIGIN_LABEL='Watermarked synthetic sample (generated locally)';
const samplePath=(id:string)=>`/samples/${id}.pdf`;
const sampleFields=(id:string)=>{const fixture=samplePdfs[`${id}.pdf`];if(!fixture)throw new Error('Missing sample PDF fixture: '+id);return {file_path:samplePath(id),size_bytes:fixture.bytes,sample_sha256:fixture.sha256,origin_label:SAMPLE_ORIGIN_LABEL};};
const STORAGE = 'clauseway-isolated-demo-v12';
export const demoIdentities: Identity[] = [
  {id:'demo-national',name:'Aarav Mehta',email:'national@demo.invalid',roles:[{role:'national_admin',region:null}]},
  {id:'demo-institution',name:'Maya Patel',email:'institution@demo.invalid',roles:[{role:'institution',region:null}]},
  {id:'demo-scrutiny',name:'Kavya Rao',email:'scrutiny@demo.invalid',roles:[{role:'scrutiny_officer',region:'South'}]},
  {id:'demo-evc',name:'Ishaan Sen',email:'evc@demo.invalid',roles:[{role:'evc_coordinator',region:'South'}]},
  {id:'demo-regional',name:'Ananya Das',email:'regional@demo.invalid',roles:[{role:'regional_officer',region:'South'}]},
  {id:'demo-evc-member-1',name:'Ravi Sharma',email:'ravi.sharma@demo.invalid',roles:[{role:'evc_member',region:'South'}]},
  {id:'demo-evc-member-2',name:'Priya Nair',email:'priya.nair@demo.invalid',roles:[{role:'evc_member',region:'South'}]},
  {id:'demo-evc-member-3',name:'Suresh Kumar',email:'suresh.kumar@demo.invalid',roles:[{role:'evc_member',region:'South'}]},
];
const iso = (days=0) => new Date(Date.now()+days*86400000).toISOString();
function documentHash(id:string){const hash=documentHashes[id];if(!hash)throw new Error('Missing document hash fixture: '+id);return hash;}
export type ChainedAuditEvent=AuditEvent&AuditEventLike;
export async function buildAuditChain(events:readonly AuditEvent[]):Promise<ChainedAuditEvent[]>{
  const ordered=[...events].sort((left,right)=>Date.parse(left.created_at)-Date.parse(right.created_at)||left.id-right.id);
  const previous=new Map<string,{sequence:number;hash:string}>();
  const chained=new Map<AuditEvent,ChainedAuditEvent>();
  for(const event of ordered){
    const prior=previous.get(event.application_id)??{sequence:0,hash:''};
    const next:ChainedAuditEvent={...event,sequence:prior.sequence+1,prev_hash:prior.hash,event_hash:null};
    next.event_hash=await sha256Hex(canonicalAuditPayload(next));
    chained.set(event,next);
    previous.set(event.application_id,{sequence:next.sequence,hash:next.event_hash});
  }
  return events.map(event=>chained.get(event)!);
}
export async function chainAuditEvent(event:AuditEvent,prior:{sequence:number;hash:string}):Promise<AuditEvent>{
  const sequence=prior.sequence+1;
  const chained:AuditEvent={...event,sequence,prev_hash:prior.hash,event_hash:''};
  chained.event_hash=await sha256Hex(canonicalAuditPayload(chained as AuditEventLike));
  return chained;
}
export function seed(): Workspace {
  const institutions = ['Cedar Technical Institute','Meridian College of Engineering','Sunrise School of Technology','Eastern Polytechnic','Horizon Institute','Northbridge College'].map((name,i)=>({id:`demo-inst-${i}`,owner_id:i===0?'demo-institution':`demo-owner-${i}`,name,aicte_ref:`DEMO-INST-${i+1}`,region:i===0||i===2||i===4?'South':i===1?'West':i===3?'East':'North',state:i===0?'Telangana':'Synthetic state'}));
  const states: Status[]=['under_scrutiny','deficiency_raised','evc_scheduled','pending_decision','submitted','approved','resubmitted','evc_scheduled','approved','approved','rejected','draft','evc_pending'];
  const applications: Application[]=states.map((status,i)=>{
    const inst=i===9?institutions[0]:institutions[i===3?2:i%institutions.length]; const t=templates[i%3]; const id=`demo-app-${i}`; const closed=['approved','rejected'].includes(status);
    return {id,ref_no:`DEMO-2026-${String(1001+i)}`,title:i===0?'Self-disclosure extension · 2026-27':i===1?'Institution name change':i===2?'New programme · Computer science':t.name,owner_id:i===10?'demo-institution':inst.owner_id,institution_id:inst.id,app_type:t.app_type,status,region:inst.region,version:1,template_version:1,template_snapshot:t.definition,form_data:Object.fromEntries(t.definition.required_fields.map(f=>[f.key,`Synthetic ${f.label.toLowerCase()}`])),evc_required:['evc_pending','evc_scheduled'].includes(status),assigned_officer:status==='under_scrutiny'?'demo-scrutiny':null,sla_due_at:['approved','rejected','draft'].includes(status)?null:iso(i===0?2:i===4?-1:4+i),submitted_at:status==='draft'?null:iso(-6-i),created_at:iso(-8-i),updated_at:iso(-i),decision_reason:closed?(status==='approved'?'Synthetic evidence accepted for demonstration only.':'Synthetic evidence did not meet the demo checklist. Human review recorded.'):null,decision_evidence:closed?`demo-doc-${id}-0`:null,is_demo:true};
  });
  // Fixed dates shared with scripts/generate-sample-pdfs.mjs so the sample PDF and the record agree.
  const expiredFireOn='2026-10-15';
  const validFireOn='2027-08-23';
  const documents=applications.flatMap(a=>a.template_snapshot.required_documents.map((type,i):DocumentRecord=>{const id=`demo-doc-${a.id}-${i}`;const doc:DocumentRecord={id,application_id:a.id,doc_type:type,file_name:type.toLowerCase().replaceAll(' ','_')+'.pdf',...sampleFields(id),mime_type:'application/pdf',scan_status:'clean',sha256:documentHash(id),uploaded_at:a.created_at};if(id==='demo-doc-demo-app-0-1'||id==='demo-doc-demo-app-9-1'){doc.expires_on=expiredFireOn;doc.issuer='Synthetic Fire Department';doc.document_number=id==='demo-doc-demo-app-0-1'?'FIRE-DEMO-001':'FIRE-DEMO-009';}return doc;}));
  documents.push(
    {id:'demo-doc-demo-app-0-2',application_id:'demo-app-0',doc_type:'Faculty List',file_name:'faculty_list.pdf',...sampleFields('demo-doc-demo-app-0-2'),mime_type:'application/pdf',scan_status:'clean',sha256:documentHash('demo-doc-demo-app-0-2'),uploaded_at:iso(-6),extracted:{faculty_count:'10'}},
    {id:'demo-doc-demo-app-0-3',application_id:'demo-app-0',doc_type:'Land Document',file_name:'land_document.pdf',...sampleFields('demo-doc-demo-app-0-3'),mime_type:'application/pdf',scan_status:'clean',sha256:documentHash('demo-doc-demo-app-0-3'),uploaded_at:iso(-6)},
    {id:'demo-doc-demo-app-0-4',application_id:'demo-app-0',doc_type:'Undertaking',file_name:'undertaking.pdf',...sampleFields('demo-doc-demo-app-0-4'),mime_type:'application/pdf',scan_status:'clean',sha256:documentHash('demo-doc-demo-app-0-4'),uploaded_at:iso(-6)},
    {id:'demo-doc-demo-app-0-5',application_id:'demo-app-0',doc_type:'Fire Safety Certificate',file_name:'fire_safety_certificate_valid.pdf',...sampleFields('demo-doc-demo-app-0-5'),mime_type:'application/pdf',scan_status:'clean',sha256:documentHash('demo-doc-demo-app-0-5'),uploaded_at:iso(-2),expires_on:validFireOn,issuer:'Synthetic Fire Department',document_number:'FIRE-DEMO-002'},
    {id:'demo-doc-demo-app-4-extra-0',application_id:'demo-app-4',doc_type:'Fire Safety Certificate',file_name:'fire_safety_certificate.pdf',...sampleFields('demo-doc-demo-app-4-extra-0'),mime_type:'application/pdf',scan_status:'clean',sha256:documentHash('demo-doc-demo-app-4-extra-0'),uploaded_at:iso(-5),expires_on:expiredFireOn,issuer:'Synthetic Fire Department',document_number:'FIRE-DEMO-001'},
  );
  const app0=applications[0];
  // Cross-document contradiction seed: the dossier declares 12 faculty, but the attached roster lists 10.
  app0.form_data={...app0.form_data,intake:'120',faculty_count:'12'};
  const claimStatusPlan=['verified','verified','verified','unverified','verified','verified','unverified','deficient','verified'] as const;
  const claims:Claim[]=requirements.map((requirement,index)=>{const status=claimStatusPlan[index];const verified=status==='verified';return {id:`demo-claim-${index}`,application_id:'demo-app-0',requirement_id:requirement.id,input_fields_snapshot:requirement.input_fields??[],requirement_version_snapshot:requirement.version,is_mandatory_snapshot:requirement.is_mandatory,status,statement_snapshot:requirement.statement,clause_snapshot:requirement.clause,evidence_types_snapshot:requirement.evidence_types,verification_method:requirement.verification_method,system_rule_snapshot:requirement.verification_method==='system_check'?demoRatioRule:null,system_result:requirement.verification_method==='system_check'&&verified?evaluateDemoRatio(app0.form_data):null,system_inputs:requirement.system_fields?.map(key=>{const field=app0?.template_snapshot.required_fields.find(f=>f.key===key);return {field:key,label:field?.label??key,value:app0?.form_data[key]??'Not declared'}}),verified_by:verified?'demo-scrutiny':null,verified_at:verified?iso(-1):null,verification_note:verified?`Synthetic ${requirement.code.toLowerCase().replaceAll('_',' ')} check confirmed against the demo record.`:null,created_at:iso(-6),updated_at:verified?iso(-1):iso(-6)};});
  const linkEvidence=(claimIndex:number,documentId:string):ClaimEvidence=>({claim_id:`demo-claim-${claimIndex}`,document_id:documentId,linked_by:'demo-institution',linked_at:iso(-6),note:null});
  const claimEvidence:ClaimEvidence[]=[linkEvidence(0,'demo-doc-demo-app-0-0'),linkEvidence(1,'demo-doc-demo-app-0-0'),linkEvidence(2,'demo-doc-demo-app-0-0'),linkEvidence(3,'demo-doc-demo-app-0-2'),linkEvidence(4,'demo-doc-demo-app-0-2'),linkEvidence(5,'demo-doc-demo-app-0-3'),linkEvidence(7,'demo-doc-demo-app-0-1'),linkEvidence(8,'demo-doc-demo-app-0-4')];
  const deficiencies:Deficiency[]=[{id:'demo-def-0',application_id:'demo-app-0',claim_id:'demo-claim-7',clause:'APH 6.17(i)',observation:'The Fire Safety Certificate expired before the scrutiny date.',remedy:'Upload a Fire Safety Certificate valid on the scrutiny date.',due_at:iso(7),status:'open',raised_by:'demo-scrutiny',raised_at:iso(-1),resolved_by:null,resolved_at:null,resolution_note:null,evidence_id:null,rechecked_by:null,rechecked_at:null,recheck_note:null}];
  const signals:IntegritySignal[]=[
    {id:'demo-signal-0',application_id:'demo-app-0',document_id:'demo-doc-demo-app-0-1',signal_type:'expired_document',severity:'warning',fingerprint:'expires:'+expiredFireOn,detail:{expires_on:expiredFireOn,doc_type:'Fire Safety Certificate',issuer:'Synthetic Fire Department',document_number:'FIRE-DEMO-001'},disposition:'open',disposition_reason:null,disposed_by:null,disposed_at:null,created_at:iso(-1)},
    {id:'demo-signal-1',application_id:'demo-app-0',document_id:'demo-doc-demo-app-0-1',signal_type:'duplicate_document',severity:'warning',fingerprint:'sha256:'+documentHash('demo-doc-demo-app-0-1'),detail:{matched_document_id:'demo-doc-demo-app-4-extra-0',matched_application_id:'demo-app-4',doc_type:'Fire Safety Certificate'},disposition:'open',disposition_reason:null,disposed_by:null,disposed_at:null,created_at:iso(-1)},
  ];
  const accessAssignments:AccessAssignment[]=[
    {user_id:'demo-national',role:'national_admin',region:null,active:true,expires_at:null,revoked_at:null,granted_by:'demo-national',grant_reason:'Seeded national administrator grant.'},
    {user_id:'demo-institution',role:'institution',region:null,active:true,expires_at:null,revoked_at:null,granted_by:'demo-national',grant_reason:'Seeded institution owner grant.'},
    {user_id:'demo-scrutiny',role:'scrutiny_officer',region:'South',active:true,expires_at:iso(5),revoked_at:null,granted_by:'demo-national',grant_reason:'Temporary South scrutiny coverage.'},
    {user_id:'demo-regional',role:'regional_officer',region:'South',active:true,expires_at:iso(120),revoked_at:null,granted_by:'demo-national',grant_reason:'Seeded South decision authority.'},
    {user_id:'demo-evc',role:'evc_coordinator',region:'South',active:true,expires_at:iso(45),revoked_at:null,granted_by:'demo-national',grant_reason:'Seeded South visit coordination.'},
    {user_id:'demo-owner-4',role:'institution',region:null,active:false,expires_at:iso(-20),revoked_at:iso(-10),granted_by:'demo-national',grant_reason:'Superseded synthetic institution grant.'},
  ];
  const agents:AgentRecord[]=[
    {id:'agent-evidence-advisory',name:'Evidence pre-check',purpose:'Deterministic document metadata review for reviewer support.',scopes:['documents:read','claims:read'],can_approve:false,enabled:true,last_run_at:iso(-1),created_by:'demo-national',created_at:iso(-30)},
    {id:'agent-duplicate-watch',name:'Duplicate hash watch',purpose:'Read-only duplicate-evidence detection across visible cases.',scopes:['documents:read','signals:read'],can_approve:false,enabled:false,last_run_at:null,created_by:'demo-national',created_at:iso(-30)},
  ];
  const events:AuditEvent[]=applications.flatMap((a,i)=>[
    {id:i*3+1,application_id:a.id,actor_id:a.owner_id,actor_role:'institution',action:'created',from_status:null,to_status:'draft' as const,reason:'Synthetic case created.',created_at:a.created_at,payload:{demo:true}},
    ...(a.status==='draft'?[]:[{id:i*3+2,application_id:a.id,actor_id:a.owner_id,actor_role:'institution',action:'submit',from_status:'draft' as const,to_status:'submitted' as const,reason:'Synthetic evidence attached.',created_at:a.submitted_at!,payload:{demo:true}}]),
    ...(['approved','rejected'].includes(a.status)?[{id:i*3+3,application_id:a.id,actor_id:'demo-regional',actor_role:'regional_officer',action:a.status,from_status:'pending_decision' as const,to_status:a.status,reason:a.decision_reason,created_at:a.updated_at,payload:{demo:true}}]:[]),
  ]);
  const committeeDemo: import('../domain/model').ExpertMember[] = [
    { name: 'Demo academic reviewer', designation: 'Senior Professor (Mechanical)', domain: 'Academic (Chairman)', institution: 'Example academic institute', no_conflict_signed: false },
    { name: 'Demo facilities reviewer', designation: 'Chief Structural Architect', domain: 'Architectural / Civil', institution: 'Example facilities practice', no_conflict_signed: false },
    { name: 'Dr. K. Rao', designation: 'Regional Industry Representative', domain: 'Regional Nominee', institution: 'Synthetic regional review panel', no_conflict_signed: false },
  ];
  const visits: import('../domain/model').Visit[] = [
    { id: 'demo-visit-1', application_id: 'demo-app-7', coordinator_id: 'demo-evc', scheduled_for: iso(3), completed_at: null, report: null, recommendation: null, committee: committeeDemo },
    { id: 'demo-visit-2', application_id: 'demo-app-2', coordinator_id: 'demo-evc', scheduled_for: iso(6), completed_at: null, report: null, recommendation: null, committee: committeeDemo },
    { id: 'demo-visit-0', application_id: 'demo-app-5', coordinator_id: 'demo-evc', scheduled_for: iso(-4), completed_at: iso(-4), report: 'Synthetic historical visit fixture for demonstrating how a recorded panel report appears.', recommendation: 'recommend', committee: committeeDemo },
  ];
  const obligations: import('../domain/model').Obligation[] = [
    { id: 'demo-obligation-1', application_id: 'demo-app-0', institution_id: 'demo-inst-0', title: 'Synthetic land-document follow-up', due_date: iso(30).slice(0, 10), status: 'open', deadline_source: 'demo_scenario', region: 'South', escalation_level: 'normal', required_evidence: ['Land Document'] },
    { id: 'demo-obligation-2', application_id: 'demo-app-1', institution_id: 'demo-inst-1', title: 'Synthetic safety-document follow-up', due_date: iso(-8).slice(0, 10), status: 'open', deadline_source: 'demo_scenario', region: 'West', escalation_level: 'normal', required_evidence: ['Fire Safety Certificate'] },
    { id: 'demo-obligation-3', application_id: 'demo-app-5', institution_id: 'demo-inst-5', title: 'Synthetic post-approval faculty condition', due_date: iso(45).slice(0, 10), status: 'open', deadline_source: 'demo_scenario', region: 'North', escalation_level: 'normal', required_evidence: ['Faculty List'] },
  ];
  const notifications: import('../domain/model').Notification[] = [
    { id: 'demo-notification-1', title: 'Scrutiny deficiency cure window closing', body: 'DEMO-2026-1002 (Meridian College) has an open deficiency on Land Document approaching SLA.', read_at: null, created_at: iso(), application_id: 'demo-app-1', target_stage: 'case/demo-app-1' },
    { id: 'demo-notification-2', title: 'Synthetic fire-safety review is pending', body: 'DEMO-2026-1001 carries a sample fire-safety validity issue; the assigned reviewer can inspect its correction record.', read_at: null, created_at: iso(-1), application_id: 'demo-app-0', target_stage: 'case/demo-app-0' },
    { id: 'demo-notification-3', title: 'Synthetic visit panel recorded', body: 'DEMO-2026-1008 contains a legacy synthetic panel. Use resource planning to record availability, declared conflicts and confirmation.', read_at: null, created_at: iso(-2), application_id: 'demo-app-7', target_stage: 'case/demo-app-7' },
    { id: 'demo-notification-4', title: 'Sample workflow revision published', body: 'Existing sample cases retain their captured route until a compatible policy revision is explicitly reviewed and adopted.', read_at: iso(-3), created_at: iso(-3), application_id: null, target_stage: 'workflows' },
  ];
const workspace:Workspace={applications,institutions,templates,documents,events,checklist:[],visits,obligations,notifications,requirements,claims,claim_evidence:claimEvidence,deficiencies,integrity_signals:signals,access_assignments:accessAssignments,agents,evc_visits:[],evc_members:[],evc_unavailability:[],evc_schedule_history:[]};
// Seed an EVC visit for demo-app-9 (completed renewal follow-up visit)
const app9=applications.find(a=>a.id==='demo-app-9')!;
workspace.evc_visits.push({
  id:'demo-evc-visit-9',application_id:app9.id,institution_id:app9.institution_id,region:app9.region,
  mode:'PHYSICAL',scheduled_start:iso(-20),scheduled_end:iso(-20)!&&new Date(Date.parse(iso(-20))+3600000).toISOString(),
  status:'COMPLETED',schedule_version:1,completed_at:iso(-15),
  report:'Synthetic EVC report: fire safety equipment inspected and found compliant. No major deficiencies.',
  recommendation:'recommend',coordinator_id:'demo-evc',decision_event_id:null,created_at:iso(-20),updated_at:iso(-15),
});
workspace.evc_members.push(
  {id:'demo-evc-member-assign-9-1',evc_visit_id:'demo-evc-visit-9',user_id:'demo-evc-member-1',seat:'ACADEMICIAN',response_status:'ACCEPTED',response_note:'Fire safety systems verified compliant.',responded_at:iso(-18),active:true,invited_version:1,reserved_period_start:iso(-20),reserved_period_end:new Date(Date.parse(iso(-20))+3600000).toISOString(),created_at:iso(-20),updated_at:iso(-18)},
  {id:'demo-evc-member-assign-9-2',evc_visit_id:'demo-evc-visit-9',user_id:'demo-evc-member-2',seat:'EXPERT',response_status:'ACCEPTED',response_note:'Building infrastructure review complete.',responded_at:iso(-18),active:true,invited_version:1,reserved_period_start:iso(-20),reserved_period_end:new Date(Date.parse(iso(-20))+3600000).toISOString(),created_at:iso(-20),updated_at:iso(-18)},
  {id:'demo-evc-member-assign-9-3',evc_visit_id:'demo-evc-visit-9',user_id:'demo-evc-member-3',seat:'ARCHITECT_PLANNING',response_status:'ACCEPTED',response_note:'Campus layout and emergency exits verified.',responded_at:iso(-18),active:true,invited_version:1,reserved_period_start:iso(-20),reserved_period_end:new Date(Date.parse(iso(-20))+3600000).toISOString(),created_at:iso(-20),updated_at:iso(-18)},
);
// Seed an upcoming EVC visit for demo-app-2 (scrutiny cleared, pending EVC)
const app2=applications.find(a=>a.id==='demo-app-2')!;
const futureStart=new Date(Date.now()+7*86400000);
const futureEnd=new Date(Date.parse(futureStart.toISOString())+3600000);
workspace.evc_visits.push({
  id:'demo-evc-visit-2',application_id:app2.id,institution_id:app2.institution_id,region:app2.region,
  mode:'PHYSICAL',scheduled_start:futureStart.toISOString(),scheduled_end:futureEnd.toISOString(),
  status:'SCHEDULED',schedule_version:1,completed_at:null,report:null,recommendation:null,
  coordinator_id:'demo-evc',decision_event_id:null,created_at:iso(-5),updated_at:iso(-5),
});
workspace.evc_members.push(
  {id:'demo-evc-member-assign-2-1',evc_visit_id:'demo-evc-visit-2',user_id:'demo-evc-member-1',seat:'ACADEMICIAN',response_status:'INVITED',response_note:null,responded_at:null,active:true,invited_version:1,reserved_period_start:futureStart.toISOString(),reserved_period_end:futureEnd.toISOString(),created_at:iso(-5),updated_at:iso(-5)},
  {id:'demo-evc-member-assign-2-2',evc_visit_id:'demo-evc-visit-2',user_id:'demo-evc-member-2',seat:'EXPERT',response_status:'ACCEPTED',response_note:'Synthetic availability confirmed for the recorded window.',responded_at:iso(-4),active:true,invited_version:1,reserved_period_start:futureStart.toISOString(),reserved_period_end:futureEnd.toISOString(),created_at:iso(-5),updated_at:iso(-4)},
  {id:'demo-evc-member-assign-2-3',evc_visit_id:'demo-evc-visit-2',user_id:'demo-evc-member-3',seat:'ARCHITECT_PLANNING',response_status:'ACCEPTED',response_note:'Synthetic site-access and drawing review confirmed.',responded_at:iso(-4),active:true,invited_version:1,reserved_period_start:futureStart.toISOString(),reserved_period_end:futureEnd.toISOString(),created_at:iso(-5),updated_at:iso(-4)},
);
seedGovernance(workspace);
  seedPlanning(workspace);
  for(const claim of workspace.claims){if(['verified','not_applicable'].includes(claim.status))claim.verification_basis=buildReviewBasis(applications[0],claim,claimEvidence,documents,claim.status as 'verified'|'not_applicable');}
  for(const [index,app] of applications.entries())events.push({id:1000+index,application_id:app.id,actor_id:null,actor_role:'system',action:'review_baseline',from_status:app.status,to_status:app.status,reason:'Synthetic current-state baseline; earlier evidence bases are not reconstructed.',created_at:iso(),payload:{demo:true,coverage:'current_state_only',review_snapshot:captureReviewSnapshot(workspace,app)}});
  return workspace;
}
export async function createDemoRepository(role:Role='national_admin'): Promise<Repository> {
  const actor=demoIdentities.find(i=>i.roles[0].role===role)!;
  let state=await seed();
  const heads=new Map<string,{sequence:number;hash:string}>();
  for(const event of state.events){const current=heads.get(event.application_id);const seq=event.sequence??0;const hash=typeof event.event_hash==='string'?event.event_hash:'';if(!current||seq>current.sequence)heads.set(event.application_id,{sequence:seq,hash:hash});}
  try { const saved=JSON.parse(localStorage.getItem(STORAGE)??'null') as {format?: number; workspace?: Workspace} | null; if(saved?.format===12 && saved.workspace?.applications.every(a=>a.is_demo && a.id.startsWith('demo-'))) {state={...saved.workspace,requirements:saved.workspace.requirements??[],claims:saved.workspace.claims??[],claim_evidence:saved.workspace.claim_evidence??[],deficiencies:saved.workspace.deficiencies??[],integrity_signals:saved.workspace.integrity_signals??[],access_assignments:saved.workspace.access_assignments??[],agents:saved.workspace.agents??[]};
    } } catch { /* Corrupt demo storage is discarded. */ }
  state=neutralDemoLabels(state);
  if(!state.inspection_experts)seedPlanning(state);
  const persist=()=>localStorage.setItem(STORAGE,JSON.stringify({format:12,workspace:state}));
  const visible=(a:Application)=>a.owner_id===actor.id || (a.status!=='draft' && actor.roles.some(r=>r.role==='national_admin'||(r.role!=='institution'&&r.region===a.region)));
  const find=(id:string)=>{const a=state.applications.find(x=>x.id===id);if(!a||!visible(a))throw new Error('Demo application is unavailable.');return a;};
  async function prepareChainEvent(a:Application,action:string,old:Status|null,reason:string|null=null,detail:Record<string,unknown>={},options:{actor_id?:string|null;actor_role?:string|null}={}):Promise<AuditEvent>{
    const prior=heads.get(a.id)??{sequence:0,hash:''};
    const sequence=Number.isInteger(prior.sequence)?prior.sequence+1:1;
    const id=Math.max(0,...state.events.map(event=>event.id))+1;
    const base:AuditEvent={id,application_id:a.id,actor_id:options.actor_id??actor.id,actor_role:options.actor_role??role,action,from_status:old,to_status:a.status,reason,created_at:iso(),payload:structuredClone({...detail,demo:true,review_snapshot:captureReviewSnapshot(state,a)}),sequence,prev_hash:prior.hash,event_hash:''};
    return chainAuditEvent(base,prior);
  }
  function appendChainEvent(event:AuditEvent):void{
    state.events.unshift(event);
    heads.set(event.application_id,{sequence:event.sequence as number,hash:event.event_hash as string});
  }
  async function log(a:Application,action:string,old:Status|null,reason:string|null=null,detail:Record<string,unknown>={},options:{actor_id?:string|null;actor_role?:string|null}={}):Promise<void>{
    const chained=await prepareChainEvent(a,action,old,reason,detail,options);
    appendChainEvent(chained);
  }
  async function reviewMutation(application:Application,requestId:string,action:string,input:unknown,operation:()=>void|Promise<void>){
    const body=JSON.stringify({application:application.id,version:application.version,action,input});
    if(receipts.has(requestId)){if(receipts.get(requestId)!==body)throw new Error('Request ID already used.');return;}
    const a=find(application.id);if(a.version!==application.version)throw new Error('Reload this case before acting.');
    const prior=structuredClone(state);
    try{a.version++;await operation();receipts.set(requestId,body);persist();}catch(error){state=prior;persist();throw error;}
  }
  function editable(a:Application){if(a.owner_id!==actor.id||!['draft','deficiency_raised'].includes(a.status))throw new Error('This demo case is locked.');}
  for(const claim of state.claims){if(claim.verification_method!=='system_check')continue;claim.system_rule_snapshot??=demoRatioRule;const app=state.applications.find(a=>a.id===claim.application_id);if(claim.status==='verified'&&(!claim.system_result?.passed||!app||!evaluateDemoRatio(app.form_data).passed)){claim.status='unverified';claim.verified_by=null;claim.verified_at=null;claim.system_result=null;}}
  const receipts=new Map<string,string>();
  const evcManageable=(a:Application)=>actor.roles.some(grant=>grant.role==='national_admin'||(['evc_coordinator','regional_officer'].includes(grant.role)&&grant.region===a.region));
  const evcExpert=(id:string)=>demoEvcExperts.find(expert=>expert.id===id)??null;
  const evcWindow=(start:string,end:string)=>{const startMs=Date.parse(start),endMs=Date.parse(end);if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)throw new Error('Choose a valid time window.');return {startMs,endMs};};
  const evcConflicts=(expertId:string,startMs:number,endMs:number,excludeVisitId?:string)=>{
    const conflicts:EVCOfficialAvailability['conflicts']=[];
    const start=new Date(startMs).toISOString(),end=new Date(endMs).toISOString();
    for(const member of state.evc_members){
      if(!member.active||member.user_id!==expertId||member.evc_visit_id===excludeVisitId||!member.reserved_period_start||!member.reserved_period_end)continue;
      if(!overlaps(start,end,member.reserved_period_start,member.reserved_period_end))continue;
      const visit=state.evc_visits.find(item=>item.id===member.evc_visit_id);
      if(!visit||['CANCELLED','COMPLETED'].includes(visit.status))continue;
      const application=state.applications.find(item=>item.id===visit.application_id);
      conflicts.push({visitId:visit.id,referenceNo:application?.ref_no??null,institution:state.institutions.find(item=>item.id===visit.institution_id)?.name??null,start:visit.scheduled_start,end:visit.scheduled_end??visit.scheduled_start,responseStatus:member.response_status,kind:'ASSIGNMENT'});
    }
    for(const window of state.evc_unavailability){
      if(window.expert_id!==expertId||window.withdrawn_at)continue;
      if(!overlaps(start,end,window.starts_at,window.ends_at))continue;
      conflicts.push({visitId:null,referenceNo:null,institution:null,start:window.starts_at,end:window.ends_at,responseStatus:null,kind:'UNAVAILABILITY'});
    }
    return conflicts;
  };
  const evcDayAssignments=(expertId:string,startMs:number)=>{
    const dayStart=new Date(startMs);dayStart.setHours(0,0,0,0);const dayEnd=new Date(dayStart);dayEnd.setDate(dayEnd.getDate()+1);
    const rows:EVCOfficialAvailability['dayAssignments']=[];
    for(const member of state.evc_members){
      if(!member.active||member.user_id!==expertId||!member.reserved_period_start||!member.reserved_period_end)continue;
      if(!overlaps(dayStart.toISOString(),dayEnd.toISOString(),member.reserved_period_start,member.reserved_period_end))continue;
      const visit=state.evc_visits.find(item=>item.id===member.evc_visit_id);
      if(!visit||['CANCELLED','COMPLETED'].includes(visit.status))continue;
      const application=state.applications.find(item=>item.id===visit.application_id);
      rows.push({visitId:visit.id,referenceNo:application?.ref_no??null,institution:state.institutions.find(item=>item.id===visit.institution_id)?.name??null,start:visit.scheduled_start,end:visit.scheduled_end??visit.scheduled_start,responseStatus:member.response_status});
    }
    return rows;
  };
  const evcAvailabilityFor=(expert:DemoEVCExpert,startMs:number,endMs:number):EVCOfficialAvailability=>{
    const eligibility=Object.fromEntries(EVC_SEATS.map(seat=>[seat,seatEligibility(expert,seat)])) as EVCOfficialAvailability['seatEligibility'];
    const eligibleSeats=EVC_SEATS.filter(seat=>eligibility[seat].outcome==='PASS');
    const conflicts=evcConflicts(expert.id,startMs,endMs);
    let status:EVCOfficialAvailability['status']='AVAILABLE';let reason:string|null=null;
    if(!expert.active){status='INACTIVE';reason='The registry record is inactive.';}
    else if(expert.verification_status!=='VERIFIED'){status='NOT_VERIFIED';reason='The qualification record is not verified.';}
    else if(!expert.user_id){status='NO_ACCOUNT';reason='No demo sign-in identity is linked to this registry record.';}
    else if(conflicts.some(item=>item.kind==='UNAVAILABILITY')){status='UNAVAILABLE';reason='Recorded unavailability overlaps this window.';}
    else if(conflicts.length){status='BUSY';reason='Another visit or reservation overlaps this window.';}
    return {id:expert.id,member_code:expert.member_code,user_id:expert.user_id,full_name:expert.full_name,designation_level:expert.designation_level,discipline:expert.discipline,organisation_type:expert.organisation_type,experience_years:expert.experience_years,coa_registration_no:expert.coa_registration_no,panel_status:expert.panel_status,verification_status:expert.verification_status,active:expert.active,status,reason,conflicts,dayAssignments:evcDayAssignments(expert.id,startMs),eligibleSeats,seatEligibility:eligibility};
  };
  const validateEvcAssignments=(a:Application,visit:EVCVisit,members:Array<{expertId:string;seat:EVCSeat}>)=>{
    if(members.length!==EVC_REQUIRED_SEATS.length)throw new Error('Assign exactly one Academician, one Expert, and one Architect-Planning member.');
    if(new Set(members.map(item=>item.seat)).size!==EVC_REQUIRED_SEATS.length)throw new Error('Duplicate seat assignments are not allowed.');
    if(new Set(members.map(item=>item.expertId)).size!==EVC_REQUIRED_SEATS.length)throw new Error('One person cannot occupy more than one seat.');
    if(members.some(item=>!EVC_REQUIRED_SEATS.includes(item.seat)))throw new Error('Choose only the three required EVC seats.');
    const experts=members.map(item=>{const expert=evcExpert(item.expertId);if(!expert)throw new Error('Choose a member from the EVC registry.');return expert;});
    if(experts.some(expert=>expert.region!==a.region))throw new Error('Choose members from the panel for this case region.');
    const composition=validateComposition(experts,members);
    if(composition.overall==='FAIL')throw new Error(composition.findings.find(item=>item.outcome==='FAIL')?.message??'The proposed committee does not satisfy Annexure 16.5.');
    if(composition.overall==='HUMAN_REVIEW_REQUIRED')throw new Error('A proposed member needs human verification before the committee can be recorded.');
    const startMs=Date.parse(visit.scheduled_start),endMs=Date.parse(visit.scheduled_end??visit.scheduled_start);
    for(const expert of experts){const conflicts=evcConflicts(expert.id,startMs,endMs,visit.id);if(conflicts.length)throw new Error(expert.full_name+' is not available for the full visit window.');}
    return experts;
  };
  return {
    ...demoGovernance({state:()=>state,actor,find,persist,log,mutate:reviewMutation}),
    ...demoIntelligence({state:()=>state,actor,find,persist,history:async app=>{const events=state.events.filter(event=>event.application_id===app.id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id-b.id);return {events,through:events.length,head_hash:events.at(-1)?.event_hash??null,complete:true};}}),
    ...demoOperations({state:()=>state,actor,find,persist,log}),
    ...demoPolicy({state:()=>state,actor,find,persist,log}),
    ...demoPlanning({state:()=>state,actor,find,persist,log,mutate:reviewMutation}),
    mode:'demo',async identity(){return actor;},subscribeAuth(){return ()=>{};},async signIn(){throw new Error('Use the separate connected workspace for sign-in.');},async signOut(){},
    async workspace(){const apps=state.applications.filter(visible);const keys=new Set(apps.map(a=>a.id));const claims=state.claims.filter(c=>keys.has(c.application_id));const claimKeys=new Set(claims.map(c=>c.id));const events=await buildAuditChain(state.events.filter(e=>keys.has(e.application_id))); const institutionKeys=new Set(apps.map(app=>app.institution_id));const rosterScope=(expert:{id:string;region:string})=>actor.roles.some(grant=>grant.role==='national_admin'||(['regional_officer','evc_coordinator'].includes(grant.role)&&grant.region===expert.region));const directory=state.inspection_experts??[];return structuredClone({...state,evc_visits:state.evc_visits.filter(item=>keys.has(item.application_id)),evc_members:state.evc_members.filter(item=>state.evc_visits.some(visit=>visit.id===item.evc_visit_id&&keys.has(visit.application_id))),evc_schedule_history:state.evc_schedule_history.filter(item=>state.evc_visits.some(visit=>visit.id===item.evc_visit_id&&keys.has(visit.application_id))),evc_unavailability:state.evc_unavailability.filter(item=>actor.roles.some(grant=>grant.role==='national_admin')||(role==='evc_member'&&item.expert_id===actor.id)||actor.roles.some(grant=>['evc_coordinator','regional_officer'].includes(grant.role)&&grant.region===evcExpert(item.expert_id)?.region)),case_reviews:await Promise.all((state.case_reviews??[]).filter(item=>keys.has(item.application_id)).map(async item=>({...item,basis_current:item.basis_hash===await demoReviewContent(state,find(item.application_id))}))),delivery_attempts:state.delivery_attempts?.filter(item=>state.delivery_outbox?.some(outbox=>outbox.id===item.outbox_id&&keys.has(outbox.application_id))),delivery_outbox:state.delivery_outbox?.filter(item=>keys.has(item.application_id)),inspection_experts:directory.filter(expert=>rosterScope(expert)||state.expert_reservations?.some(item=>item.expert_id===expert.id&&keys.has(item.application_id))),expert_availability:state.expert_availability?.filter(item=>directory.some(expert=>expert.id===item.expert_id&&rosterScope(expert))),expert_conflicts:state.expert_conflicts?.filter(item=>directory.some(expert=>expert.id===item.expert_id&&rosterScope(expert))),expert_reservations:state.expert_reservations?.filter(item=>keys.has(item.application_id)),analysis_snapshots:state.analysis_snapshots?.filter(item=>keys.has(item.application_id)),analysis_scenarios:state.analysis_scenarios?.filter(item=>keys.has(item.application_id)),scope_requests:state.scope_requests?.filter(row=>keys.has(row.application_id)),approvals:state.approvals?.filter(row=>institutionKeys.has(row.institution_id)),approval_scope:state.approval_scope?.filter(row=>state.approvals?.some(record=>record.id===row.approval_id&&institutionKeys.has(record.institution_id))),notices:state.notices?.filter(row=>role==='national_admin'||(row.status!=='draft'&&apps.some(app=>app.academic_year_start===row.academic_year_start&&(!row.institution_id||app.institution_id===row.institution_id)&&(!row.application_type||app.app_type===row.application_type)&&(!row.region||app.region===row.region)))),deadlines:state.deadlines?.filter(row=>keys.has(row.application_id)),reminder_intents:state.reminder_intents?.filter(row=>keys.has(row.application_id)),applications:apps,documents:state.documents.filter(d=>keys.has(d.application_id)),events,checklist:state.checklist.filter(c=>keys.has(c.application_id)),visits:state.visits.filter(v=>keys.has(v.application_id)),obligations:state.obligations.filter(o=>keys.has(o.application_id)),claims,claim_evidence:state.claim_evidence.filter(e=>claimKeys.has(e.claim_id)),deficiencies:state.deficiencies.filter(d=>keys.has(d.application_id)),integrity_signals:state.integrity_signals.filter(s=>keys.has(s.application_id))});},
    async createInstitution(){throw new Error('The demo institution profile is already configured.');},
    async createApplication(type,title,initialForm={}){if(role!=='institution')throw new Error('Institution role required.');const t=state.templates.filter(x=>x.app_type===type&&x.status==='published').sort((a,b)=>b.version-a.version)[0];if(Object.entries(initialForm).some(([key,value])=>typeof value!=='string'||value.length>4000||!t.definition.required_fields.some(field=>field.key===key))||(initialForm.intake!==undefined&&!/^[1-9][0-9]{0,5}$/.test(initialForm.intake)))throw new Error('Use valid configured fields and a positive whole-number intake.');const a:Application={...state.applications[0],id:'demo-'+crypto.randomUUID(),ref_no:'DEMO-2026-'+(1013+state.applications.length),title:titleSchema.parse(title),institution_id:'demo-inst-0',owner_id:actor.id,region:'South',app_type:type,status:'draft',version:1,academic_year_start:null,scope_revision:0,scope_reviewed_revision:null,scope_reviewed_by:null,scope_review_note:null,template_version:t.version,template_snapshot:t.definition,form_data:{...initialForm},evc_required:false,assigned_officer:null,sla_due_at:null,submitted_at:null,created_at:iso(),updated_at:iso(),decision_reason:null,decision_evidence:null};state.applications.unshift(a);for(const requirement of requirements.filter(item=>item.app_type===type))state.claims.push({id:'demo-claim-'+crypto.randomUUID(),application_id:a.id,requirement_id:requirement.id,status:'unverified',statement_snapshot:requirement.statement,clause_snapshot:requirement.clause,evidence_types_snapshot:[...requirement.evidence_types],verification_method:requirement.verification_method,input_fields_snapshot:requirement.input_fields??[],requirement_version_snapshot:requirement.version,is_mandatory_snapshot:requirement.is_mandatory,system_rule_snapshot:requirement.verification_method==='system_check'?demoRatioRule:null,verified_by:null,verified_at:null,verification_note:null,created_at:iso(),updated_at:iso()});log(a,'created',null);persist();return a.id;},
    async saveDraft(application,title,form){const a=find(application.id);editable(a);if(a.version!==application.version)throw new Error('Reload this case before saving.');if(Object.entries(form).some(([key,value])=>typeof value!=='string'||value.length>4000||!a.template_snapshot.required_fields.some(field=>field.key===key)))throw new Error('Unknown field or invalid field value.');a.title=titleSchema.parse(title);a.form_data={...form};a.version++;const affected:string[]=[];for(const claim of state.claims.filter(claim=>claim.application_id===a.id&&['verified','not_applicable'].includes(claim.status))){if(!reviewBasisCurrent(a,claim,state.claim_evidence,state.documents)){claim.status='unverified';affected.push(claim.id);}}if(affected.length)log(a,'review_invalidated',a.status,'Configured review inputs changed',{claim_ids:affected,cause:'declared_inputs'});log(a,'draft_saved',a.status);persist();},
    async transition(input:Transition){const a=find(input.application.id);const body=JSON.stringify(input);if(receipts.has(input.requestId)){if(receipts.get(input.requestId)!==body)throw new Error('Request ID already used.');return;}if(a.version!==input.application.version)throw new Error('Reload this case before acting.');if(!allowedActions(a,actor,'demo').includes(input.action))throw new Error('This action is unavailable for the current role and case.');const {action,reason,payload}=input;const old=a.status;
      if(['pass_scrutiny','approve'].includes(action)&&(a.scope_revision??0)>0&&a.scope_reviewed_revision!==a.scope_revision)throw new Error('Review the current course scope before progressing.');
      const scopedDecision=action==='approve'?approvalInput(state,a,payload):null;
      if(action==='pass_scrutiny'&&a.template_snapshot.required_documents.some(type=>!state.documents.some(doc=>doc.application_id===a.id&&doc.doc_type===type&&documentEligible(doc))))throw new Error('Review validity of every required evidence category before accepting scrutiny.');
      if(['submit','resubmit'].includes(action)&&missingInputs(a,state.documents).length)throw new Error('Complete the required fields and documents first.');
      if(action==='pass_scrutiny'&&(state.claims.some(c=>c.application_id===a.id&&!['verified','not_applicable'].includes(c.status))||state.deficiencies.some(d=>d.application_id===a.id&&['open','escalated'].includes(d.status))))throw new Error('Resolve all claims and open deficiencies before accepting scrutiny.');
      if(['resubmit','raise_deficiency','pass_scrutiny','approve','reject','request_shc'].includes(action)&&reason.trim().length<10)throw new Error('Give a reason of at least 10 characters.');
      if(action==='request_shc'&&reason.trim().length<15)throw new Error('Provide specific synthetic grounds for appeal (at least 15 characters).');
      if(action==='pass_scrutiny'&&!state.claims.some(c=>c.application_id===a.id)&&a.template_snapshot.checklist.some(item=>!state.checklist.some(c=>c.application_id===a.id&&c.item===item&&c.passed)))throw new Error('Complete every checklist item first.');
      if(['approve','reject'].includes(action)&&!state.documents.some(d=>d.id===payload.evidence&&d.application_id===a.id&&d.scan_status==='clean'))throw new Error('Reference a clean case document.');
      if(action==='start_scrutiny'&&a.assigned_officer&&a.assigned_officer!==actor.id)throw new Error('This case is allocated to another officer.');
      const reviewContent=['approve','reject'].includes(action)?await demoReviewContent(state,a):null;
      if(['approve','reject'].includes(action)&&state.case_reviews?.some(item=>item.application_id===a.id&&item.mandatory&&item.status!=='cancelled'&&(item.status!=='completed'||item.basis_hash!==reviewContent)))throw new Error('Complete or explicitly cancel the mandatory additional review.');
      if(action==='schedule_evc'&&a.template_snapshot.inspection_planning_required)throw new Error('Use the expert resource planner.');
      if(action==='submit_evc_report'&&state.visits.some(item=>item.application_id===a.id&&item.resource_planned&&!item.completed_at&&item.planning_state!=='cancelled'))throw new Error('Use the confirmed resource-planned visit report command.');
      if(action==='schedule_evc'){const scheduled=String(payload.scheduled_for??'');if(!(Date.parse(scheduled)>Date.now()))throw new Error('Choose a future visit time.');state.visits.push({id:crypto.randomUUID(),application_id:a.id,coordinator_id:actor.id,scheduled_for:scheduled,completed_at:null,report:null,recommendation:null});}
      if(action==='submit_evc_report'){const v=state.visits.find(v=>v.application_id===a.id&&!v.completed_at);if(!v||v.coordinator_id!==actor.id||Date.parse(v.scheduled_for)>Date.now())throw new Error('A report is available after your scheduled visit.');if(reason.trim().length<20)throw new Error('Provide a full visit report.');v.completed_at=iso();v.report=reason;v.recommendation=String(payload.recommendation);}
      const caseClaims=state.claims.filter(c=>c.application_id===a.id);
      if(['pass_scrutiny','approve','reject'].includes(action)&&caseClaims.length){
        if(caseClaims.some(c=>(c.is_mandatory_snapshot??true)&&!['verified','not_applicable'].includes(c.status)))throw new Error('Every mandatory claim must be verified or not applicable.');
        if(caseClaims.some(c=>['verified','not_applicable'].includes(c.status)&&!reviewBasisCurrent(a,c,state.claim_evidence,state.documents)))throw new Error('Recorded review basis is missing or stale; review affected claims again.');
        if(state.deficiencies.some(d=>d.application_id===a.id&&(['open','escalated'].includes(d.status)||(d.status==='resolved'&&!d.rechecked_at))))throw new Error('Resolve every open deficiency.');
        if(state.integrity_signals.some(s=>s.application_id===a.id&&s.disposition==='confirmed'))throw new Error('A confirmed integrity signal blocks this decision.');
        for(const c of caseClaims.filter(c=>c.status==='verified')){if(c.verification_method==='system_check'){if(!c.system_result?.passed||!evaluateDemoRatio(a.form_data).passed||JSON.stringify(c.system_inputs)!==JSON.stringify(evaluateDemoRatio(a.form_data).inputs))throw new Error('Re-evaluate the current demo system-rule inputs.');}else if(!state.claim_evidence.some(link=>link.claim_id===c.id&&state.documents.some(d=>d.id===link.document_id&&currentClaimEvidence(c,d))))throw new Error('Every verified claim needs current clean evidence of the required type.');}
      }
      if(action==='raise_deficiency'&&caseClaims.length){const c=caseClaims.find(c=>c.id===payload.claim_id);if(!c)throw new Error('Claim does not belong to this application.');await (this as any).raiseClaimDeficiency(a,c,reason,String(payload.remedy??reason),String(payload.due_at??iso(30)));}
       if(action==='raise_deficiency'&&a.sla_due_at){a.paused_remaining_working_days=Math.max(0,workingDaysUntil(a.sla_due_at)??0);a.paused_at=iso();a.pause_reason=reason.trim();}
       const target:Record<string,Status>={submit:'submitted',resubmit:'resubmitted',start_scrutiny:'under_scrutiny',raise_deficiency:'deficiency_raised',pass_scrutiny:payload.evc?'evc_pending':'pending_decision',schedule_evc:'evc_scheduled',submit_evc_report:'pending_decision',approve:'approved',reject:'rejected',request_shc:'pending_decision'};
      const actionEvent=await prepareChainEvent(a,action,old,reason,payload);
       a.status=target[action];a.version++;a.updated_at=iso();if(action==='start_scrutiny')a.assigned_officer=actor.id;if(action==='pass_scrutiny')a.evc_required=Boolean(payload.evc);if(action==='request_shc'){a.form_data.shc_appeal_active='true';a.form_data.shc_grounds=reason.trim();a.sla_due_at=iso(10);}else if(['approve','reject'].includes(action)){a.decision_reason=reason;a.decision_evidence=String(payload.evidence);a.sla_due_at=null;}else if(action==='resubmit'&&a.paused_remaining_working_days!==null&&a.paused_remaining_working_days!==undefined){const calendar=a.template_snapshot.calendar;a.sla_due_at=calendar?addCalendarDays(iso(),a.paused_remaining_working_days,calendar):iso(a.paused_remaining_working_days);a.paused_remaining_working_days=null;a.paused_at=null;a.pause_reason=null;}else {const calendar=a.template_snapshot.calendar,stage=['evc_pending','evc_scheduled'].includes(a.status)?'evc':a.status==='pending_decision'?'decision':'scrutiny';a.sla_due_at=calendar?addCalendarDays(iso(),a.template_snapshot.stages.find(item=>item.key===stage)?.sla_days??7,calendar):iso(15);}        if(action!=='raise_deficiency')closeApplicationDeadlines(state,a);
      appendChainEvent(actionEvent);
      if(scopedDecision)recordApproval(state,a,actor,scopedDecision,actionEvent.id);
      receipts.set(input.requestId,body);persist();
    },
    async checklist(application,item,passed,note){const a=find(application.id);if(a.status!=='under_scrutiny'||role!=='scrutiny_officer'||a.assigned_officer!==actor.id)throw new Error('Assigned scrutiny officer required.');        state.checklist=state.checklist.filter(c=>!(c.application_id===a.id&&c.item===item));state.checklist.push({id:crypto.randomUUID(),application_id:a.id,item,passed,note});a.version++;await log(a,'checklist',a.status,note);persist();},
    async verifyClaim(application,claim,result,note,requestId=crypto.randomUUID()){
      return reviewMutation(application,requestId,'verify_claim',{claim:claim.id,result,note},async()=>{
        const a=find(application.id),c=state.claims.find(item=>item.id===claim.id&&item.application_id===a.id);
        if(!c||a.owner_id===actor.id||a.status!=='under_scrutiny'||role!=='scrutiny_officer'||a.assigned_officer!==actor.id)throw new Error('Assigned scrutiny officer required.');
        if(!['verified','not_applicable'].includes(result)||note.length>1000||(result==='not_applicable'&&note.trim().length<10))throw new Error('Choose a valid result and explain non-applicability (10 characters minimum).');
        if(state.deficiencies.some(item=>item.claim_id===c.id&&(['open','escalated'].includes(item.status)||(item.status==='resolved'&&!item.rechecked_at))))throw new Error('Resolve and re-check the open deficiency first.');
        const basis=buildReviewBasis(a,c,state.claim_evidence,state.documents,result);
        if(result==='verified'&&(c.verification_method==='system_check'?!basis.system_result?.passed:!basis.documents.length))throw new Error('Link current clean evidence, or satisfy the configured demo system rule, before verifying.');
        Object.assign(c,{status:result,verified_by:actor.id,verified_at:iso(),verification_note:note.trim()||null,verification_basis:basis,system_result:basis.system_result,system_inputs:basis.system_result?.inputs,updated_at:iso()});
        await log(a,'claim_verified',a.status,note.trim()||'Review recorded.',{claim_id:c.id,result});
      });
    },
    async linkClaimEvidence(application,claim,document,note,requestId=crypto.randomUUID()){
      return reviewMutation(application,requestId,'link_claim_evidence',{claim:claim.id,document:document.id,note},async()=>{
        const a=find(application.id),c=state.claims.find(item=>item.id===claim.id&&item.application_id===a.id);
        if(!c)throw new Error('Claim unavailable.');
        const owner=a.owner_id===actor.id&&role==='institution'&&(['draft','deficiency_raised'].includes(a.status)||state.deficiencies.some(item=>item.claim_id===c.id&&['open','escalated'].includes(item.status)));
        const officer=a.owner_id!==actor.id&&a.assigned_officer===actor.id&&a.status==='under_scrutiny'&&role==='scrutiny_officer';
        if(!owner&&!officer)throw new Error('Evidence link not permitted.');
        const doc=state.documents.find(item=>item.id===document.id&&item.application_id===a.id&&currentClaimEvidence(c,item));
        if(!doc||note.length>500)throw new Error('Evidence must be current, clean and match the claim category.');
        const existing=state.claim_evidence.find(link=>link.claim_id===c.id&&link.document_id===doc.id);
        state.claim_evidence=state.claim_evidence.filter(link=>!(link.claim_id===c.id&&link.document_id===doc.id));
        state.claim_evidence.push({claim_id:c.id,document_id:doc.id,linked_by:actor.id,linked_at:iso(),note:note.trim()||null});
        if(!existing&&['verified','not_applicable'].includes(c.status)){c.status='unverified';await log(a,'review_invalidated',a.status,'Linked evidence changed',{claim_id:c.id,cause:'evidence_link'});}
        await log(a,'claim_evidence_linked',a.status,note||'Evidence linked.',{claim_id:c.id,document_id:doc.id});
      });
    },
    async raiseClaimDeficiency(application,claim,observation,remedy,dueAt,requestId=crypto.randomUUID()){
      return reviewMutation(application,requestId,'raise_deficiency',{claim:claim.id,observation,remedy,dueAt},async()=>{
        const a=find(application.id),c=state.claims.find(item=>item.id===claim.id&&item.application_id===a.id);
        if(!c||a.owner_id===actor.id||a.status!=='under_scrutiny'||role!=='scrutiny_officer'||a.assigned_officer!==actor.id)throw new Error('Assigned scrutiny officer required.');
        const due=Date.parse(dueAt);if(observation.trim().length<10||observation.length>2000||remedy.trim().length<10||remedy.length>2000||!Number.isFinite(due)||due<=Date.now()||due>Date.now()+90*86400000)throw new Error('Observation, remedy, and a due date within 90 days are required.');
        if(state.deficiencies.some(item=>item.claim_id===c.id&&(['open','escalated'].includes(item.status)||(item.status==='resolved'&&!item.rechecked_at))))throw new Error('A deficiency is already open for this claim.');
        const id='demo-def-'+crypto.randomUUID();
        state.deficiencies.push({id,application_id:a.id,claim_id:c.id,clause:c.clause_snapshot,observation:observation.trim(),remedy:remedy.trim(),due_at:new Date(due).toISOString(),status:'open',raised_by:actor.id,raised_at:iso(),resolved_by:null,resolved_at:null,resolution_note:null,evidence_id:null,rechecked_by:null,rechecked_at:null,recheck_note:null,response_revision:0});
        c.status='deficient';c.updated_at=iso();await log(a,'deficiency_raised',a.status,observation.trim(),{claim_id:c.id,deficiency_id:id});
      });
    },
    async resolveClaimDeficiency(application,deficiency,evidence,note,requestId=crypto.randomUUID()){
      return reviewMutation(application,requestId,'resolve_deficiency',{deficiency:deficiency.id,evidence:evidence.id,note},async()=>{
        const a=find(application.id),d=state.deficiencies.find(item=>item.id===deficiency.id&&item.application_id===a.id);
        if(!d||a.owner_id!==actor.id||role!=='institution'||!['open','escalated'].includes(d.status)||!['under_scrutiny','deficiency_raised'].includes(a.status))throw new Error('Institution owner required for an open deficiency.');
        const c=state.claims.find(item=>item.id===d.claim_id)!;
        const doc=state.documents.find(item=>item.id===evidence.id&&item.application_id===a.id&&currentClaimEvidence(c,item)&&item.sha256);
        if(!doc||note.trim().length<10||note.length>2000)throw new Error('Provide matching current clean evidence and a resolution note.');
        Object.assign(d,{status:'resolved',resolved_by:actor.id,resolved_at:iso(),resolution_note:note.trim(),evidence_id:doc.id,response_revision:(d.response_revision??0)+1,rechecked_by:null,rechecked_at:null,recheck_note:null});
        c.status='unverified';c.updated_at=iso();
        state.claim_evidence=state.claim_evidence.filter(link=>!(link.claim_id===c.id&&link.document_id===doc.id));state.claim_evidence.push({claim_id:c.id,document_id:doc.id,linked_by:actor.id,linked_at:iso(),note:note.trim()});
        await log(a,'deficiency_resolved',a.status,note.trim(),{claim_id:c.id,deficiency_id:d.id,evidence_id:doc.id,response_revision:d.response_revision});
      });
    },
    async recheckClaimDeficiency(application,deficiency,result,note,requestId=crypto.randomUUID()){
      return reviewMutation(application,requestId,'recheck_deficiency',{deficiency:deficiency.id,result,note},async()=>{
        const a=find(application.id),d=state.deficiencies.find(item=>item.id===deficiency.id&&item.application_id===a.id);
        if(!d||a.owner_id===actor.id||a.assigned_officer!==actor.id||!['under_scrutiny','deficiency_raised'].includes(a.status)||role!=='scrutiny_officer')throw new Error('Assigned scrutiny officer required.');
        if(d.status!=='resolved'||d.rechecked_at||!['accepted','reopened'].includes(result)||note.trim().length<10||note.length>2000)throw new Error('A current resolved response and a re-check note are required.');
        const c=state.claims.find(item=>item.id===d.claim_id)!;
        if(result==='accepted'){
          const doc=state.documents.find(item=>item.id===d.evidence_id&&item.application_id===a.id&&currentClaimEvidence(c,item)&&item.sha256);
          if(!doc||!state.claim_evidence.some(link=>link.claim_id===c.id&&link.document_id===doc.id))throw new Error('The response evidence must be current and clean.');
          const basis=buildReviewBasis(a,c,state.claim_evidence,state.documents,'verified');
          if(c.verification_method==='system_check'&&!basis.system_result?.passed)throw new Error('Demo system rule failed.');
          Object.assign(c,{status:'verified',verified_by:actor.id,verified_at:iso(),verification_note:note.trim(),verification_basis:basis,system_result:basis.system_result,system_inputs:basis.system_result?.inputs,updated_at:iso()});
        }else{Object.assign(d,{status:'open',resolved_by:null,resolved_at:null,resolution_note:null,evidence_id:null});c.status='deficient';c.updated_at=iso();}
        Object.assign(d,{rechecked_by:actor.id,rechecked_at:iso(),recheck_note:note.trim()});
        await log(a,'deficiency_rechecked',a.status,note.trim(),{claim_id:c.id,deficiency_id:d.id,result,response_revision:d.response_revision??0});
      });
    },
    async history(application){find(application.id);const events=(await buildAuditChain(state.events.filter(event=>event.application_id===application.id))).sort((a,b)=>a.sequence-b.sequence);return {events,through:events.length,head_hash:events.at(-1)?.event_hash??null,complete:true,message:'Synthetic browser history; hashes are simulated on read.'};},
    async verifyAudit(application):Promise<AuditVerification>{const a=find(application.id);return verifyAuditChain(await buildAuditChain(state.events.filter(e=>e.application_id===a.id)));},
    async tamperReplay(application):Promise<AuditVerification>{const a=find(application.id);if(a.owner_id===actor.id||!['scrutiny_officer','regional_officer','national_admin'].includes(role))throw new Error('Review or decision authority required.');const events=await buildAuditChain(state.events.filter(e=>e.application_id===a.id));if(!events.length)return verifyAuditChain(events);const target=Math.max(1,Math.ceil(events.length/2));return verifyAuditChain(events.map((event,index)=>index===target-1?{...event,reason:`${event.reason??'Synthetic event'} [tamper replay on copy]`}:event));},
    async upload(application,type,file){validateFile(file);const a=find(application.id);if(!canUploadEvidence(a,actor,state.claims,state.deficiencies,type,state.obligations,state.documents))throw new Error('Application is locked for this evidence type.');        state.documents.unshift({id:'demo-doc-'+crypto.randomUUID(),application_id:a.id,doc_type:type,file_name:file.name,file_path:'demo-only',size_bytes:file.size,mime_type:file.type,scan_status:'pending',sha256:null,uploaded_at:iso(),validity_mode:'unknown',subject_institution_id:a.institution_id});await log(a,'document_reserved',a.status,'Demo metadata only; bytes never leave this browser.');persist();},
    async submitRenewal(application,expired,input,requestId=crypto.randomUUID()){
      if(role!=='institution'||application.owner_id!==actor.id)throw new Error('The owning institution must submit its renewal.');
      const note=input.note.trim();
      if(note.length<10||note.length>1000)throw new Error('Describe the replacement in 10 to 1,000 characters.');
      if(Boolean(input.file)===Boolean(input.documentId))throw new Error('Choose one replacement file or one clean uploaded document.');
      if(input.file)validateFile(input.file);
      const hash=input.file?await sha256Bytes(input.file):null;
      await reviewMutation(application,requestId,'renewal_submit',{expired:expired.id,document:input.documentId??null,note,sha256:hash},async()=>{
        const a=find(application.id);
        if(a.owner_id!==actor.id||role!=='institution'||a.status!=='approved')throw new Error('Only the owning institution can renew an approved case.');
        const parent=state.documents.find(item=>item.id===expired.id&&item.application_id===a.id);
        if(!parent||!parent.expires_on||parent.scan_status!=='clean'||!parent.sha256||expiryState(parent.expires_on)!=='expired'||!a.template_snapshot.required_documents.includes(parent.doc_type))throw new Error('Choose an expired, clean required document.');
        let replacement:DocumentRecord;
        if(input.file){
          replacement={id:'demo-doc-'+crypto.randomUUID(),application_id:a.id,doc_type:parent.doc_type,file_name:input.file.name,file_path:'demo-only',size_bytes:input.file.size,mime_type:input.file.type,scan_status:'clean',sha256:hash,uploaded_at:iso(),validity_mode:'unknown',subject_institution_id:a.institution_id,supersedes_document_id:parent.id};
          state.documents.unshift(replacement);
        }else{
          const selected=state.documents.find(item=>item.id===input.documentId&&item.application_id===a.id);
          if(!selected||selected.id===parent.id||selected.doc_type!==parent.doc_type||selected.scan_status!=='clean'||!selected.sha256||selected.subject_institution_id!==a.institution_id||expiryState(selected.expires_on)==='expired'||(selected.supersedes_document_id&&selected.supersedes_document_id!==parent.id))throw new Error('Choose a clean replacement of the same document type.');
          selected.supersedes_document_id=parent.id;
          replacement=selected;
        }
        const existing=state.obligations.find(item=>item.application_id===a.id&&item.kind==='renewal');
        if(existing&&!['open','escalated'].includes(existing.status.toLowerCase()))throw new Error('A renewal has already been submitted for this case.');
        const fields={document_id:parent.id,document_expiry_on:parent.expires_on,due_date:parent.expires_on!,deadline_source:'document_validity',required_evidence:[parent.doc_type],status:'submitted',title:`Renewal required - ${parent.doc_type}`};
        let obligationId:string;
        if(existing){Object.assign(existing,fields,{deadline_revision:(existing.deadline_revision??1)+1});obligationId=existing.id;}
        else{const row={id:'demo-obl-'+crypto.randomUUID(),application_id:a.id,institution_id:a.institution_id,region:a.region,kind:'renewal',deadline_revision:1,...fields};state.obligations.push(row);obligationId=row.id;}
        await log(a,'renewal_submitted',a.status,note,{obligation_id:obligationId,document_id:replacement.id,replaces_document_id:parent.id,sha256:replacement.sha256});
      });
    },
    async download(record){
      if(record.scan_status!=='clean')throw new Error('Quarantined documents are not downloadable.');
      if(expiryState(record.expires_on)==='expired')throw new Error('Expired documents stay on file for review history and are not downloadable.');
      if(!record.file_path.startsWith('/samples/'))throw new Error('No generated sample bytes exist for this document.');
      const response=await fetch(record.file_path);
      if(!response.ok)throw new Error('The generated sample asset is unavailable.');
      const bytes=new Uint8Array(await response.arrayBuffer());
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const hash=Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
      if(record.sample_sha256&&hash!==record.sample_sha256)throw new Error('Sample bytes do not match the recorded checksum.');
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      const anchor=globalThis.document.createElement('a');
      anchor.href=url;anchor.download=record.file_name;
      globalThis.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      globalThis.setTimeout(()=>URL.revokeObjectURL(url),1000);
    },
    async markRead(id){const n=state.notifications.find(n=>n.id===id);if(n)n.read_at=iso();persist();},
    async advanceClock(days){const report=planClockAdvance(days,{now:Date.now(),applications:state.applications,obligations:state.obligations,documents:state.documents,holidays:workspaceHolidays()});
              const affected=new Map<string,ClockConsequence[]>();
      const dispatched={reminders:0,overdue:0,escalations:0,expiries:0};
      for(const row of [...report.reminders,...report.overdue,...report.escalations,...report.expiries]){
        if(!row.application_id)continue;
        const list=affected.get(row.application_id)??[];
        list.push(row);affected.set(row.application_id,list);
      }
      for(const [applicationId,rows] of affected){const anchor=state.applications.find(item=>item.id===applicationId&&visible(item));if(!anchor)continue;
        const base=new Date(Date.now()).toISOString().slice(0,10);
        const priorHorizon=state.events.filter(ev=>ev.action==='demo_calendar_advanced'&&ev.application_id===applicationId&&typeof ev.payload.horizon_end==='string'&&ev.payload.horizon_end>base).map(ev=>ev.payload.horizon_end as string).sort().pop()??null;
        const catchUp=priorHorizon!==null;
        const payload:Record<string,unknown>={demo:true,coverage:'derived_horizon',days:report.days,horizon_end:new Date(Date.now()+report.days*86400000).toISOString().slice(0,10),consequences:structuredClone(rows),dispatched};
        if(catchUp&&priorHorizon)payload.catch_up_from=priorHorizon;
        await log(anchor,'demo_calendar_advanced',null,'Simulated demo calendar advanced by '+report.days+' days; derived consequences only. No notices were dispatched and no review decision was recorded. '+(catchUp&&priorHorizon?'Partial catch-up: consequences through '+priorHorizon+' were already derived by an earlier calendar shift. ':''),payload,{actor_id:null,actor_role:'system'});
      }
      persist();return {...report,dispatched};},
    async fulfil(id,reason){if(!['national_admin','regional_officer'].includes(role))throw new Error('Decision role required.');const o=state.obligations.find(o=>o.id===id);if(o){if((o.required_evidence??[]).length)throw new Error('Select reviewed evidence with the versioned compliance command.');o.status='fulfilled';await log(find(o.application_id),'obligation_fulfilled',null,reason);}persist();},
    async dispositionSignal(signalId,disposition,reason){if(!['explained','confirmed','dismissed'].includes(disposition))throw new Error('Choose a valid disposition: explained, confirmed, or dismissed.');const trimmed=reason.trim();if(trimmed.length<10||trimmed.length>1000)throw new Error('Explain the disposition in 10 to 1,000 characters.');const signal=state.integrity_signals.find(s=>s.id===signalId);if(!signal)throw new Error('Integrity signal unavailable.');const a=find(signal.application_id);const prior=signal.disposition as Status|null;Object.assign(signal,{disposition,disposition_reason:trimmed,disposed_by:actor.id,disposed_at:iso()});await log(a,'signal_disposition',prior,trimmed,{signal_id:signalId,signal_type:signal.signal_type,disposition});persist();},
    async dispatchNotification(params){const kinds=['REMINDER','OVERDUE','ESCALATION','INFO','RETURN'];if(!kinds.includes(params.kind))throw new Error('Choose a valid notification kind.');const trimmedSubject=params.subject.trim();const trimmedBody=params.body.trim();if(trimmedSubject.length<3||trimmedSubject.length>200)throw new Error('Subject must be 3 to 200 characters.');if(trimmedBody.length<5||trimmedBody.length>2000)throw new Error('Body must be 5 to 2,000 characters.');if(!params.applicationId)throw new Error('Application is required.');const app=find(params.applicationId);const result=await dispatchNotification({...params,applicationId:app.id});const channel=params.channel??['in_app'];const attempt=result.attempts.find(a=>a.channel===channel[0])??result.attempts[0];const notification:Notification={id:result.notificationId,title:trimmedSubject,body:trimmedBody,read_at:null,created_at:iso(),application_id:app.id,channel:channel[0],deliveryStatus:attempt.status,previewUrl:attempt.previewUrl};state.notifications.unshift(notification);await log(app,'notification_dispatched',null,trimmedSubject,{notification_id:notification.id,channel:notification.channel,status:notification.deliveryStatus,kind:params.kind,target_user_id:params.toUserId,target_institution_id:params.toInstitutionId,application_id:app.id,gateway:result.gateway,attempts:result.attempts},{actor_id:actor.id,actor_role:role});persist();return {notificationId:notification.id,channel:notification.channel,status:notification.deliveryStatus,previewUrl:notification.previewUrl,gateway:result.gateway,attempts:result.attempts};},
    async advisory(application,documents){const safe={id:application.id,ref_no:application.ref_no,is_demo:true,status:application.status,version:application.version,form_data:Object.fromEntries(Object.entries(application.form_data).map(([key,value])=>[key,value.trim()?'provided':''])),template_snapshot:{required_fields:application.template_snapshot.required_fields,required_documents:application.template_snapshot.required_documents}};const response=await fetch('/api/advisories/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({application:safe,documents:documents.map(d=>({doc_type:d.doc_type,scan_status:d.scan_status}))})});if(!response.ok)throw new Error('Start the local advisory service to run the document pre-check.');return response.json() as Promise<Advisory>;},
    async scheduleEVC(application,input,requestId=crypto.randomUUID()){
      const a=find(application.id);
      const institutionProposal=role==='institution'&&a.owner_id===actor.id;
      if(!institutionProposal&&!evcManageable(a))throw new Error('Institution owner, regional officer, or EVC coordinator required.');
      if(!a.evc_required)throw new Error('This application route does not require an EVC visit.');
      const {startMs}=evcWindow(input.scheduledStart,input.scheduledEnd);
      if(startMs<=Date.now())throw new Error('Schedule a future visit.');
      if(input.mode!=='ONLINE'&&input.mode!=='PHYSICAL')throw new Error('Choose an online or physical visit.');
      const note=input.note.trim();if(note.length<10||note.length>1000)throw new Error('Describe the visit purpose in 10 to 1,000 characters.');
      await reviewMutation(application,requestId,'schedule_evc',{scheduledStart:input.scheduledStart,scheduledEnd:input.scheduledEnd,mode:input.mode,note},async()=>{
        const ca=find(application.id);
        if(ca.owner_id!==actor.id&&!evcManageable(ca))throw new Error('Institution owner, regional officer, or EVC coordinator required.');
        if(!ca.evc_required)throw new Error('This application route does not require an EVC visit.');
        const existing=state.evc_visits.find(v=>v.application_id===ca.id&&!['CANCELLED','COMPLETED'].includes(v.status));
        if(existing)throw new Error('An active EVC visit already exists for this application.');
        const old=ca.status;
        const visit:EVCVisit={
          id:'demo-evc-visit-'+crypto.randomUUID(),application_id:ca.id,institution_id:ca.institution_id,region:ca.region,
          mode:input.mode,scheduled_start:input.scheduledStart,scheduled_end:input.scheduledEnd,
          status:'SCHEDULED',schedule_version:1,completed_at:null,report:null,recommendation:null,
          coordinator_id:actor.id,decision_event_id:null,created_at:iso(),updated_at:iso(),
        };
        state.evc_visits.push(visit);
        if(['evc_pending','evc_scheduled'].includes(ca.status))ca.status='evc_scheduled';
        ca.updated_at=iso();
        await log(ca,'evc_scheduled',old,note,{visit_id:visit.id,scheduled_start:visit.scheduled_start,scheduled_end:visit.scheduled_end,mode:visit.mode});
      });
    },
    async assignEVCMembers(application:Application,visitId:string,members:{expertId:string;seat:EVCSeat}[],requestId=crypto.randomUUID()){
      const a=find(application.id);
      if(!evcManageable(a))throw new Error('Regional officer or EVC coordinator required.');
      const visit=state.evc_visits.find(item=>item.id===visitId&&item.application_id===a.id);
      if(!visit||!['SCHEDULED','RESCHEDULING_REQUIRED'].includes(visit.status))throw new Error('An active scheduled EVC visit is required.');
      await reviewMutation(application,requestId,'assign_evc_members',{visitId,members},async()=>{
        const ca=find(application.id);
        if(!evcManageable(ca))throw new Error('Regional officer or EVC coordinator required.');
        const v=state.evc_visits.find(item=>item.id===visitId&&item.application_id===ca.id);
        if(!v||!['SCHEDULED','RESCHEDULING_REQUIRED'].includes(v.status))throw new Error('An active scheduled EVC visit is required.');
        validateEvcAssignments(ca,v,members);
        const prior=state.evc_members.filter(item=>item.evc_visit_id===visitId&&item.active);
        const priorBySeat=new Map(prior.map(item=>[item.seat,item]));
        const nextVersion=Math.max(0,...state.evc_members.filter(item=>item.evc_visit_id===visitId).map(item=>item.invited_version))+1;
        const created:EVCMember[]=[];
        for(const item of members){
          const existing=priorBySeat.get(item.seat);
          if(existing&&existing.user_id===item.expertId){created.push(existing);continue;}
          if(existing){existing.active=false;existing.updated_at=iso();}
          const row:EVCMember={id:'demo-evc-member-assign-'+crypto.randomUUID(),evc_visit_id:visitId,user_id:item.expertId,seat:item.seat,response_status:'INVITED',response_note:null,responded_at:null,active:true,invited_version:nextVersion,reserved_period_start:v.scheduled_start,reserved_period_end:v.scheduled_end,created_at:iso(),updated_at:iso()};
          state.evc_members.push(row);created.push(row);
        }
        for(const member of prior)if(!created.includes(member)){member.active=false;member.updated_at=iso();}
        const unresolved=state.evc_members.filter(item=>item.evc_visit_id===visitId&&item.active).some(item=>['REJECTED','CONFLICT_REPORTED','WITHDRAWAL_REQUESTED'].includes(item.response_status));
        if(v.status==='RESCHEDULING_REQUIRED'&&!unresolved)v.status='SCHEDULED';
        v.updated_at=iso();ca.updated_at=iso();
        await log(ca,'evc_members_assigned',ca.status,'EVC members recorded for the visit.',{visit_id:visitId,members:members.map(item=>({member_id:item.expertId,seat:item.seat}))});
      });
    },
    async respondToEVC(visitId,response,reason,requestId=crypto.randomUUID()){
      if(role!=='evc_member')throw new Error('EVC member required.');
      const visit=state.evc_visits.find(item=>item.id===visitId);
      if(!visit)throw new Error('EVC visit not found.');
      const member=state.evc_members.find(item=>item.evc_visit_id===visitId&&item.user_id===actor.id&&item.active);
      if(!member)throw new Error('You are not assigned to this EVC visit.');
      if(member.response_status!=='INVITED')throw new Error('You have already responded to this visit invitation.');
      if(!['ACCEPTED','REJECTED','CONFLICT_REPORTED','WITHDRAWAL_REQUESTED'].includes(response))throw new Error('Choose a valid response.');
      if(!['SCHEDULED','RESCHEDULING_REQUIRED'].includes(visit.status))throw new Error('This invitation is not open for a response.');
      const trimmed=reason.trim();if(response!=='ACCEPTED'&&(trimmed.length<10||trimmed.length>1000))throw new Error('Provide a reason (10 to 1,000 characters).');
      const a=find(visit.application_id);
      await reviewMutation(a,requestId,'respond_evc',{visitId,response,reason:trimmed},async()=>{
        const v=state.evc_visits.find(item=>item.id===visitId);
        if(!v||!['SCHEDULED','RESCHEDULING_REQUIRED'].includes(v.status))throw new Error('This invitation is not open for a response.');
        const m=state.evc_members.find(item=>item.evc_visit_id===visitId&&item.user_id===actor.id&&item.active);
        if(!m||m.response_status!=='INVITED')throw new Error('You have already responded to this visit invitation.');
        Object.assign(m,{response_status:response,response_note:trimmed||null,responded_at:iso(),updated_at:iso()});
        if(['REJECTED','CONFLICT_REPORTED','WITHDRAWAL_REQUESTED'].includes(response)){v.status='RESCHEDULING_REQUIRED';v.updated_at=iso();}
        await log(a,'evc_response_recorded',a.status,trimmed||null,{visit_id:visitId,response,member_id:actor.id});
      });
    },
    async confirmEVC(visitId,requestId=crypto.randomUUID()){
      const visit=state.evc_visits.find(item=>item.id===visitId);
      if(!visit)throw new Error('EVC visit not found.');
      const a=find(visit.application_id);
      if(!evcManageable(a))throw new Error('Regional officer or EVC coordinator required.');
      await reviewMutation(a,requestId,'confirm_evc',{visitId},async()=>{
        const ca=find(a.id);
        if(!evcManageable(ca))throw new Error('Regional officer or EVC coordinator required.');
        const v=state.evc_visits.find(item=>item.id===visitId&&item.application_id===ca.id);
        if(!v||v.status!=='SCHEDULED')throw new Error('A scheduled EVC visit is required.');
        const members=state.evc_members.filter(item=>item.evc_visit_id===visitId&&item.active);
        if(members.length!==EVC_REQUIRED_SEATS.length)throw new Error('All three seats must be assigned before confirming.');
        if(!members.every(item=>item.response_status==='ACCEPTED'))throw new Error('All members must accept before confirming.');
        validateEvcAssignments(ca,v,members.map(item=>({expertId:item.user_id,seat:item.seat})));
        v.status='CONFIRMED';v.updated_at=iso();ca.updated_at=iso();
        await log(ca,'evc_confirmed',ca.status,'All EVC members accepted. Visit confirmed.',{visit_id:visitId});
      });
    },
    async cancelEVC(visitId,reason,requestId=crypto.randomUUID()){
      const visit=state.evc_visits.find(item=>item.id===visitId);
      if(!visit)throw new Error('EVC visit not found.');
      const a=find(visit.application_id);
      if(!evcManageable(a))throw new Error('Regional officer or EVC coordinator required.');
      const trimmed=reason.trim();if(trimmed.length<10||trimmed.length>1000)throw new Error('Provide a reason (10 to 1,000 characters).');
      await reviewMutation(a,requestId,'cancel_evc',{visitId,reason:trimmed},async()=>{
        const ca=find(a.id);
        if(!evcManageable(ca))throw new Error('Regional officer or EVC coordinator required.');
        const v=state.evc_visits.find(item=>item.id===visitId&&item.application_id===ca.id);
        if(!v||['CANCELLED','COMPLETED'].includes(v.status))throw new Error('An active EVC visit is required.');
        const old=ca.status;
        v.status='CANCELLED';v.updated_at=iso();
        for(const member of state.evc_members.filter(item=>item.evc_visit_id===visitId&&item.active)){member.active=false;member.updated_at=iso();}
        const another=state.evc_visits.some(item=>item.application_id===ca.id&&item.id!==visitId&&!['CANCELLED','COMPLETED'].includes(item.status));
        if(!another&&['evc_pending','evc_scheduled'].includes(ca.status))ca.status='evc_pending';
        ca.updated_at=iso();
        await log(ca,'evc_cancelled',old,trimmed,{visit_id:visitId});
      });
    },
    async rescheduleEVC(visitId,input,requestId=crypto.randomUUID()){
      const visit=state.evc_visits.find(item=>item.id===visitId);
      if(!visit)throw new Error('EVC visit not found.');
      const a=find(visit.application_id);
      if(!evcManageable(a))throw new Error('Regional officer or EVC coordinator required.');
      const {startMs,endMs}=evcWindow(input.scheduledStart,input.scheduledEnd);
      if(startMs<=Date.now())throw new Error('Choose a future visit window.');
      if(input.mode!=='ONLINE'&&input.mode!=='PHYSICAL')throw new Error('Choose an online or physical visit.');
      const reason=input.reason.trim();if(reason.length<10||reason.length>1000)throw new Error('Provide a reason (10 to 1,000 characters).');
      await reviewMutation(a,requestId,'reschedule_evc',{visitId,scheduledStart:input.scheduledStart,scheduledEnd:input.scheduledEnd,mode:input.mode,reason},async()=>{
        const ca=find(a.id);
        if(!evcManageable(ca))throw new Error('Regional officer or EVC coordinator required.');
        const v=state.evc_visits.find(item=>item.id===visitId&&item.application_id===ca.id);
        if(!v||['CANCELLED','COMPLETED'].includes(v.status))throw new Error('An active EVC visit is required.');
        const active=state.evc_members.filter(item=>item.evc_visit_id===visitId&&item.active);
        if(active.length===EVC_REQUIRED_SEATS.length){
          const experts=active.map(item=>{const expert=evcExpert(item.user_id);if(!expert)throw new Error('A recorded member is missing from the EVC registry.');return expert;});
          if(experts.some(expert=>expert.region!==ca.region))throw new Error('A recorded member is outside the case region.');
          for(const expert of experts){const conflicts=evcConflicts(expert.id,startMs,endMs,visitId);if(conflicts.length)throw new Error(expert.full_name+' is not available for the new window.');}
        }
        const oldStart=v.scheduled_start,oldEnd=v.scheduled_end;
        v.scheduled_start=input.scheduledStart;v.scheduled_end=input.scheduledEnd;v.mode=input.mode;v.status='SCHEDULED';v.schedule_version+=1;v.updated_at=iso();
        for(const member of active){member.response_status='INVITED';member.response_note=null;member.responded_at=null;member.reserved_period_start=input.scheduledStart;member.reserved_period_end=input.scheduledEnd;member.invited_version+=1;member.updated_at=iso();}
        state.evc_schedule_history.push({id:'demo-evc-history-'+crypto.randomUUID(),evc_visit_id:visitId,old_start:oldStart,old_end:oldEnd,new_start:input.scheduledStart,new_end:input.scheduledEnd,changed_by:actor.id,changed_at:iso(),reason});
        ca.updated_at=iso();
        await log(ca,'evc_rescheduled',ca.status,reason,{visit_id:visitId,old_start:oldStart,old_end:oldEnd,new_start:input.scheduledStart,new_end:input.scheduledEnd});
      });
    },
    async getEVCVisits(application){
      const a=find(application.id);
      return state.evc_visits.filter(v=>v.application_id===a.id).sort((x,y)=>Date.parse(y.scheduled_start)-Date.parse(x.scheduled_start));
    },
    async getEVCAvailability(application:Application,start:string,end:string):Promise<EVCAvailabilityResult>{
      const a=find(application.id);
      const {startMs,endMs}=evcWindow(start,end);
      const officials=demoEvcExperts.filter(expert=>expert.region===a.region).map(expert=>evcAvailabilityFor(expert,startMs,endMs));
      const candidates=new Map<EVCSeat,string[]>(EVC_REQUIRED_SEATS.map(seat=>[seat,officials.filter(item=>item.status==='AVAILABLE'&&item.seatEligibility[seat].outcome==='PASS').map(item=>item.id)]));
      const bySeat=Object.fromEntries(EVC_SEATS.map(seat=>[seat,candidates.get(seat)?.length??0])) as Record<EVCSeat,number>;
      const satisfiable=canStaff(candidates);
      return {officials,capacity:{satisfiable,bySeat,message:satisfiable?null:'No combination of available, verified members fills all three required seats in this window.',bufferMinutes:0}};
    },
    async recordEVCUnavailability(expertId:string,start:string,end:string,reason:string,requestId=crypto.randomUUID()){
      const expert=evcExpert(expertId);if(!expert)throw new Error('Choose a member from the EVC registry.');
      const allowed=expert.user_id===actor.id||actor.roles.some(grant=>grant.role==='national_admin'||(['evc_coordinator','regional_officer'].includes(grant.role)&&grant.region===expert.region));
      if(!allowed)throw new Error('Record unavailability for yourself or a member in your region.');
      evcWindow(start,end);
      const trimmed=reason.trim();if(trimmed.length<10||trimmed.length>1000)throw new Error('Describe the unavailability in 10 to 1,000 characters.');
      const body=JSON.stringify({expertId,start,end,reason:trimmed});
      if(receipts.has(requestId)){if(receipts.get(requestId)!==body)throw new Error('Request ID already used.');return;}
      const duplicate=state.evc_unavailability.find(item=>item.expert_id===expertId&&item.starts_at===start&&item.ends_at===end&&!item.withdrawn_at);
      if(!duplicate)state.evc_unavailability.push({id:'demo-evc-unavail-'+crypto.randomUUID(),expert_id:expertId,starts_at:start,ends_at:end,reason:trimmed,withdrawn_at:null,created_at:iso()});
      receipts.set(requestId,body);
      persist();
    },
  };
}
export function resetDemo(){localStorage.removeItem(STORAGE);location.reload();}




