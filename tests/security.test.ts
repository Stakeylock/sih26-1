import { beforeAll,afterAll,beforeEach,afterEach,describe,it,expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {database,as,ids,scalar,failure,draft,ready,readyClaims,transition,grantRole} from './database';
import {roles} from '../src/domain/model';
let db:PGlite;
beforeAll(async()=>{db=await database();},60000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('reset role; rollback');});
describe('PostgreSQL authorization and workflow security',()=>{
  it('enables RLS on every application table and hides all public definer functions',async()=>{
    expect(await scalar<number>(db,`select count(*)::int from pg_tables where schemaname='public' and not rowsecurity`)).toBe(0);
    expect(await scalar<number>(db,`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'execute')`)).toBe(0);
  });
  it('ignores self-supplied privileged metadata at signup',async()=>{
    await as(db,ids.institution);
    expect(await scalar<string>(db,`select role::text from public.user_roles where user_id=auth.uid()`)).toBe('institution');
  });
  it('blocks anonymous data reads and legacy RPC calls',async()=>{
    await as(db,ids.institution,'anon');
    expect(await failure(db,'select * from public.applications')).toContain('permission denied');
    expect(await failure(db,`select public.create_application('new_programme','Malicious request')`)).toContain('permission denied');
  });
  it('blocks role elevation and protected profile changes through direct writes',async()=>{
    await as(db,ids.institution);
    expect(await failure(db,`insert into public.user_roles(user_id,role) values(auth.uid(),'national_admin')`)).toContain('permission denied');
    expect(await failure(db,`update public.profiles set email='admin@example.test' where id=auth.uid()`)).toContain('permission denied');
    expect(await failure(db,`select public.fp_assign_role($1,'national_admin',null,null,null)`,[ids.institution])).toContain('Administrator required');
  });
  it('enforces role parity between TypeScript roles and PostgreSQL app_role enum',async()=>{
    const enumRoles = (await db.query<{role:string}>(`select unnest(enum_range(null::public.app_role))::text as role`)).rows.map(r=>r.role);
    expect(enumRoles).toEqual([...roles]);
  });
  it('forbids null or invalid regional jurisdictions',async()=>{
    expect(await failure(db,`insert into public.user_roles(user_id,role,region) values($1,'evc_coordinator',null)`,[ids.west])).toContain('role_jurisdiction');
    expect(await failure(db,`insert into public.user_roles(user_id,role,region) values($1,'evc_member',null)`,[ids.west])).toContain('role_jurisdiction');
  });
  it('enforces evc_member regional jurisdiction and blocks unauthorized workflow transitions',async()=>{
    await db.query(`insert into public.user_roles(user_id,role,region) values($1,'evc_member','South')`,[ids.other]);
    const id=await ready(db); await transition(db,id,'submit');
    await as(db,ids.other);
    expect(await scalar<number>(db,'select count(*)::int from public.applications where id=$1',[id])).toBe(1);
    expect(await failure(db,`select public.fp_transition($1,'start_scrutiny','', '{}',3,$2)`,[id,crypto.randomUUID()])).toContain('Scrutiny jurisdiction');
    expect(await failure(db,`select public.fp_transition($1,'schedule_evc','', '{"scheduled_for":"2026-11-10T10:00:00Z"}',3,$2)`,[id,crypto.randomUUID()])).toContain('EVC jurisdiction');
    expect(await failure(db,`select public.fp_transition($1,'approve','Synthetic approval','{"evidence":"test"}',3,$2)`,[id,crypto.randomUUID()])).toContain('Decision jurisdiction');
  });
  it('isolates institutions and officers across regions, including direct RPC guesses',async()=>{
    const id=await ready(db); await transition(db,id,'submit');
    await as(db,ids.other);
    expect(await scalar<number>(db,'select count(*)::int from public.applications')).toBe(0);
    expect(await scalar<number>(db,'select count(*)::int from public.application_documents')).toBe(0);
    expect(await failure(db,`select public.fp_missing($1)`,[id])).toContain('unavailable');
    await as(db,ids.west);
    expect(await scalar<number>(db,'select count(*)::int from public.applications')).toBe(0);
    expect(await failure(db,`select public.fp_transition($1,'start_scrutiny','', '{}',3,$2)`,[id,crypto.randomUUID()])).toContain('unavailable');
  });
  it('returns zero rows, not an existence hint, for another tenant\'s document and history rows by exact id',async()=>{
    const id=await ready(db);
    await as(db,ids.institution);
    const doc=await scalar<string>(db,'select id from public.application_documents where application_id=$1 limit 1',[id]);
    await as(db,ids.other);
    expect((await db.query(`select * from public.application_documents where id=$1`,[doc])).rows).toHaveLength(0);
    expect(await scalar<number>(db,'select count(*)::int from public.application_events where application_id=$1',[id])).toBe(0);
  });
  it('keeps generated workflow notifications bound to their recipient user',async()=>{
    const {id,claims}=await readyClaims(db);
    await as(db,ids.scrutiny);
    await db.query(`select public.fp_raise_deficiency($1,'The synthetic fire certificate is stale.','Upload a current synthetic certificate.',now()+interval '7 days',(select version from public.applications where id=$2),gen_random_uuid())`,[claims.FIRE_SAFETY,id]);
    await as(db,ids.institution);
    expect(await scalar<number>(db,'select count(*)::int from public.notifications where user_id=$1',[ids.institution])).toBeGreaterThanOrEqual(1);
    await as(db,ids.other);
    expect(await scalar<number>(db,'select count(*)::int from public.notifications')).toBe(0);
  });
  it('does not combine a role in one region with a different role elsewhere',async()=>{
    const id=await ready(db); await transition(db,id,'submit');
    await db.exec('reset role'); await db.query(`insert into public.user_roles(user_id,role,region) values($1,'regional_officer','South')`,[ids.west]);
    await as(db,ids.west);
    expect(await failure(db,`select public.fp_transition($1,'start_scrutiny','', '{}',3,$2)`,[id,crypto.randomUUID()])).toContain('Scrutiny jurisdiction');
  });
  it('hides drafts from officers',async()=>{
    await draft(db); await as(db,ids.admin);
    expect(await scalar<number>(db,'select count(*)::int from public.applications')).toBe(0);
  });
  it('revokes access immediately when a session or role is removed',async()=>{
    const id=await ready(db); await transition(db,id,'submit');
    await db.exec('reset role'); await db.query('delete from auth.sessions where user_id=$1',[ids.scrutiny]);
    await as(db,ids.scrutiny);
    expect(await failure(db,'select * from public.applications')).toContain('active session');
    await db.exec('reset role'); await db.query('update public.user_roles set active=false where user_id=$1',[ids.west]);
    await as(db,ids.west); expect(await scalar<number>(db,'select count(*)::int from public.applications')).toBe(0);
  });
  it('requires a confirmed, non-anonymous, non-banned user',async()=>{
    await db.query('update auth.users set banned_until=now()+interval \'1 day\' where id=$1',[ids.institution]);
    await as(db,ids.institution); expect(await failure(db,'select * from public.profiles')).toContain('active session');
  });
  it('prevents direct workflow, evidence, notification and audit writes',async()=>{
    await draft(db);
    for(const table of ['applications','application_documents','notifications','application_events']) expect(await failure(db,`delete from public.${table}`)).toContain('permission denied');
    expect(await failure(db,`update public.applications set status='approved'`)).toContain('permission denied');
  });
  it('requires actual clean storage objects and required fields for submission',async()=>{
    const id=await draft(db);
    expect(await failure(db,`select public.fp_transition($1,'submit','', '{}',1,$2)`,[id,crypto.randomUUID()])).toContain('required fields');
  });
  it('keeps audit and configuration history append-only even for service clients',async()=>{
    await draft(db); await db.exec('reset role');
    expect(await failure(db,'delete from public.application_events')).toContain('append-only');
    await db.query(`insert into public.config_audit(actor_id,action) values($1,'fixture')`,[ids.admin]);
    expect(await failure(db,'update public.config_audit set action=\'forged\'')).toContain('append-only');
    expect(await scalar<boolean>(db,`select has_table_privilege('service_role','public.application_events','truncate')`)).toBe(false);
  });
  it('locks editable fields after submission and rejects stale saves',async()=>{
    const id=await ready(db);
    expect(await failure(db,`select public.fp_save_draft($1,'Stale update','{}',1)`,[id])).toContain('Case changed');
    await transition(db,id,'submit');
    expect(await failure(db,`select public.fp_save_draft($1,'Locked update','{}',3)`,[id])).toContain('locked');
  });
  it('records exactly one transition and returns the same result on retry',async()=>{
    const id=await ready(db); const key=crypto.randomUUID(); const first=await transition(db,id,'submit','Synthetic test reason',{},key);
    const retry=await scalar(db,`select public.fp_transition($1,'submit','Synthetic test reason','{}',2,$2)`,[id,key]);
    expect(retry).toEqual(first);
    expect(await scalar<number>(db,`select count(*)::int from public.application_events where action='submit'`)).toBe(1);
    expect(await failure(db,`select public.fp_transition($1,'resubmit','Different payload','{}',2,$2)`,[id,key])).toContain('Idempotency key');
  });
  it('rejects a competing stale transition after another officer acquires the case',async()=>{
    const id=await ready(db); await transition(db,id,'submit'); await as(db,ids.scrutiny); await transition(db,id,'start_scrutiny');
    await as(db,ids.second);
    expect(await failure(db,`select public.fp_transition($1,'start_scrutiny','Concurrent request','{}',3,$2)`,[id,crypto.randomUUID()])).toContain('Case changed');
  });
  it('requires the assigned officer and every exact checklist item',async()=>{
    const id=await ready(db); await transition(db,id,'submit'); await as(db,ids.scrutiny); await transition(db,id,'start_scrutiny');
    expect(await failure(db,`select public.fp_transition($1,'pass_scrutiny','Sufficient demonstration reason','{"evc":false}',4,$2)`,[id,crypto.randomUUID()])).toContain('checklist');
    await as(db,ids.second);
    expect(await failure(db,`select public.fp_checklist($1,'Built-up area adequate',true,'test')`,[id])).toContain('Assigned scrutiny');
  });
  it('supports reasoned deficiency and resubmission with a complete audit',async()=>{
    const id=await ready(db); await transition(db,id,'submit'); await as(db,ids.scrutiny); await transition(db,id,'start_scrutiny'); await transition(db,id,'raise_deficiency','Please correct the synthetic laboratory inventory.');
    await as(db,ids.institution); expect((await transition(db,id,'resubmit','Corrected the synthetic inventory.')).status).toBe('resubmitted');
    expect(await scalar<number>(db,`select count(*)::int from public.application_events where action in ('submit','start_scrutiny','raise_deficiency','resubmit')`)).toBe(4);
  });
  it('permits a human final decision once and pins the application template',async()=>{
    const id=await ready(db); await transition(db,id,'submit'); await as(db,ids.scrutiny); await transition(db,id,'start_scrutiny');
    const items=await scalar<string[]>(db,`select array(select jsonb_array_elements_text(template_snapshot->'checklist')) from public.applications where id=$1`,[id]);
    for(const item of items) await db.query(`select public.fp_checklist($1,$2,true,'Verified synthetic evidence')`,[id,item]);
    await transition(db,id,'pass_scrutiny','No visit needed for this synthetic test.',{evc:false});
    await as(db,ids.evc);
    expect(await failure(db,`select public.fp_transition($1,'approve','Attempting wrong role','{}',9,$2)`,[id,crypto.randomUUID()])).toContain('Decision jurisdiction');
    await as(db,ids.regional);
    const doc=await scalar<string>(db,'select id from public.application_documents where application_id=$1 limit 1',[id]);
    expect((await transition(db,id,'approve','Synthetic evidence reviewed; demo decision only.',{evidence:doc})).status).toBe('approved');
    expect(await scalar<number>(db,`select count(*)::int from public.approval_records where application_id='${id}'`)).toBe(1);
    expect(await scalar<number>(db,`select count(*)::int from public.obligations where application_id='${id}' and kind='renewal'`)).toBe(0);
    expect(await failure(db,`select public.fp_transition($1,'approve','Repeated decision','{}',10,$2)`,[id,crypto.randomUUID()])).toContain('Pending decision');
    expect(await scalar<number>(db,`select template_version from public.applications where id=$1`,[id])).toBe(1);
  });
});
describe('Access expiry, revocation and the read-only agent registry',()=>{
  it('rejects grants from non-admins and grants without reason or officer expiry',async()=>{
    await as(db,ids.institution);
    expect(await failure(db,`select public.fp_assign_role($1,'institution',null,null,'Synthetic grant reason text')`,[ids.other])).toContain('Administrator required');
    await as(db,ids.admin);
    expect(await failure(db,`select public.fp_assign_role($1,'institution',null,null,'Too short')`,[ids.other])).toContain('grant reason');
    expect(await failure(db,`select public.fp_assign_role($1,'evc_coordinator','South',null,'Synthetic grant reason text')`,[ids.other])).toContain('expiry');
    expect(await failure(db,`select public.fp_assign_role($1,'regional_officer','South',now()-interval '1 hour','Synthetic grant reason text')`,[ids.other])).toContain('expiry');
  });
  it('expires grants at the assigned time and removes subsequent access',async()=>{
    await grantRole(db,ids.other,'regional_officer','South',{expiresAt:new Date(Date.now()+60000).toISOString(),reason:'Synthetic regional grant fixture'});
    await as(db,ids.other);
    expect(await scalar<boolean>(db,`select public.has_role($1,'regional_officer')`,[ids.other])).toBe(true);
    await db.exec('reset role');
    await db.query(`update public.user_roles set expires_at=now()-interval '1 minute' where user_id=$1 and role='regional_officer'`,[ids.other]);
    await as(db,ids.other);
    expect(await scalar<boolean>(db,`select public.has_role($1,'regional_officer')`,[ids.other])).toBe(false);
    expect(await scalar<boolean>(db,`select fp_private.has_role('regional_officer','South')`)).toBe(false);
  });
  it('revokes grants immediately and writes the config audit trail',async()=>{
    await grantRole(db,ids.other,'evc_coordinator','South',{expiresAt:'2036-01-01T00:00:00Z',reason:'Synthetic coordinator grant fixture'});
    await as(db,ids.other);
    expect(await scalar<boolean>(db,`select public.has_role($1,'evc_coordinator')`,[ids.other])).toBe(true);
    await as(db,ids.admin);
    await db.query(`select public.fp_revoke_role($1,'evc_coordinator','Synthetic revocation reason text')`,[ids.other]);
    await as(db,ids.other);
    expect(await scalar<boolean>(db,`select public.has_role($1,'evc_coordinator')`,[ids.other])).toBe(false);
    expect(await failure(db,`select public.fp_revoke_role($1,'evc_coordinator','Synthetic revocation reason text')`,[ids.other])).toContain('Administrator required');
    await as(db,ids.admin);
    expect(await scalar<number>(db,`select count(*)::int from public.config_audit where action='assign_role' and target_user=$1 and role='evc_coordinator' and reason='Synthetic coordinator grant fixture'`,[ids.other])).toBe(1);
    expect(await scalar<number>(db,`select count(*)::int from public.config_audit where action='revoke_role' and target_user=$1 and actor_id=$2 and reason='Synthetic revocation reason text'`,[ids.other,ids.admin])).toBe(1);
  });
  it('keeps the agent registry read-only and incapable of approval',async()=>{
    await as(db,ids.institution);
    expect(await scalar<number>(db,'select count(*)::int from public.fp_agent_registry()')).toBe(0);
    expect(await failure(db,`insert into public.agent_registry(name,purpose) values('Advisory bot','Synthetic advisory agent')`)).toContain('permission denied');
    expect(await failure(db,`update public.agent_registry set enabled=false`)).toContain('permission denied');
    expect(await failure(db,`delete from public.agent_registry`)).toContain('permission denied');
    await db.exec('set role service_role');
    expect(await failure(db,`insert into public.agent_registry(name,purpose,can_approve) values('Advisory bot','Synthetic advisory agent',true)`)).toContain('agent_registry_can_approve_check');
    await as(db,ids.institution);
    expect(await scalar<string>(db,`select string_agg(p.proname||'-'||p.prosecdef::text,',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%agent%'`)).toBe('fp_agent_registry-false');
    expect(await scalar<number>(db,`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='fp_private' and (p.prosrc ilike '%insert into public.agent_registry%' or p.prosrc ilike '%update public.agent_registry%')`)).toBe(0);
  });
});
describe('Private storage authorization',()=>{
  it('uses a private bucket and denies arbitrary paths',async()=>{
    expect(await scalar<boolean>(db,`select public from storage.buckets where id='application-docs'`)).toBe(false);
    await as(db,ids.institution);
    expect(await failure(db,`insert into storage.objects(bucket_id,name) values('application-docs',$1)`,[ids.institution+'/forged.pdf'])).toContain('row-level security');
  });
  it('quarantines uploads and denies client scan forgery',async()=>{
    const app=await draft(db); const doc=await scalar<string>(db,`select public.fp_reserve_document($1,'Building Plan','demo.pdf','application/pdf',100)`,[app]);
    const path=await scalar<string>(db,'select file_path from public.application_documents where id=$1',[doc]);
    await db.query(`insert into storage.objects(bucket_id,name,metadata) values('application-docs',$1,'{"size":100,"mimetype":"application/pdf"}')`,[path]);
    expect(await scalar<number>(db,'select count(*)::int from storage.objects')).toBe(0);
    expect(await failure(db,`select public.fp_complete_document($1,$2,true,'fake-scanner')`,[doc,'a'.repeat(64)])).toContain('permission denied');
    expect(await scalar<number>(db,`with deleted as (delete from storage.objects returning id) select count(*)::int from deleted`)).toBe(0);
  });
  it('rejects oversize, active content types and invalid names before reserving',async()=>{
    const app=await draft(db);
    for(const [mime,size,name] of [['text/html',100,'demo.html'],['application/pdf',10485761,'demo.pdf'],['application/pdf',100,'../demo.pdf']]) expect(await failure(db,`select public.fp_reserve_document($1,'Building Plan',$2,$3,$4)`,[app,name,mime,size])).toContain('Invalid document');
  });
  it('exposes clean bytes only to authorized case readers and prevents replacement',async()=>{
    await ready(db); expect(await scalar<number>(db,'select count(*)::int from storage.objects')).toBe(3);
    expect(await scalar<number>(db,`with changed as (update storage.objects set metadata='{}' returning id) select count(*)::int from changed`)).toBe(0);
    await as(db,ids.other); expect(await scalar<number>(db,'select count(*)::int from storage.objects')).toBe(0);
    await as(db,ids.west); expect(await scalar<number>(db,'select count(*)::int from storage.objects')).toBe(0);
  });
});
