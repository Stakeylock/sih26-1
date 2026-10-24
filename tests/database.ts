import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
export const ids = {
  institution: '10000000-0000-4000-8000-000000000001', other: '10000000-0000-4000-8000-000000000002',
  scrutiny: '10000000-0000-4000-8000-000000000003', west: '10000000-0000-4000-8000-000000000004',
  evc: '10000000-0000-4000-8000-000000000005', regional: '10000000-0000-4000-8000-000000000006',
  admin: '10000000-0000-4000-8000-000000000007', second: '10000000-0000-4000-8000-000000000008',
};
export async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,metadata jsonb default '{}');
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated; grant all on storage.objects,storage.buckets to service_role;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
  `);
  await db.exec(readFileSync('supabase/reference/lovable-baseline.sql','utf8'));
  for (const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
  for (const [name,id] of Object.entries(ids)) {
    await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"role":"national_admin"}');`,[id,`${name}@flowpilot.example.test`]);
    await db.query(`insert into auth.sessions(id,user_id) values($1,$1)`,[id]);
  }
  await db.exec(`delete from public.user_roles where user_id not in ('${ids.institution}','${ids.other}');
    insert into public.user_roles(user_id,role,region) values
    ('${ids.scrutiny}','scrutiny_officer','South'),('${ids.second}','scrutiny_officer','South'),('${ids.west}','scrutiny_officer','West'),
    ('${ids.evc}','evc_coordinator','South'),('${ids.regional}','regional_officer','South'),('${ids.admin}','national_admin',null);`);
  return db;
}
export async function as(db: PGlite, id: string, role='authenticated') {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,session_id:id,is_anonymous:false})]);
  await db.exec(`set role ${role}`);
}
export async function scalar<T>(db: PGlite,sql: string,args: unknown[]=[]): Promise<T> {
  const result=await db.query<Record<string,T>>(sql,args); return Object.values(result.rows[0])[0];
}
export async function failure(db:PGlite,sql:string,args:unknown[]=[]) {
  await db.exec('savepoint expected_failure');
  let error: unknown;
  try { await db.query(sql,args); } catch(e) { error=e; }
  await db.exec('rollback to savepoint expected_failure');
  if (!error) throw new Error('Expected the database to reject this operation');
  return String(error);
}
export async function draft(db:PGlite,type='new_programme') {
  await as(db,ids.institution);
  await db.query(`select public.fp_create_institution('Demo Cedar Technical Institute','DEMO-CEDAR','South','Telangana')`);
  return scalar<string>(db,`select public.fp_create_application($1,'Demo new programme request')`,[type]);
}
export async function ready(db:PGlite) {
  const id=await draft(db);
  await db.query(`select public.fp_save_draft($1,'Demo new programme request',$2,1)`,[id,{programme_name:'Demo computing',level:'Undergraduate',intake:'60',lab_details:'Synthetic lab inventory for testing'}]);
  for (const type of ['Building Plan','Faculty List','Lab Equipment Inventory']) {
    const doc=await scalar<string>(db,`select public.fp_reserve_document($1,$2,'demo.pdf','application/pdf',100)`,[id,type]);
    await db.exec('reset role');
    await db.query(`insert into storage.objects(bucket_id,name,metadata) select 'application-docs',file_path,'{"size":100,"mimetype":"application/pdf"}' from public.application_documents where id=$1`,[doc]);
    await db.exec('set role service_role');
    await db.query(`select public.fp_complete_document($1,$2,true,'test-fixture-scanner')`,[doc,'a'.repeat(64)]);
    await fixtureValidity(db,doc);
    await as(db,ids.institution);
  }
  return id;
}
export async function upload(db:PGlite,id:string,type:string,hash='b'.repeat(64),expiresOn?:string) {
  await as(db,ids.institution);
  const doc=await scalar<string>(db,`select public.fp_reserve_document($1,$2,'demo.pdf','application/pdf',100)`,[id,type]);
  await db.exec('reset role');
  await db.query(`insert into storage.objects(bucket_id,name,metadata) select 'application-docs',file_path,'{"size":100,"mimetype":"application/pdf"}' from public.application_documents where id=$1`,[doc]);
  await db.exec('set role service_role');
  await db.query(`select public.fp_complete_document($1,$2,true,'test-fixture-scanner')`,[doc,hash]);
  await fixtureValidity(db,doc,expiresOn);
  await as(db,ids.institution);
  return doc;
}
export async function readyClaims(db:PGlite,extraTypes:string[]=[]) {
  const id=await draft(db,'extension_self_disclosure');
  await db.query(`select public.fp_save_draft($1,'Self-disclosure extension 2026-27',$2,1)`,[id,{academic_year:'2026-27',intake:'120',faculty_count:'40',declaration:'Synthetic declaration for testing'}]);
  const docs:Record<string,string>={};
  const types=['Affidavit','Faculty List','Land Document','Building Plan','Fire Safety Certificate','Undertaking'];
  for(const [i,type] of types.entries()) docs[type]=await upload(db,id,type,String(i+1).padStart(2,'0').repeat(32));
  const extraDocuments:string[]=[];
  for(const type of extraTypes)extraDocuments.push(await upload(db,id,type,'ea'.repeat(32)));
  const claims:Record<string,string>={};
  for(const code of ['INSTITUTION_IDENTITY','ACADEMIC_YEAR','SANCTIONED_INTAKE','FACULTY_STRENGTH','STUDENT_FACULTY_RATIO','LAND_OWNERSHIP','BUILT_UP_AREA','FIRE_SAFETY','UNDERTAKING']) claims[code]=await scalar<string>(db,`select c.id from public.application_claims c join public.requirements r on r.id=c.requirement_id where c.application_id=$1 and r.code=$2`,[id,code]);
  const links=[['INSTITUTION_IDENTITY','Affidavit'],['ACADEMIC_YEAR','Affidavit'],['SANCTIONED_INTAKE','Affidavit'],['FACULTY_STRENGTH','Faculty List'],['STUDENT_FACULTY_RATIO','Faculty List'],['LAND_OWNERSHIP','Land Document'],['BUILT_UP_AREA','Building Plan'],['FIRE_SAFETY','Fire Safety Certificate'],['UNDERTAKING','Undertaking']];
  for(const [code,type] of links) await db.query('select public.fp_link_claim_evidence($1,$2,null,(select version from public.applications where id=(select application_id from public.application_claims where id=$1)),gen_random_uuid())',[claims[code],docs[type]]);
  await transition(db,id,'submit');
  await as(db,ids.scrutiny);
  await transition(db,id,'start_scrutiny');
  return {id,docs,claims,extraDocuments};
}
export async function grantRole(db:PGlite,userId:string,role:string,region:string|null,opts:{expiresAt?:string|null;reason?:string}={}) {
  await as(db,ids.admin);
  await db.query(`select public.fp_assign_role($1,$2,$3,$4,$5)`,[userId,role,region,opts.expiresAt??null,opts.reason??'Synthetic grant reason fixture']);
}
export async function transition(db:PGlite,id:string,action:string,reason='Synthetic test reason',payload:Record<string,unknown>={},requestId=crypto.randomUUID()) {
  if(action==='approve'&&!payload.approval)payload={...payload,approval:approvalFixture};
  const version=await scalar<number>(db,`select version from public.applications where id=$1`,[id]);
  return scalar<{id:string;status:string;version:number}>(db,`select public.fp_transition($1,$2,$3,$4,$5,$6)`,[id,action,reason,payload,version,requestId]);
}

// Synthetic recorded validity metadata for baseline regression fixtures only.
async function fixtureValidity(db:PGlite,doc:string,expiresOn?:string){
  await db.exec('reset role');
  await db.query(`update public.application_documents set validity_mode=$2,expires_on=$3,validity_reviewed_by=$4,validity_reviewed_at=now(),validity_review_note='Synthetic fixture metadata review' where id=$1`,[doc,expiresOn?'dated':'no_stated_expiry',expiresOn??null,ids.scrutiny]);
}
export const approvalFixture={approval_type:'Synthetic test approval',academic_year_start:2026,academic_year_end:2026,valid_from:'2026-07-01',valid_to:'2027-06-30',items:[],conditions:[]};
