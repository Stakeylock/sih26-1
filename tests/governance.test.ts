import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {approvalFixture,as,database,failure,ids,ready,readyClaims,scalar,transition} from './database';
import type {NoticeImpact,ScopeRequest} from '../src/domain/approvals';
import {noticeDue} from '../src/domain/approvals';
let db:PGlite;
beforeAll(async()=>{db=await database();},60000);afterAll(async()=>db?.close());
beforeEach(async()=>db.exec('begin'));afterEach(async()=>db.exec('reset role;rollback'));
const version=(id:string)=>scalar<number>(db,'select version from public.applications where id=$1',[id]);
const command=(kind:string,id:string|null,payload:Record<string,unknown>,expected:number|null,request=crypto.randomUUID())=>scalar<Record<string,unknown>>(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',[kind,id,payload,expected,request]);
const request={course_key:'UG-CSE',programme:'Engineering',course_name:'Synthetic computing',level:'Undergraduate',requested_intake:120,previous_scope_item_id:null};
async function scopedCase(){const id=await ready(db);await command('scope_save',id,{academic_year_start:2026,items:[request]},await version(id));await transition(db,id,'submit');await as(db,ids.scrutiny);await transition(db,id,'start_scrutiny');return id;}
async function decisionCase(){const id=await scopedCase();await command('scope_review',id,{note:'Reviewed synthetic prior and requested course scope.'},await version(id));
 const checks=await scalar<string[]>(db,`select array(select jsonb_array_elements_text(template_snapshot->'checklist')) from public.applications where id=$1`,[id]);for(const check of checks)await db.query(`select public.fp_checklist($1,$2,true,'Reviewed synthetic fixture evidence')`,[id,check]);await transition(db,id,'pass_scrutiny','Synthetic scope and checklist reviewed',{evc:false});await as(db,ids.regional);return id;}
async function recordedApproval(){const id=await decisionCase(),items=await scalar<ScopeRequest[]>(db,'select jsonb_agg(s) from public.application_scope_items s where application_id=$1',[id]);const evidence=await scalar<string>(db,'select id from public.application_documents where application_id=$1 and doc_type=$2',[id,'Faculty List']);
 const payload={evidence,approval:{...approvalFixture,academic_year_end:2028,valid_to:'2029-06-30',items:items.map(item=>({request_item_id:item.id,approved_intake:60})),conditions:[{title:'Synthetic faculty evidence follow-up',due_date:'2027-02-15',required_evidence:['Faculty List']}]}};
 const key=crypto.randomUUID(),expected=await version(id);const result=await scalar<Record<string,unknown>>(db,`select public.fp_transition($1,'approve','Reviewed synthetic capacity and condition',$2,$3,$4)`,[id,payload,expected,key]);return {id,payload,key,expected,result,evidence};}
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now());
 async function notice(target:string,options:Record<string,unknown>={}){await as(db,ids.admin);const input={code:'DEMO-'+crypto.randomUUID(),title:'Synthetic deadline source',issuer:'Synthetic policy author',source_url:'demo://synthetic/notice',source_version:'demo-v1',source_hash:'ab'.repeat(32),publication_date:today(),effective_date:today(),academic_year_start:2026,institution_id:await scalar(db,'select institution_id from public.applications where id=$1',[target]),application_type:null,region:'South',deadline_kind:'application_sla',obligation_kind:null,trigger_type:'fixed_date',calendar_basis:'calendar_days',duration_days:null,fixed_date:'2099-01-01',supersedes_notice_id:null,...options};const created=await command('notice_create',null,input,null);const id=created.id as string;await command('notice_review',id,{note:'Reviewed the synthetic source, scope and calendar.'},1);return id;}
const preview=(id:string)=>scalar<NoticeImpact>(db,'select public.fp_notice_preview($1)',[id]);
async function adoption(id:string,impact?:NoticeImpact){const impactValue=impact??await preview(id);return command('notice_adopt',id,{note:'Adopting the reviewed synthetic deadline impact.',impact_hash:impactValue.impact_hash},2);}

