import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {approvalFixture,as,database,failure,ids,ready,scalar,transition} from './database';

let db:PGlite;
beforeAll(async()=>{db=await database();},60000);afterAll(async()=>db?.close());
beforeEach(async()=>db.exec('begin'));afterEach(async()=>db.exec('reset role;rollback'));

const version=(id:string)=>scalar<number>(db,'select version from public.applications where id=$1',[id]);
const command=(kind:string,id:string|null,payload:Record<string,unknown>,expected:number|null,request=crypto.randomUUID())=>
  scalar<Record<string,unknown>>(db,'select public.fp_governance_command($1,$2,$3,$4,$5)',[kind,id,payload,expected,request]);
const request={course_key:'UG-CSE',programme:'Engineering',course_name:'Synthetic computing',level:'Undergraduate',requested_intake:120,previous_scope_item_id:null};

// Approved new_programme case with an expired, clean, validity-reviewed Faculty List.
async function renewalCase() {
  const id=await ready(db);
  await command('scope_save',id,{academic_year_start:2026,items:[request]},await version(id));
  await transition(db,id,'submit');
  await as(db,ids.scrutiny);
  await transition(db,id,'start_scrutiny');
  await command('scope_review',id,{note:'Reviewed the synthetic course scope for renewal tests.'},await version(id));
  const checks=await scalar<string[]>(db,`select array(select jsonb_array_elements_text(template_snapshot->'checklist')) from public.applications where id=$1`,[id]);
  for(const check of checks)await db.query(`select public.fp_checklist($1,$2,true,'Synthetic checklist item reviewed.')`,[id,check]);
  await transition(db,id,'pass_scrutiny','Synthetic scrutiny passed.',{evc:false});
  const doc=await scalar<string>(db,'select id from public.application_documents where application_id=$1 and doc_type=$2',[id,'Faculty List']);
  await as(db,ids.regional);
  const scopeItem=await scalar<string>(db,'select id from public.application_scope_items where application_id=$1 limit 1',[id]);
  const payload={evidence:doc,approval:{...approvalFixture,academic_year_start:2026,academic_year_end:2028,valid_from:'2026-07-01',valid_to:'2029-06-30',items:scopeItem?[{request_item_id:scopeItem,approved_intake:60}]:[],conditions:[]}};
  await transition(db,id,'approve','Synthetic approval for renewal tests.',payload);
  await db.exec('set role service_role');
  await db.query(`update public.application_documents set validity_mode='dated',expires_on='2020-01-01',validity_reviewed_by=$1,validity_reviewed_at=now(),validity_review_note='Synthetic expiry review for renewal tests.' where id=$2`,[ids.scrutiny,doc]);
  await db.exec('reset role');
  return {id,doc};
}

const submit=(expired:string,document:string|null,version:number|null,note='Synthetic renewal replacement note for testing.',request=crypto.randomUUID())=>
  scalar<Record<string,unknown>>(db,'select public.fp_renewal_submit($1,$2,$3,$4,$5)',[expired,document,note,version,request]);

const canUpload=(app:string,kind:string)=>scalar<boolean>(db,'select fp_private.can_upload_document($1,$2)',[app,kind]);

