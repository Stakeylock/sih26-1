import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {as,database,ids,scalar,readyClaims,transition,failure,upload} from './database';
let db:PGlite;
beforeAll(async()=>{db=await database();},60000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('rollback');await db.exec('reset role');});
describe('review regressions: authorization and case binding',()=>{
  it('redacts cross-tenant duplicate references in both passport and signals',async()=>{
    const {id:privateCase}=await readyClaims(db);
    await as(db,ids.other);await db.query(`select public.fp_create_institution('Other synthetic institute','DEMO-OTHER','West','Synthetic state')`);
    const app=await scalar<string>(db,`select public.fp_create_application('extension_self_disclosure','Other institution request')`);
    const doc=await scalar<string>(db,`select public.fp_reserve_document($1,'Affidavit','demo.pdf','application/pdf',100)`,[app]);
    await db.exec('reset role');await db.query(`insert into storage.objects(bucket_id,name,metadata) select 'application-docs',file_path,'{"size":100,"mimetype":"application/pdf"}' from public.application_documents where id=$1`,[doc]);
    await db.exec('set role service_role');await db.query(`select public.fp_complete_document($1,$2,true,'fixture-scanner')`,[doc,'01'.repeat(32)]);
    await as(db,ids.other);
    expect(await scalar<number>(db,`select count(*)::int from public.applications where id=$1`,[privateCase])).toBe(0);
    const passport=await scalar<{duplicates:unknown[]}>(db,`select public.fp_document_passport($1)`,[doc]);
    expect(passport.duplicates).toEqual([]);expect(JSON.stringify(passport)).not.toContain(privateCase);
    const signals=await db.query(`select detail from public.integrity_signals where document_id=$1`,[doc]);
    expect(signals.rows).toHaveLength(1);expect(JSON.stringify(signals.rows)).not.toContain(privateCase);expect(JSON.stringify(signals.rows)).not.toContain('matched_document_id');
  });
  it('rejects a transition containing a claim from another assigned case',async()=>{
    const {id}=await readyClaims(db);await as(db,ids.institution);
    const second=await scalar<string>(db,`select public.fp_create_application('extension_self_disclosure','Second case for binding test')`);
    await db.exec('reset role');await db.query(`update public.applications set status='under_scrutiny',assigned_officer=$2 where id=$1`,[second,ids.scrutiny]);
    const claim=await scalar<string>(db,`select id from public.application_claims where application_id=$1 limit 1`,[second]);
    await as(db,ids.scrutiny);const version=await scalar<number>(db,`select version from public.applications where id=$1`,[id]);
    expect(await failure(db,`select public.fp_transition($1,'raise_deficiency','Please replace the synthetic document.',$2,$3,$4)`,[id,{claim_id:claim,remedy:'Provide a replacement document.'},version,crypto.randomUUID()])).toContain('does not belong');
    expect(await scalar<number>(db,`select count(*)::int from public.deficiencies`)).toBe(0);
  });
  it('allows only the affected evidence upload while a claim deficiency is open',async()=>{
    const {id,claims}=await readyClaims(db);
    await db.query(`select public.fp_raise_deficiency($1,'The certificate needs replacement.','Upload a corrected synthetic fire certificate.',now()+interval '7 days',(select version from public.applications where id=(select application_id from public.application_claims where id=$1)),gen_random_uuid())`,[claims.FIRE_SAFETY]);
    await as(db,ids.institution);
    expect(await scalar<string>(db,`select status::text from public.applications where id=$1`,[id])).toBe('under_scrutiny');
    const doc=await scalar<string>(db,`select public.fp_reserve_document($1,'Fire Safety Certificate','replacement.pdf','application/pdf',100)`,[id]);
    const path=await scalar<string>(db,`select file_path from public.application_documents where id=$1`,[doc]);
    await db.query(`insert into storage.objects(bucket_id,name,metadata) values('application-docs',$1,'{"size":100,"mimetype":"application/pdf"}')`,[path]);
    expect(await failure(db,`select public.fp_reserve_document($1,'Faculty List','unrelated.pdf','application/pdf',100)`,[id])).toContain('locked');
    expect(await failure(db,`select public.fp_save_draft($1,'Unauthorized form change','{}',2)`,[id])).toContain('locked');
    await db.exec('set role service_role');await db.query(`select public.fp_complete_document($1,$2,true,'fixture-scanner')`,[doc,'ff'.repeat(32)]);
    await as(db,ids.institution);const deficiency=await scalar<string>(db,`select id from public.deficiencies where claim_id=$1`,[claims.FIRE_SAFETY]);
    await db.query(`select public.fp_resolve_deficiency($1,$2,'The corrected certificate is now attached.',(select version from public.applications where id=(select application_id from public.deficiencies where id=$1)),gen_random_uuid())`,[deficiency,doc]);
    await as(db,ids.scrutiny);await db.query(`select public.fp_governance_command('document_validity',$1,$2,(select version from public.applications where id=$3),gen_random_uuid())`,[doc,{validity_mode:'no_stated_expiry',issue_date:null,expires_on:null,issuer:'Synthetic fixture issuer',document_number:'DEMO-REPLACEMENT',supersedes_document_id:null,note:'Reviewed the current synthetic replacement validity.'},id]);await db.query(`select public.fp_recheck_deficiency($1,'accepted','The replacement document has been checked.',(select version from public.applications where id=(select application_id from public.deficiencies where id=$1)),gen_random_uuid())`,[deficiency]);
    expect(await scalar<string>(db,`select status::text from public.application_claims where id=$1`,[claims.FIRE_SAFETY])).toBe('verified');
  });
});
describe('review regressions: evidence and deterministic rules',()=>{
  it('rejects the wrong document category on link and resolution',async()=>{
    const {claims,docs}=await readyClaims(db);
    expect(await failure(db,`select public.fp_link_claim_evidence($1,$2,'Wrong category',(select version from public.applications where id=(select application_id from public.application_claims where id=$1)),gen_random_uuid())`,[claims.FIRE_SAFETY,docs['Faculty List']])).toContain('Evidence type');
    const deficiency=await scalar<string>(db,`select public.fp_raise_deficiency($1,'Replace the synthetic fire certificate.','Provide a current fire certificate.',now()+interval '7 days',(select version from public.applications where id=(select application_id from public.application_claims where id=$1)),gen_random_uuid())`,[claims.FIRE_SAFETY]);
    await as(db,ids.institution);expect(await failure(db,`select public.fp_resolve_deficiency($1,$2,'Wrong replacement category provided.',(select version from public.applications where id=(select application_id from public.deficiencies where id=$1)),gen_random_uuid())`,[deficiency,docs['Faculty List']])).toContain('Evidence type');
  });
  it('rejects a pre-existing wrong-category evidence link during verification',async()=>{
    const {claims,docs}=await readyClaims(db);await db.exec('reset role');
    await db.query(`delete from public.claim_evidence where claim_id=$1`,[claims.FIRE_SAFETY]);
    await db.query(`insert into public.claim_evidence(claim_id,document_id,linked_by) values($1,$2,$3)`,[claims.FIRE_SAFETY,docs['Faculty List'],ids.institution]);
    await as(db,ids.scrutiny);expect(await failure(db,`select public.fp_verify_claim($1,'verified','Incorrect evidence must not pass.',(select version from public.applications where id=(select application_id from public.application_claims where id=$1)),gen_random_uuid())`,[claims.FIRE_SAFETY])).toContain('required type');
  });
  it.each(['0','-1','not a number'])('rejects invalid faculty count %s',async(value)=>{
    const {id,claims}=await readyClaims(db);await db.exec('reset role');await db.query(`update public.applications set form_data=form_data||jsonb_build_object('faculty_count',$2::text) where id=$1`,[id,value]);
    await as(db,ids.scrutiny);expect(await failure(db,`select public.fp_verify_claim($1,'verified','Invalid ratio inputs cannot pass.',(select version from public.applications where id=(select application_id from public.application_claims where id=$1)),gen_random_uuid())`,[claims.STUDENT_FACULTY_RATIO])).toContain('Demo system rule failed');
  });
  it('rejects an excessive demo ratio and records valid evaluated inputs',async()=>{
    const {id,claims}=await readyClaims(db);
    await db.query(`select public.fp_verify_claim($1,'verified','Evaluate the configured demo ratio rule.',(select version from public.applications where id=(select application_id from public.application_claims where id=$1)),gen_random_uuid())`,[claims.STUDENT_FACULTY_RATIO]);
    expect(await scalar<{passed:boolean;ratio:number}>(db,`select system_result from public.application_claims where id=$1`,[claims.STUDENT_FACULTY_RATIO])).toMatchObject({passed:true,ratio:3});
    await db.exec('reset role');await db.query(`update public.applications set form_data=form_data||'{"intake":"5000","faculty_count":"1"}'::jsonb where id=$1`,[id]);
    await as(db,ids.scrutiny);expect(await scalar<string>(db,`select status::text from public.application_claims where id=$1`,[claims.STUDENT_FACULTY_RATIO])).toBe('unverified');
    expect(await failure(db,`select public.fp_verify_claim($1,'verified','Excessive ratio must fail the demo rule.',(select version from public.applications where id=(select application_id from public.application_claims where id=$1)),gen_random_uuid())`,[claims.STUDENT_FACULTY_RATIO])).toContain('Demo system rule failed');
  });
});
describe('review regressions: administration and helper permissions',()=>{
  it('protects the last administrator and permits revocation after a second grant',async()=>{
    await as(db,ids.admin);expect(await failure(db,`select public.fp_revoke_role($1,'national_admin','Do not remove the only administrator.')`,[ids.admin])).toContain('last effective administrator');
    await db.query(`select public.fp_assign_role($1,'national_admin',null,now()+interval '7 days','Add another synthetic administrator.')`,[ids.other]);
    await db.query(`select public.fp_revoke_role($1,'national_admin','Another effective administrator is present.')`,[ids.admin]);
    await as(db,ids.other);expect(await scalar<boolean>(db,`select public.has_role($1,'national_admin')`,[ids.other])).toBe(true);
  });
  it('does not expose unchecked private helpers to authenticated callers',async()=>{
    expect(await scalar<number>(db,`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='fp_private' and p.proname like '%unchecked' and has_function_privilege('authenticated',p.oid,'execute')`)).toBe(0);
  });
});