describe('requested and approved course scope',()=>{
 it('derives prior intake from institution-scoped records and records an exact immutable decision',async()=>{
  const {id,payload,key,expected,result}=await recordedApproval();const record=await scalar<Record<string,unknown>>(db,'select to_jsonb(p) from public.approval_records p where application_id=$1',[id]);
  expect(record).toMatchObject({academic_year_start:2026,academic_year_end:2028,valid_to:'2029-06-30',provenance:'recorded_decision'});
  expect(await scalar(db,'select approved_intake from public.approval_scope_items where approval_id=$1',[record.id])).toBe(60);
  expect(await scalar(db,'select count(*)::int from public.obligations where approval_id=$1',[record.id])).toBe(1);
  expect(await scalar(db,'select count(*)::int from public.obligations where application_id=$1 and kind=$2',[id,'renewal'])).toBe(0);
  expect(await scalar(db,`select e.action from public.application_events e where e.id=$1`,[record.decision_event_id])).toBe('approve');
  expect(await scalar(db,`select public.fp_transition($1,'approve','Reviewed synthetic capacity and condition',$2,$3,$4)`,[id,payload,expected,key])).toEqual(result);
  expect(await failure(db,'update public.approval_records set valid_to=$1 where application_id=$2',['2030-01-01',id])).toContain('permission denied');
  await db.exec('reset role');expect(await failure(db,'update public.approval_scope_items set approved_intake=100')).toContain('append-only');
  await as(db,ids.institution);const next=await scalar<string>(db,`select public.fp_create_application('new_programme','Synthetic follow-up capacity request')`),prior=await scalar<string>(db,'select id from public.approval_scope_items where approval_id=$1',[record.id]);
  await command('scope_save',next,{academic_year_start:2027,items:[{...request,previous_scope_item_id:prior,previous_approved_intake:9999}]},await version(next));
  expect(await scalar(db,'select previous_approved_intake from public.application_scope_items where application_id=$1',[next])).toBe(60);
  expect(await scalar(db,`select (payload->'items'->0->>'previous_approved_intake')::int from public.application_events where application_id=$1 and action='scope_save' order by sequence desc limit 1`,[next])).toBe(60);
  await as(db,ids.other);await db.query(`select public.fp_create_institution('Synthetic other institute','DEMO-OTHER-SCOPE','South','Synthetic state')`);const unrelated=await scalar<string>(db,`select public.fp_create_application('new_programme','Synthetic unrelated institution request')`);
  expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['scope_save',unrelated,{academic_year_start:2027,items:[{...request,previous_scope_item_id:prior}]},await version(unrelated),crypto.randomUUID()])).toContain('this institution');
 });
 it('requires current scope review and rejects stale edits and excessive approval intake',async()=>{
  const id=await scopedCase();expect(await failure(db,`select public.fp_transition($1,'pass_scrutiny','Reviewed synthetic case','{"evc":false}',$2,$3)`,[id,await version(id),crypto.randomUUID()])).toContain('current course scope');
  await as(db,ids.institution);expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['scope_review',id,{note:'Institution cannot review itself'},await version(id),crypto.randomUUID()])).toContain('Assigned scrutiny');
  await as(db,ids.scrutiny);const before=await version(id);await command('scope_review',id,{note:'Reviewed the current synthetic scope.'},before);expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['scope_review',id,{note:'Attempting stale metadata review'},before,crypto.randomUUID()])).toContain('Record changed');
 });
 it('keeps continuing compliance after closure and checks the selected evidence',async()=>{
  const {id,evidence,result}=await recordedApproval();const obligation=await scalar<string>(db,'select id from public.obligations where approval_id=$1',[result.approval_id]);
  expect(await failure(db,'select public.fp_fulfil($1,$2)',[obligation,'Attempting legacy evidence bypass'])).toContain('versioned compliance');
  expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['obligation_fulfil',obligation,{note:'Synthetic evidence verification',evidence_ids:[]},await version(id),crypto.randomUUID()])).toContain('every required type');
  await command('obligation_fulfil',obligation,{note:'Verified current synthetic faculty evidence.',evidence_ids:[evidence]},await version(id));
  expect(await scalar(db,'select status from public.applications where id=$1',[id])).toBe('approved');expect(await scalar(db,'select status from public.obligations where id=$1',[obligation])).toBe('fulfilled');
  expect(await scalar(db,'select count(*)::int from public.approval_records where application_id=$1',[id])).toBe(1);
 });
 it('rejects an approval without a coverage period or with intake exceeding its request',async()=>{
  const id=await decisionCase(),scope=await scalar<string>(db,'select id from public.application_scope_items where application_id=$1',[id]),doc=await scalar<string>(db,'select id from public.application_documents where application_id=$1 limit 1',[id]);
  expect(await failure(db,`select public.fp_transition($1,'approve','Synthetic authority decision',$2,$3,$4)`,[id,{evidence:doc},await version(id),crypto.randomUUID()])).toContain('Explicit approval period');
  expect(await failure(db,`select public.fp_transition($1,'approve','Synthetic authority decision',$2,$3,$4)`,[id,{evidence:doc,approval:{...approvalFixture,items:[{request_item_id:scope,approved_intake:121}]}},await version(id),crypto.randomUUID()])).toContain('Approved intake');
  expect(await scalar(db,'select count(*)::int from public.approval_records where application_id=$1',[id])).toBe(0);
  await db.exec('reset role');await db.query(`update public.application_documents set validity_mode='unknown',validity_reviewed_at=null,validity_reviewed_by=null where application_id=$1 and id<>$2`,[id,doc]);await as(db,ids.regional);
  expect(await failure(db,`select public.fp_transition($1,'approve','Synthetic authority decision',$2,$3,$4)`,[id,{evidence:doc,approval:{...approvalFixture,items:[{request_item_id:scope,approved_intake:60}]}},await version(id),crypto.randomUUID()])).toContain('every required evidence category');
 });
});
describe('document validity boundaries',()=>{
 it('requires validity review of the response itself even when another linked document remains current',async()=>{
  const {id,claims,extraDocuments}=await readyClaims(db,['Fire Safety Certificate']);
  const deficiency=await scalar<string>(db,`select public.fp_raise_deficiency($1,'Replace the synthetic fire evidence.','Provide the corrected synthetic certificate.',now()+interval '7 days',$2,$3)`,[claims.FIRE_SAFETY,await version(id),crypto.randomUUID()]);
  await db.exec('reset role');await db.query(`update public.application_documents set validity_mode='unknown',validity_reviewed_at=null,validity_reviewed_by=null where id=$1`,[extraDocuments[0]]);
  await as(db,ids.institution);await db.query(`select public.fp_resolve_deficiency($1,$2,'Synthetic corrected evidence submitted for review.',$3,$4)`,[deficiency,extraDocuments[0],await version(id),crypto.randomUUID()]);
  await as(db,ids.scrutiny);expect(await failure(db,`select public.fp_recheck_deficiency($1,'accepted','The source has not been validity reviewed',$2,$3)`,[deficiency,await version(id),crypto.randomUUID()])).toContain('validity review');
  await command('document_validity',extraDocuments[0],{validity_mode:'no_stated_expiry',expires_on:null,issue_date:null,issuer:'Synthetic issuer',document_number:'DEMO-RESPONSE',supersedes_document_id:null,note:'Reviewed current replacement validity before acceptance.'},await version(id));
  await db.query(`select public.fp_recheck_deficiency($1,'accepted','Replacement evidence and validity reviewed.',$2,$3)`,[deficiency,await version(id),crypto.randomUUID()]);expect(await scalar(db,'select status from public.application_claims where id=$1',[claims.FIRE_SAFETY])).toBe('verified');
 });
 it('distinguishes a clean unknown document from reviewed no-stated-expiry evidence',async()=>{
  const {id,claims,docs}=await readyClaims(db);await db.exec('reset role');await db.query(`update public.application_documents set validity_mode='unknown',validity_reviewed_at=null,validity_reviewed_by=null where id=$1`,[docs.Affidavit]);await as(db,ids.scrutiny);
  expect(await failure(db,`select public.fp_verify_claim($1,'verified','Synthetic verification',$2,$3)`,[claims.INSTITUTION_IDENTITY,await version(id),crypto.randomUUID()])).toContain('current clean');
  const payload={validity_mode:'no_stated_expiry',issue_date:null,expires_on:null,issuer:'Synthetic issuer',document_number:'DEMO-1',supersedes_document_id:null,note:'The synthetic specimen has no stated expiry date.'};
  await as(db,ids.institution);expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['document_validity',docs.Affidavit,payload,await version(id),crypto.randomUUID()])).toContain('Authorised validity reviewer');
  await as(db,ids.scrutiny);await command('document_validity',docs.Affidavit,payload,await version(id));await db.query(`select public.fp_verify_claim($1,'verified','Synthetic source reviewed',$2,$3)`,[claims.INSTITUTION_IDENTITY,await version(id),crypto.randomUUID()]);
  const oldBasis=await scalar(db,'select verification_basis from public.application_claims where id=$1',[claims.INSTITUTION_IDENTITY]);await command('document_validity',docs.Affidavit,{...payload,validity_mode:'unknown'},await version(id));
  expect(await scalar(db,'select verification_basis from public.application_claims where id=$1',[claims.INSTITUTION_IDENTITY])).toEqual(oldBasis);
  await db.exec('reset role');expect(await scalar(db,'select fp_private.review_basis_current($1)',[claims.INSTITUTION_IDENTITY])).toBe(false);
 });
 it('rejects quarantined metadata reviews and cross-type or cyclic supersession',async()=>{
  const {id,docs,extraDocuments}=await readyClaims(db,['Fire Safety Certificate']);const payload={validity_mode:'no_stated_expiry',expires_on:null,issue_date:null,issuer:'Synthetic issuer',document_number:'DEMO-2',supersedes_document_id:docs.Affidavit,note:'Reviewed replacement lineage for synthetic evidence.'};
  expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['document_validity',extraDocuments[0],payload,await version(id),crypto.randomUUID()])).toContain('same case, subject and type');
  await command('document_validity',extraDocuments[0],{...payload,supersedes_document_id:docs['Fire Safety Certificate']},await version(id));
  expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['document_validity',docs['Fire Safety Certificate'],{...payload,supersedes_document_id:extraDocuments[0]},await version(id),crypto.randomUUID()])).toContain('cycle');
  await db.exec('reset role');await db.query(`update public.application_documents set scan_status='pending' where id=$1`,[extraDocuments[0]]);await as(db,ids.scrutiny);expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['document_validity',extraDocuments[0],{...payload,supersedes_document_id:null},await version(id),crypto.randomUUID()])).toContain('Scan must finish');
 });
});
describe('reviewed deadline notice adoption',()=>{
 it('uses reviewed document expiry as a real trigger and requires a replacement for renewal',async()=>{
  const app=await scopedCase(),doc=await scalar<string>(db,'select id from public.application_documents where application_id=$1 and doc_type=$2',[app,'Faculty List']);
  const metadata={validity_mode:'dated',issue_date:'2026-01-01',expires_on:'2027-01-15',issuer:'Synthetic issuer',document_number:'DEMO-EXPIRY',supersedes_document_id:null,note:'Reviewed explicitly dated synthetic specimen.'};
  await command('document_validity',doc,metadata,await version(app));await command('document_validity',doc,metadata,await version(app));
  expect(await scalar(db,'select count(*)::int from public.obligations where document_id=$1',[doc])).toBe(1);
  const id=await notice(app,{deadline_kind:'obligation',obligation_kind:'document_expiry',trigger_type:'document_expiry',fixed_date:null,duration_days:0});const impact=await preview(id);expect(impact.items[0].new_due_at).toBe('2027-01-15T18:29:59.999+00:00');await adoption(id,impact);
  const obligation=impact.items[0].obligation_id;expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['obligation_fulfil',obligation,{note:'Cannot renew using the expiring specimen itself.',evidence_ids:[doc]},await version(app),crypto.randomUUID()])).toContain('reviewed replacement');
  const history=await scalar<Record<string,unknown>>(db,`select payload->'review_snapshot'->'governance' from public.application_events where application_id=$1 and action='document_validity' order by sequence desc limit 1`,[app]);expect(history).toHaveProperty('documents');expect(history).toHaveProperty('obligations');
 });
 it('calculates weekday deadlines in IST independent of the caller timezone',async()=>{
  const app=await scopedCase(),id=await notice(app,{trigger_type:'application_submitted',fixed_date:null,duration_days:3,calendar_basis:'weekdays'});const anchor=await scalar<string>(db,'select submitted_at::text from public.applications where id=$1',[app]);const impact=await preview(id);
  expect(new Date(impact.items[0].new_due_at).toISOString()).toBe(noticeDue({trigger_type:'application_submitted',fixed_date:null,duration_days:3,calendar_basis:'weekdays'},anchor));await db.exec("set local timezone='America/New_York'");expect((await preview(id)).impact_hash).toBe(impact.impact_hash);
 });
 it('previews without writes, rejects stale impact, and records one adoption on retry',async()=>{
  const app=await scopedCase(),id=await notice(app),impact=await preview(id);expect(impact.items).toHaveLength(1);expect(await scalar(db,'select count(*)::int from public.applied_deadlines')).toBe(0);
  await as(db,ids.scrutiny);await command('scope_review',app,{note:'A concurrent human scope review changed the case.'},await version(app));await as(db,ids.admin);
  expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['notice_adopt',id,{note:'Reviewed impact before the concurrent change',impact_hash:impact.impact_hash},2,crypto.randomUUID()])).toContain('Impact changed');
  const fresh=await preview(id),key=crypto.randomUUID(),body={note:'Adopt the current synthetic source impact.',impact_hash:fresh.impact_hash};const first=await command('notice_adopt',id,body,2,key);expect(await command('notice_adopt',id,body,2,key)).toEqual(first);
  expect(await scalar(db,'select count(*)::int from public.notice_adoptions')).toBe(1);expect(await scalar(db,'select count(*)::int from public.applied_deadlines')).toBe(1);
  await as(db,ids.institution);expect(await scalar(db,'select count(*)::int from public.policy_notices where id=$1',[id])).toBe(1);expect(await failure(db,'select public.fp_notice_preview($1)',[id])).toContain('Notice administrator');expect(await failure(db,`update public.policy_notices set source_version='forged'`)).toContain('permission denied');
  await as(db,ids.other);expect(await scalar(db,'select count(*)::int from public.applied_deadlines')).toBe(0);expect(await scalar(db,'select count(*)::int from public.policy_notices')).toBe(0);expect(await scalar(db,'select count(*)::int from public.approval_records')).toBe(0);
 });
 it('preserves sent history, supersedes pending generations and requires explicit parent notice',async()=>{
  const app=await scopedCase(),first=await notice(app);await adoption(first);
  await db.exec('reset role');await db.exec(`update public.deadline_reminder_intents set scheduled_for=now()-interval '1 hour'`);await as(db,ids.admin,'service_role');expect(await scalar(db,'select public.fp_process_deadline_reminders(50)')).toBe(1);expect(await scalar(db,'select public.fp_process_deadline_reminders(50)')).toBe(0);
  const conflicting=await notice(app,{source_version:'demo-conflict'});expect(await failure(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',['notice_adopt',conflicting,{note:'A conflicting synthetic source change',impact_hash:(await preview(conflicting)).impact_hash},2,crypto.randomUUID()])).toContain('Explicitly supersede');
  const next=await notice(app,{source_version:'demo-v2',supersedes_notice_id:first});await adoption(next);
  const third=await notice(app,{source_version:'demo-v3',supersedes_notice_id:next});await adoption(third);
  expect(await scalar(db,`select count(*)::int from public.deadline_reminder_intents where status='sent'`)).toBe(1);expect(await scalar(db,`select count(*)::int from public.deadline_reminder_intents where status='superseded'`)).toBe(1);expect(await scalar(db,`select count(*)::int from public.deadline_reminder_intents where status='pending'`)).toBe(1);
  await as(db,ids.admin);expect(await failure(db,'select public.fp_process_deadline_reminders(50)')).toContain('permission denied');
 });
 it('retains a failed reminder, backs off and resumes without a duplicate notification',async()=>{
  const app=await scopedCase(),id=await notice(app);await adoption(id);await db.exec('reset role');await db.exec("update public.deadline_reminder_intents set scheduled_for=now()-interval '1 hour';create function fp_private.synthetic_reminder_failure() returns trigger language plpgsql as $$begin if new.title like 'Synthetic deadline reminder%' then raise exception 'Synthetic delivery interruption';end if;return new;end$$;create trigger synthetic_reminder_failure before insert on public.notifications for each row execute function fp_private.synthetic_reminder_failure();set role service_role");
  expect(await scalar(db,'select public.fp_process_deadline_reminders(50)')).toBe(0);await db.exec('reset role');expect(await scalar(db,"select status from public.deadline_reminder_intents where status='retry_wait'")).toBe('retry_wait');expect(await scalar(db,'select max(attempts) from public.deadline_reminder_intents')).toBe(1);
  await db.exec("reset role;drop trigger synthetic_reminder_failure on public.notifications;update public.deadline_reminder_intents set next_attempt_at=now()-interval '1 minute';set role service_role");expect(await scalar(db,'select public.fp_process_deadline_reminders(50)')).toBe(1);expect(await scalar(db,'select public.fp_process_deadline_reminders(50)')).toBe(0);await db.exec('reset role');expect(await scalar(db,"select count(*)::int from public.notifications where title like 'Synthetic deadline reminder%'")).toBe(1);
 });
 it('applies continuing-obligation deadlines after application closure without changing approval facts',async()=>{
    const {id:app,result}=await recordedApproval(),id=await notice(app,{deadline_kind:'obligation',obligation_kind:'undertaking',fixed_date:'2029-06-30'});const impact=await preview(id);expect(impact.items).toHaveLength(1);expect(impact.items[0].obligation_id).toBeTruthy();await adoption(id,impact);
   expect(await scalar(db,'select status from public.applications where id=$1',[app])).toBe('approved');expect(await scalar(db,'select valid_to::text from public.approval_records where id=$1',[result.approval_id])).toBe('2029-06-30');expect(await scalar(db,'select due_date::text from public.obligations where approval_id=$1',[result.approval_id])).toBe('2029-06-30');
 });
 it('keeps an adopted application deadline across workflow stages and denies future-effective adoption',async()=>{
  const app=await ready(db);await command('scope_save',app,{academic_year_start:2026,items:[]},await version(app));await transition(db,app,'submit');const id=await notice(app);await adoption(id);const due=await scalar(db,'select sla_due_at::text from public.applications where id=$1',[app]);await as(db,ids.scrutiny);await transition(db,app,'start_scrutiny');expect(await scalar(db,'select sla_due_at::text from public.applications where id=$1',[app])).toBe(due);expect(await scalar(db,`select count(*)::int from public.applied_deadlines where status='active'`)).toBe(1);
  const future=await notice(app,{effective_date:'2099-01-01'});expect(await failure(db,'select public.fp_notice_preview($1)',[future])).toContain('effective notice');
 });
});