describe('fp_renewal_submit',()=>{
  it('records a submitted renewal and a superseding replacement for the owner of an approved case',async()=>{
    const {id,doc}=await renewalCase();
    const before=await version(id);
    await as(db,ids.institution);
    const replacement=await scalar<string>(db,`select public.fp_reserve_document($1,$2,'renewal.pdf','application/pdf',100)`,[id,'Faculty List']);
    await db.exec('reset role');
    await db.query(`insert into storage.objects(bucket_id,name,metadata) select 'application-docs',file_path,'{"size":100,"mimetype":"application/pdf"}' from public.application_documents where id=$1`,[replacement]);
    await db.exec('set role service_role');
    await db.query(`select public.fp_complete_document($1,$2,true,'test-fixture-scanner')`,[replacement,'c'.repeat(64)]);
    await db.query(`update public.application_documents set validity_mode='no_stated_expiry',validity_reviewed_by=$1,validity_reviewed_at=now(),validity_review_note='Synthetic replacement review.' where id=$2`,[ids.scrutiny,replacement]);
    await as(db,ids.institution);
    const result=await submit(doc,replacement,before);
    expect(result.obligation_id).toBeTruthy();
    expect(result.document_id).toBe(replacement);
    expect(result.version).toBe(before+1);
    expect(await scalar(db,'select status from public.applications where id=$1',[id])).toBe('approved');
    expect(await scalar(db,'select status from public.obligations where id=$1',[result.obligation_id])).toBe('submitted');
    expect(await scalar(db,'select supersedes_document_id from public.application_documents where id=$1',[replacement])).toBe(doc);
    expect(await scalar(db,'select status from public.applications where id=$1',[id])).toBe('approved');
    expect(await scalar(db,`select count(*)::int from public.application_events where application_id=$1 and action='renewal_submitted'`,[id])).toBe(1);
    expect(await scalar(db,`select (payload->>'obligation_id')::text from public.application_events where application_id=$1 and action='renewal_submitted' order by sequence desc limit 1`,[id])).toBe(result.obligation_id);
  });

  it('refuses a second submission while the first renewal is submitted',async()=>{
    const {id,doc}=await renewalCase();
    await as(db,ids.institution);
    const replacement=await scalar<string>(db,`select public.fp_reserve_document($1,$2,'renewal.pdf','application/pdf',100)`,[id,'Faculty List']);
    await db.exec('reset role');
    await db.query(`insert into storage.objects(bucket_id,name,metadata) select 'application-docs',file_path,'{"size":100,"mimetype":"application/pdf"}' from public.application_documents where id=$1`,[replacement]);
    await db.exec('set role service_role');
    await db.query(`select public.fp_complete_document($1,$2,true,'test-fixture-scanner')`,[replacement,'d'.repeat(64)]);
    await db.query(`update public.application_documents set validity_mode='no_stated_expiry',validity_reviewed_by=$1,validity_reviewed_at=now(),validity_review_note='Synthetic replacement review.' where id=$2`,[ids.scrutiny,replacement]);
    await as(db,ids.institution);
    const before=await version(id);
    await submit(doc,replacement,before);
    const err=await failure(db,'select public.fp_renewal_submit($1,$2,$3,$4,$5)',[doc,replacement,'Synthetic second renewal note.',await version(id),crypto.randomUUID()]);
    expect(err).toContain('already been submitted');
  });

  it('refuses a non-owner submission',async()=>{
    const {id,doc}=await renewalCase();
    await as(db,ids.admin);
    const err=await failure(db,'select public.fp_renewal_submit($1,$2,$3,$4,$5)',[doc,doc,'Synthetic renewal note from another actor.',await version(id),crypto.randomUUID()]);
    expect(err).toContain('owning institution');
  });

  it('refuses a submission on a non-approved case',async()=>{
    const id=await ready(db);
    const doc=await scalar<string>(db,'select id from public.application_documents where application_id=$1 and doc_type=$2 limit 1',[id,'Faculty List']);
    await as(db,ids.institution);
    const err=await failure(db,'select public.fp_renewal_submit($1,$2,$3,$4,$5)',[doc,doc,'Synthetic renewal note for another case.',await version(id),crypto.randomUUID()]);
    expect(err).toContain('approved case');
  });

  it('refuses an unscanned, wrong-type, or self-referencing replacement',async()=>{
    const {id,doc}=await renewalCase();
    await as(db,ids.institution);
    const bad=await scalar<string>(db,`select public.fp_reserve_document($1,$2,'bad.pdf','application/pdf',100)`,[id,'Faculty List']);
    await db.exec('reset role');
    await db.query(`insert into storage.objects(bucket_id,name,metadata) select 'application-docs',file_path,'{"size":100,"mimetype":"application/pdf"}' from public.application_documents where id=$1`,[bad]);
    await db.exec('set role service_role');
    await db.query(`select public.fp_complete_document($1,$2,false,'test-fixture-scanner')`,[bad,'e'.repeat(64)]);
    await as(db,ids.institution);
    const badErr=await failure(db,'select public.fp_renewal_submit($1,$2,$3,$4,$5)',[doc,bad,'Synthetic renewal replacement note for testing.',await version(id),crypto.randomUUID()]);
    expect(badErr).toContain('clean');
    const wrong=await scalar<string>(db,'select id from public.application_documents where application_id=$1 and doc_type=$2 limit 1',[id,'Building Plan']);
    const wrongErr=await failure(db,'select public.fp_renewal_submit($1,$2,$3,$4,$5)',[doc,wrong,'Synthetic renewal replacement note for testing.',await version(id),crypto.randomUUID()]);
    expect(wrongErr).toContain('same document type');
    const selfErr=await failure(db,'select public.fp_renewal_submit($1,$2,$3,$4,$5)',[doc,doc,'Synthetic renewal replacement note for testing.',await version(id),crypto.randomUUID()]);
    expect(selfErr).toContain('differ from the expired document');
  });
});

describe('can_upload_document renewal branch',()=>{
  it('allows a renewal upload for an approved case with an expired required document and refuses unrelated uploads',async()=>{
    const {id,doc}=await renewalCase();
    await as(db,ids.institution);
    expect(await canUpload(id,'Faculty List')).toBe(true);
    expect(await canUpload(id,'Land Document')).toBe(false);
    await as(db,ids.other);
    expect(await canUpload(id,'Faculty List')).toBe(false);
  });
});
