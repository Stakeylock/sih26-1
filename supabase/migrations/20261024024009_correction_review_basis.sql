begin;

-- Synthetic review rules only. Published history is never rewritten.
alter table public.requirements add column input_fields text[] not null default '{}';
update public.requirements set input_fields=case code
  when 'ACADEMIC_YEAR' then array['academic_year'] when 'SANCTIONED_INTAKE' then array['intake']
  when 'FACULTY_STRENGTH' then array['faculty_count'] when 'STUDENT_FACULTY_RATIO' then array['intake','faculty_count']
  when 'UNDERTAKING' then array['declaration'] else '{}'::text[] end;
alter table public.application_claims
  add column input_fields_snapshot text[] not null default '{}',
  add column requirement_version_snapshot int not null default 1,
  add column is_mandatory_snapshot boolean not null default true,
  add column verification_basis jsonb;
update public.application_claims c set input_fields_snapshot=r.input_fields,
  requirement_version_snapshot=r.version,is_mandatory_snapshot=r.is_mandatory
from public.requirements r where r.id=c.requirement_id;
alter table public.deficiencies add column response_revision int not null default 0;

create or replace function fp_private.seed_claims(_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.applications; pack int;
begin
  select * into a from public.applications where id=_id;
  select max(version) into pack from public.requirements where app_type=a.app_type and active;
  insert into public.application_claims(application_id,requirement_id,status,statement_snapshot,clause_snapshot,
    evidence_types_snapshot,verification_method,system_rule_snapshot,input_fields_snapshot,requirement_version_snapshot,is_mandatory_snapshot)
  select a.id,r.id,'unverified',r.statement,r.clause,r.evidence_types,r.verification_method,r.system_rule,r.input_fields,r.version,r.is_mandatory
  from public.requirements r where r.app_type=a.app_type and r.version=pack and r.active
  on conflict(application_id,requirement_id) do nothing;
end $$;

create function fp_private.review_basis(_claim uuid,_result public.claim_status) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.application_claims; a public.applications; inputs jsonb; evidence jsonb; evaluated jsonb;
begin
  select * into c from public.application_claims where id=_claim;
  select * into a from public.applications where id=c.application_id;
  if c.id is null then return null; end if;
  if _result='not_applicable' then inputs:=a.form_data;
  else select coalesce(jsonb_object_agg(k,a.form_data->k),'{}') into inputs from unnest(c.input_fields_snapshot) k; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'sha256',d.sha256,'doc_type',d.doc_type,
    'expires_on',d.expires_on,'scan_status',d.scan_status) order by d.id),'[]') into evidence
  from public.claim_evidence ce join public.application_documents d on d.id=ce.document_id
  where ce.claim_id=c.id and d.application_id=c.application_id and
    (_result='not_applicable' or (c.verification_method<>'system_check' and d.doc_type=any(c.evidence_types_snapshot)
      and d.scan_status='clean' and d.sha256 is not null and (d.expires_on is null or d.expires_on>=(now() at time zone 'Asia/Kolkata')::date)));
  if c.verification_method='system_check' and _result='verified' then evaluated:=fp_private.evaluate_system_claim(c.id); end if;
  return jsonb_build_object('schema',1,'result',_result,'method',c.verification_method,'clause',c.clause_snapshot,
    'requirement_version',c.requirement_version_snapshot,'mandatory',c.is_mandatory_snapshot,
    'evidence_types',to_jsonb(c.evidence_types_snapshot),'inputs',inputs,'documents',evidence,'system_result',evaluated);
end $$;

create function fp_private.review_basis_current(_claim uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c public.application_claims; expected jsonb;
begin
  select * into c from public.application_claims where id=_claim;
  if c.status not in ('verified','not_applicable') or c.verification_basis is null then return false; end if;
  expected:=fp_private.review_basis(c.id,c.status);
  if c.status='verified' then
    if c.verification_method='system_check' then
      if not coalesce((expected->'system_result'->>'passed')::boolean,false) then return false; end if;
    elsif jsonb_array_length(expected->'documents')=0 then return false; end if;
  end if;
  return c.verification_basis=expected;
end $$;

create function fp_private.review_snapshot(_application uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schema',1,'application',jsonb_build_object('id',a.id,'version',a.version,'status',a.status,
   'workflow_version',a.template_version,'form_data',a.form_data),'calendar','Asia/Kolkata / synthetic weekdays',
   'claims',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('basis_current',fp_private.review_basis_current(c.id)) order by c.id)
     from public.application_claims c where c.application_id=a.id),'[]'),
   'deficiencies',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.deficiencies d where d.application_id=a.id),'[]'),
   'links',coalesce((select jsonb_agg(to_jsonb(ce) order by ce.claim_id,ce.document_id) from public.claim_evidence ce
     join public.application_claims c on c.id=ce.claim_id where c.application_id=a.id),'[]'),
   'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'doc_type',d.doc_type,'file_name',d.file_name,
     'sha256',d.sha256,'scan_status',d.scan_status,'expires_on',d.expires_on,'uploaded_at',d.uploaded_at) order by d.id)
     from public.application_documents d where d.application_id=a.id),'[]')) from public.applications a where a.id=_application;
$$;

create or replace function fp_private.append_event(_application uuid,_actor uuid,_actor_role text,_action text,
  _from_state public.app_status,_to_state public.app_status,_reason text,_detail jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare seq int; previous text; recorded timestamptz:=clock_timestamp(); digest text; detail jsonb;
begin
  perform 1 from public.applications where id=_application for update;
  if not found or coalesce(length(_action),0) not between 1 and 200 then raise exception 'Invalid audit event'; end if;
  perform pg_advisory_xact_lock(hashtextextended(_application::text,0));
  select coalesce(max(sequence),0)+1 into seq from public.application_events where application_id=_application;
  select coalesce((select event_hash from public.application_events where application_id=_application order by sequence desc limit 1),'') into previous;
  detail:=coalesce(_detail,'{}')||jsonb_build_object('review_snapshot',fp_private.review_snapshot(_application),
    'operation_id',nullif(current_setting('fp.review_operation',true),''));
  digest:=fp_private.audit_hash(jsonb_build_object('application_id',_application,'sequence',seq,'prev_hash',previous,
    'actor_id',_actor,'actor_role',_actor_role,'action',_action,'from_status',_from_state,'to_status',_to_state,
    'reason',_reason,'payload',detail,'created_at',recorded));
  insert into public.application_events(application_id,actor_id,actor_role,action,from_status,to_status,reason,payload,sequence,prev_hash,event_hash,created_at)
  values(_application,_actor,_actor_role,_action,_from_state,_to_state,_reason,detail,seq,previous,digest,recorded);
end $$;

create or replace function fp_private.event(app uuid,action text,old_state public.app_status,new_state public.app_status,reason text default null,detail jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare a public.applications; uid uuid:=fp_private.actor(); used_role text;
begin
  select * into a from public.applications where id=app;
  if action in ('claim_verified','deficiency_raised','deficiency_rechecked') then used_role:='scrutiny_officer';
  elsif action='deficiency_resolved' then used_role:='institution';
  elsif action in ('claim_evidence_linked','claim_evidence_unlinked') then used_role:=case when a.owner_id=uid then 'institution' else 'scrutiny_officer' end;
  else select r.role::text into used_role from public.user_roles r where r.user_id=uid and fp_private.has_role(r.role,case when r.role='institution' then null else a.region end)
    order by case r.role when 'national_admin' then 1 when 'regional_officer' then 2 when 'evc_coordinator' then 3 when 'scrutiny_officer' then 4 else 5 end limit 1; end if;
  perform fp_private.append_event(app,uid,used_role,action,old_state,new_state,reason,detail);
end $$;

-- Link changes invalidate only this claim. Metadata-only relinking is not a new evidence set.
create function fp_private.invalidate_evidence_review() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid; app uuid; state public.app_status;
begin
  if tg_op='UPDATE' and new.claim_id=old.claim_id and new.document_id=old.document_id then return new; end if;
  cid:=case when tg_op='DELETE' then old.claim_id else new.claim_id end;
  select application_id into app from public.application_claims where id=cid;
  perform 1 from public.applications where id=app for update;
  update public.application_claims set status='unverified',updated_at=now() where id=cid and status in ('verified','not_applicable');
  if found then
    select status into state from public.applications where id=app;
    perform fp_private.append_event(app,auth.uid(),'system','review_invalidated',state,state,'Linked evidence changed',jsonb_build_object('claim_id',cid,'cause','evidence_link'));
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger invalidate_evidence_review after insert or update of claim_id,document_id or delete on public.claim_evidence
for each row execute function fp_private.invalidate_evidence_review();

drop trigger invalidate_system_claims on public.applications;
create or replace function fp_private.invalidate_system_claims() returns trigger language plpgsql security definer set search_path='' as $$
declare c record; affected uuid[]:='{}';
begin
  if new.form_data is not distinct from old.form_data then return new; end if;
  for c in select id from public.application_claims where application_id=new.id and status in ('verified','not_applicable') order by id for update loop
    if not fp_private.review_basis_current(c.id) then
      update public.application_claims set status='unverified',updated_at=now() where id=c.id;
      affected:=array_append(affected,c.id);
    end if;
  end loop;
  if cardinality(affected)>0 then perform fp_private.append_event(new.id,auth.uid(),'system','review_invalidated',old.status,new.status,
    'Configured review inputs changed',jsonb_build_object('claim_ids',affected,'cause','declared_inputs')); end if;
  return new;
end $$;
create trigger invalidate_system_claims after update of form_data on public.applications for each row execute function fp_private.invalidate_system_claims();

create or replace function fp_private.verify_claim(_claim uuid,_result public.claim_status,_note text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; app uuid; uid uuid:=fp_private.actor(); basis jsonb; evaluated jsonb;
begin
  select application_id into app from public.application_claims where id=_claim;
  select * into a from public.applications where id=app for update;
  select * into c from public.application_claims where id=_claim and application_id=a.id for update;
  if c.id is null or a.owner_id=uid or a.status<>'under_scrutiny' or a.assigned_officer is distinct from uid or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501'; end if;
  if _result is null or _result not in ('verified','not_applicable') then raise exception 'Choose verified or not applicable'; end if;
  if length(coalesce(_note,''))>1000 then raise exception 'Verification note is too long'; end if;
  if _result='not_applicable' and coalesce(length(trim(_note)),0)<10 then raise exception 'Explain why the claim is not applicable (10 characters minimum)'; end if;
  if exists(select 1 from public.deficiencies where claim_id=c.id and (status in ('open','escalated') or (status='resolved' and rechecked_at is null))) then raise exception 'Resolve and re-check the open deficiency first'; end if;
  basis:=fp_private.review_basis(c.id,_result); evaluated:=basis->'system_result';
  if _result='verified' then
    if c.verification_method='system_check' then
      if not coalesce((evaluated->>'passed')::boolean,false) then raise exception 'Demo system rule failed'; end if;
    elsif jsonb_array_length(basis->'documents')=0 then raise exception 'Link current clean evidence of the required type before verifying'; end if;
  end if;
  update public.application_claims set status=_result,verified_by=uid,verified_at=now(),verification_note=nullif(trim(coalesce(_note,'')),''),
    system_result=case when evaluated='null'::jsonb then null else evaluated end,system_inputs=evaluated->'inputs',verification_basis=basis,updated_at=now() where id=c.id;
  perform fp_private.event(a.id,'claim_verified',a.status,a.status,_note,jsonb_build_object('claim_id',c.id,'result',_result));
end $$;

create or replace function fp_private.raise_deficiency(_claim uuid,_observation text,_remedy text,_due timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; app uuid; result uuid; uid uuid:=fp_private.actor();
begin
  select application_id into app from public.application_claims where id=_claim;
  select * into a from public.applications where id=app for update;
  select * into c from public.application_claims where id=_claim and application_id=a.id for update;
  if c.id is null or a.owner_id=uid or a.status<>'under_scrutiny' or a.assigned_officer is distinct from uid or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501'; end if;
  if coalesce(length(trim(_observation)),0) not between 10 and 2000 or coalesce(length(trim(_remedy)),0) not between 10 and 2000 or _due is null or _due<=now() or _due>now()+interval '90 days' then raise exception 'Observation, remedy, and a due date within 90 days are required'; end if;
  if exists(select 1 from public.deficiencies where claim_id=c.id and (status in ('open','escalated') or (status='resolved' and rechecked_at is null))) then raise exception 'A deficiency is already open for this claim'; end if;
  insert into public.deficiencies(application_id,claim_id,clause,observation,remedy,due_at,raised_by)
    values(a.id,c.id,c.clause_snapshot,trim(_observation),trim(_remedy),_due,uid) returning id into result;
  update public.application_claims set status='deficient',updated_at=now() where id=c.id;
  perform fp_private.event(a.id,'deficiency_raised',a.status,a.status,trim(_observation),jsonb_build_object('claim_id',c.id,'deficiency_id',result));
  return result;
end $$;

create or replace function fp_private.link_claim_evidence(_claim uuid,_document uuid,_note text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; app uuid; doc public.application_documents; uid uuid:=fp_private.actor();
begin
  select application_id into app from public.application_claims where id=_claim;
  select * into a from public.applications where id=app for update;
  select * into c from public.application_claims where id=_claim and application_id=a.id for update;
  if c.id is null or not ((a.owner_id=uid and fp_private.has_role('institution') and (a.status in ('draft','deficiency_raised') or exists(select 1 from public.deficiencies where claim_id=c.id and status in ('open','escalated')))) or (a.owner_id<>uid and a.assigned_officer=uid and a.status='under_scrutiny' and fp_private.has_role('scrutiny_officer',a.region))) then raise exception 'Evidence link not permitted' using errcode='42501'; end if;
  select * into doc from public.application_documents where id=_document and application_id=a.id;
  if doc.id is null or doc.scan_status<>'clean' or (doc.expires_on is not null and doc.expires_on<(now() at time zone 'Asia/Kolkata')::date) then raise exception 'A current clean document from this case is required'; end if;
  if not doc.doc_type=any(c.evidence_types_snapshot) then raise exception 'Evidence type does not match the claim'; end if;
  if length(coalesce(_note,''))>500 then raise exception 'Evidence note is too long'; end if;
  insert into public.claim_evidence(claim_id,document_id,linked_by,note) values(c.id,doc.id,uid,nullif(trim(coalesce(_note,'')),''))
    on conflict(claim_id,document_id) do update set linked_by=excluded.linked_by,linked_at=now(),note=excluded.note;
  perform fp_private.event(a.id,'claim_evidence_linked',a.status,a.status,_note,jsonb_build_object('claim_id',c.id,'document_id',doc.id));
end $$;

create or replace function fp_private.unlink_claim_evidence(_claim uuid,_document uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; app uuid; uid uuid:=fp_private.actor();
begin
  select application_id into app from public.application_claims where id=_claim;
  select * into a from public.applications where id=app for update;
  select * into c from public.application_claims where id=_claim and application_id=a.id for update;
  if c.id is null or not ((a.owner_id=uid and fp_private.has_role('institution') and (a.status in ('draft','deficiency_raised') or exists(select 1 from public.deficiencies where claim_id=c.id and status in ('open','escalated')))) or (a.owner_id<>uid and a.assigned_officer=uid and a.status='under_scrutiny' and fp_private.has_role('scrutiny_officer',a.region))) then raise exception 'Evidence unlink not permitted' using errcode='42501'; end if;
  delete from public.claim_evidence where claim_id=c.id and document_id=_document;
  if not found then raise exception 'Evidence link not found'; end if;
  perform fp_private.event(a.id,'claim_evidence_unlinked',a.status,a.status,null,jsonb_build_object('claim_id',c.id,'document_id',_document));
end $$;

create or replace function fp_private.resolve_deficiency(_deficiency uuid,_evidence uuid,_note text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.deficiencies; c public.application_claims; a public.applications; app uuid; doc public.application_documents; uid uuid:=fp_private.actor();
begin
  select application_id into app from public.deficiencies where id=_deficiency;
  select * into a from public.applications where id=app for update;
  select claim_id into app from public.deficiencies where id=_deficiency;
  select * into c from public.application_claims where id=app for update;
  select * into d from public.deficiencies where id=_deficiency and application_id=a.id for update;
  if d.id is null or a.owner_id<>uid or not fp_private.has_role('institution') or d.status not in ('open','escalated') or a.status not in ('under_scrutiny','deficiency_raised') then raise exception 'Institution owner required for an open deficiency' using errcode='42501'; end if;
  select * into doc from public.application_documents where id=_evidence and application_id=a.id;
  if doc.id is not null and not doc.doc_type=any(c.evidence_types_snapshot) then raise exception 'Evidence type does not match the claim'; end if;
  if doc.id is null or doc.scan_status<>'clean' or doc.sha256 is null or (doc.expires_on is not null and doc.expires_on<(now() at time zone 'Asia/Kolkata')::date) then raise exception 'A current clean document from this case is required'; end if;
  if coalesce(length(trim(_note)),0) not between 10 and 2000 then raise exception 'Explain the resolution (10 characters minimum)'; end if;
  update public.deficiencies set status='resolved',resolved_by=uid,resolved_at=now(),resolution_note=trim(_note),evidence_id=doc.id,
    response_revision=response_revision+1,rechecked_by=null,rechecked_at=null,recheck_note=null where id=d.id;
  update public.application_claims set status='unverified',updated_at=now() where id=c.id;
  insert into public.claim_evidence(claim_id,document_id,linked_by,note) values(c.id,doc.id,uid,trim(_note))
    on conflict(claim_id,document_id) do update set linked_by=excluded.linked_by,linked_at=now(),note=excluded.note;
  perform fp_private.event(a.id,'deficiency_resolved',a.status,a.status,_note,jsonb_build_object('deficiency_id',d.id,'claim_id',c.id,'evidence_id',doc.id,'response_revision',d.response_revision+1));
end $$;

create or replace function fp_private.recheck_deficiency(_deficiency uuid,_result text,_note text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.deficiencies; c public.application_claims; a public.applications; app uuid; doc public.application_documents; uid uuid:=fp_private.actor(); basis jsonb; evaluated jsonb;
begin
  select application_id into app from public.deficiencies where id=_deficiency;
  select * into a from public.applications where id=app for update;
  select claim_id into app from public.deficiencies where id=_deficiency;
  select * into c from public.application_claims where id=app for update;
  select * into d from public.deficiencies where id=_deficiency and application_id=a.id for update;
  if d.id is null or a.owner_id=uid or a.assigned_officer is distinct from uid or a.status not in ('under_scrutiny','deficiency_raised') or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501'; end if;
  if d.status<>'resolved' or d.rechecked_at is not null or _result is null or _result not in ('accepted','reopened') or coalesce(length(trim(_note)),0) not between 10 and 2000 then raise exception 'A current resolved response and a re-check note are required'; end if;
  if _result='accepted' then
    select * into doc from public.application_documents where id=d.evidence_id and application_id=a.id;
    if doc.id is null or not doc.doc_type=any(c.evidence_types_snapshot) or doc.scan_status<>'clean' or doc.sha256 is null
      or (doc.expires_on is not null and doc.expires_on<(now() at time zone 'Asia/Kolkata')::date)
      or not exists(select 1 from public.claim_evidence where claim_id=c.id and document_id=doc.id) then raise exception 'The response evidence must be current clean evidence of the required type'; end if;
    basis:=fp_private.review_basis(c.id,'verified'); evaluated:=basis->'system_result';
    if c.verification_method='system_check' and not coalesce((evaluated->>'passed')::boolean,false) then raise exception 'Demo system rule failed'; end if;
    update public.deficiencies set rechecked_by=uid,rechecked_at=now(),recheck_note=trim(_note) where id=d.id;
    update public.application_claims set status='verified',verified_by=uid,verified_at=now(),verification_note=trim(_note),verification_basis=basis,
      system_result=case when evaluated='null'::jsonb then null else evaluated end,system_inputs=evaluated->'inputs',updated_at=now() where id=c.id;
  else
    update public.deficiencies set status='open',resolved_by=null,resolved_at=null,resolution_note=null,evidence_id=null,
      rechecked_by=uid,rechecked_at=now(),recheck_note=trim(_note) where id=d.id;
    update public.application_claims set status='deficient',updated_at=now() where id=c.id;
  end if;
  perform fp_private.event(a.id,'deficiency_rechecked',a.status,a.status,_note,jsonb_build_object('deficiency_id',d.id,'claim_id',c.id,'result',_result,'response_revision',d.response_revision));
end $$;

create or replace function fp_private.integrity_gate(_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not coalesce((fp_private.verify_audit_chain(_id)->>'intact')::boolean,false) then raise exception 'The audit chain is broken'; end if;
  if exists(select 1 from public.application_claims where application_id=_id and is_mandatory_snapshot and status not in ('verified','not_applicable')) then raise exception 'Every mandatory claim must be verified or not applicable'; end if;
  if exists(select 1 from public.deficiencies where application_id=_id and (status in ('open','escalated') or (status='resolved' and rechecked_at is null))) then raise exception 'Resolve and re-check every open deficiency'; end if;
  if exists(select 1 from public.integrity_signals where application_id=_id and disposition='confirmed') then raise exception 'A confirmed integrity signal blocks this decision'; end if;
  if exists(select 1 from public.application_claims c where application_id=_id and status in ('verified','not_applicable') and not fp_private.review_basis_current(c.id)) then raise exception 'Recorded review basis is missing or stale; review affected claims again'; end if;
end $$;

-- Trusted scan completions and signal changes join the same application-first transaction boundary.
create or replace function fp_private.complete_document(_id uuid,_sha256 text,_clean boolean,_engine text) returns void language plpgsql security definer set search_path='' as $$
declare d public.application_documents; app uuid;
begin
  select application_id into app from public.application_documents where id=_id;
  perform 1 from public.applications where id=app for update;
  select * into d from public.application_documents where id=_id and application_id=app for update;
  if d.id is null or d.scan_status<>'pending' or _clean is null or _sha256 is null or _sha256 !~ '^[a-f0-9]{64}$' or coalesce(length(_engine),0)<3 then raise exception 'Invalid scan completion'; end if;
  if not exists(select 1 from storage.objects o where o.name=d.file_path and o.bucket_id='application-docs' and (o.metadata->>'size')::bigint=d.size_bytes and o.metadata->>'mimetype'=d.mime_type) then raise exception 'Uploaded bytes and metadata do not match'; end if;
  -- A pending, unreviewed file becoming eligible does not change the case's reviewed basis.
  -- Link/review commands advance the case revision; all gates recheck exact basis metadata.
  update public.application_documents set scan_status=case when _clean then 'clean' else 'rejected' end,sha256=_sha256,scanned_at=now(),scan_engine=left(_engine,120) where id=d.id;
  perform fp_private.append_event(app,null,'scanner','document_scanned',null,null,null,jsonb_build_object('document_id',d.id,'clean',_clean,'sha256',_sha256,'engine',_engine));
end $$;
create or replace function fp_private.disposition_signal(_signal uuid,_disposition public.signal_disposition,_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.integrity_signals; a public.applications; app uuid; uid uuid:=fp_private.actor();
begin
  select application_id into app from public.integrity_signals where id=_signal;
  select * into a from public.applications where id=app for update;
  select * into s from public.integrity_signals where id=_signal and application_id=a.id for update;
  if s.id is null or a.owner_id=uid or not (fp_private.has_role('scrutiny_officer',a.region) or fp_private.has_role('regional_officer',a.region) or fp_private.has_role('national_admin')) then raise exception 'Signal jurisdiction required' using errcode='42501'; end if;
  if _disposition is null or _disposition not in ('explained','confirmed','dismissed') or coalesce(length(trim(_reason)),0) not between 10 and 1000 then raise exception 'A disposition and reason are required'; end if;
  update public.applications set version=version+1,updated_at=now() where id=a.id;
  update public.integrity_signals set disposition=_disposition,disposition_reason=trim(_reason),disposed_by=uid,disposed_at=now() where id=s.id;
  perform fp_private.event(a.id,'signal_disposition',a.status,a.status,_reason,jsonb_build_object('signal_id',s.id,'signal_type',s.signal_type,'disposition',_disposition));
end $$;

create table fp_private.review_receipts(request_id uuid primary key,actor_id uuid not null,application_id uuid not null,input jsonb not null,result jsonb not null);
revoke all on fp_private.review_receipts from public,anon,authenticated,service_role;
create function fp_private.review_command(_resource uuid,_action text,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.applications; app uuid; uid uuid:=fp_private.actor(); body jsonb; receipt fp_private.review_receipts; result jsonb:='{}'; raised uuid;
begin
  if _request_id is null or _expected_version is null or _payload is null or jsonb_typeof(_payload)<>'object' or pg_column_size(_payload)>12000 then raise exception 'Invalid review command'; end if;
  if _action in ('resolve_deficiency','recheck_deficiency') then select application_id into app from public.deficiencies where id=_resource;
  else select application_id into app from public.application_claims where id=_resource; end if;
  select * into a from public.applications where id=app for update;
  if a.id is null or not fp_private.can_view(a.id) then raise exception 'Application unavailable' using errcode='42501'; end if;
  if _action='resolve_deficiency' then
    if a.owner_id<>uid or not fp_private.has_role('institution') then raise exception 'Institution owner required' using errcode='42501'; end if;
  elsif _action in ('verify_claim','raise_deficiency','recheck_deficiency') then
    if a.owner_id=uid or a.assigned_officer is distinct from uid or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501'; end if;
  elsif _action in ('link_claim_evidence','unlink_claim_evidence') then
    if not ((a.owner_id=uid and fp_private.has_role('institution')) or (a.owner_id<>uid and a.assigned_officer=uid and fp_private.has_role('scrutiny_officer',a.region))) then raise exception 'Evidence link not permitted' using errcode='42501'; end if;
  else raise exception 'Unknown review command'; end if;
  body:=jsonb_build_object('resource',_resource,'action',_action,'payload',_payload,'version',_expected_version);
  select * into receipt from fp_private.review_receipts where request_id=_request_id;
  if receipt.request_id is not null then
    if receipt.actor_id<>uid or receipt.application_id<>a.id or receipt.input<>body then raise exception 'Idempotency key already used for different input'; end if;
    return receipt.result;
  end if;
  if a.version<>_expected_version then raise exception 'Case changed; reload before acting' using errcode='40001'; end if;
  perform set_config('fp.review_operation',_request_id::text,true);
  update public.applications set version=version+1,updated_at=now() where id=a.id;
  case _action
    when 'verify_claim' then perform fp_private.verify_claim(_resource,(_payload->>'result')::public.claim_status,_payload->>'note');
    when 'raise_deficiency' then raised:=fp_private.raise_deficiency(_resource,_payload->>'observation',_payload->>'remedy',(_payload->>'due')::timestamptz);result:=jsonb_build_object('id',raised);
    when 'link_claim_evidence' then perform fp_private.link_claim_evidence(_resource,(_payload->>'document')::uuid,_payload->>'note');
    when 'unlink_claim_evidence' then perform fp_private.unlink_claim_evidence(_resource,(_payload->>'document')::uuid);
    when 'resolve_deficiency' then perform fp_private.resolve_deficiency(_resource,(_payload->>'evidence')::uuid,_payload->>'note');
    when 'recheck_deficiency' then perform fp_private.recheck_deficiency(_resource,_payload->>'result',_payload->>'note');
  end case;
  result:=result||jsonb_build_object('application_id',a.id,'version',a.version+1);
  insert into fp_private.review_receipts values(_request_id,uid,a.id,body,result);
  perform set_config('fp.review_operation','',true);
  return result;
end $$;

-- The old unversioned browser write endpoints are retired. New overloads require revision + request identity.
revoke execute on function public.fp_verify_claim(uuid,public.claim_status,text),public.fp_raise_deficiency(uuid,text,text,timestamptz),
 public.fp_link_claim_evidence(uuid,uuid,text),public.fp_unlink_claim_evidence(uuid,uuid),public.fp_resolve_deficiency(uuid,uuid,text),public.fp_recheck_deficiency(uuid,text,text) from public,anon,authenticated;
revoke execute on function fp_private.verify_claim(uuid,public.claim_status,text),fp_private.raise_deficiency(uuid,text,text,timestamptz),
 fp_private.link_claim_evidence(uuid,uuid,text),fp_private.unlink_claim_evidence(uuid,uuid),fp_private.resolve_deficiency(uuid,uuid,text),fp_private.recheck_deficiency(uuid,text,text) from public,anon,authenticated;
create function public.fp_verify_claim(_claim uuid,_result public.claim_status,_note text,_expected_version int,_request_id uuid) returns void language sql security invoker set search_path='' as $$ select fp_private.review_command(_claim,'verify_claim',jsonb_build_object('result',_result,'note',_note),_expected_version,_request_id); $$;
create function public.fp_raise_deficiency(_claim uuid,_observation text,_remedy text,_due timestamptz,_expected_version int,_request_id uuid) returns uuid language sql security invoker set search_path='' as $$ select (fp_private.review_command(_claim,'raise_deficiency',jsonb_build_object('observation',_observation,'remedy',_remedy,'due',_due),_expected_version,_request_id)->>'id')::uuid; $$;
create function public.fp_link_claim_evidence(_claim uuid,_document uuid,_note text,_expected_version int,_request_id uuid) returns void language sql security invoker set search_path='' as $$ select fp_private.review_command(_claim,'link_claim_evidence',jsonb_build_object('document',_document,'note',_note),_expected_version,_request_id); $$;
create function public.fp_unlink_claim_evidence(_claim uuid,_document uuid,_expected_version int,_request_id uuid) returns void language sql security invoker set search_path='' as $$ select fp_private.review_command(_claim,'unlink_claim_evidence',jsonb_build_object('document',_document),_expected_version,_request_id); $$;
create function public.fp_resolve_deficiency(_deficiency uuid,_evidence uuid,_note text,_expected_version int,_request_id uuid) returns void language sql security invoker set search_path='' as $$ select fp_private.review_command(_deficiency,'resolve_deficiency',jsonb_build_object('evidence',_evidence,'note',_note),_expected_version,_request_id); $$;
create function public.fp_recheck_deficiency(_deficiency uuid,_result text,_note text,_expected_version int,_request_id uuid) returns void language sql security invoker set search_path='' as $$ select fp_private.review_command(_deficiency,'recheck_deficiency',jsonb_build_object('result',_result,'note',_note),_expected_version,_request_id); $$;
grant execute on function fp_private.review_command(uuid,text,jsonb,int,uuid),
 public.fp_verify_claim(uuid,public.claim_status,text,int,uuid),public.fp_raise_deficiency(uuid,text,text,timestamptz,int,uuid),
 public.fp_link_claim_evidence(uuid,uuid,text,int,uuid),public.fp_unlink_claim_evidence(uuid,uuid,int,uuid),
 public.fp_resolve_deficiency(uuid,uuid,text,int,uuid),public.fp_recheck_deficiency(uuid,text,text,int,uuid) to authenticated;

create function fp_private.create_application_draft(_type public.app_type,_title text,_form jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if _form is null or jsonb_typeof(_form)<>'object' or (_form ? 'intake' and coalesce(_form->>'intake','') !~ '^[1-9][0-9]{0,5}$') then raise exception 'Use a positive whole-number intake'; end if;
  result:=fp_private.create_application(_type,_title);
  if _form<>'{}'::jsonb then perform fp_private.save_draft(result,_title,_form,1); end if;
  return result;
end $$;
create function public.fp_create_application_draft(_type public.app_type,_title text,_form jsonb) returns uuid language sql security invoker set search_path='' as $$ select fp_private.create_application_draft(_type,_title,_form); $$;
grant execute on function fp_private.create_application_draft(public.app_type,text,jsonb),public.fp_create_application_draft(public.app_type,text,jsonb) to authenticated;

create function fp_private.case_history(_application uuid,_after int,_through int,_limit int) returns jsonb language plpgsql security definer set search_path='' as $$
declare head int; last_seen int; rows jsonb; checkpoint text;
begin
  if not fp_private.can_view(_application) then raise exception 'Application unavailable' using errcode='42501'; end if;
  if _after is null or _after<0 or _limit is null or _limit not between 1 and 200 then raise exception 'Invalid history page'; end if;
  select coalesce(max(sequence),0) into head from public.application_events where application_id=_application;
  head:=coalesce(_through,head);
  if head<0 or head<_after or head>(select coalesce(max(sequence),0) from public.application_events where application_id=_application) then raise exception 'Invalid history checkpoint'; end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by sequence),'[]'),coalesce(max(sequence),_after) into rows,last_seen from
    (select * from public.application_events where application_id=_application and sequence>_after and sequence<=head order by sequence limit _limit) e;
  select event_hash into checkpoint from public.application_events where application_id=_application and sequence=head;
  return jsonb_build_object('events',rows,'through',head,'head_hash',checkpoint,'next_after',last_seen,'complete',last_seen=head);
end $$;
create function public.fp_case_history(_application uuid,_after int default 0,_through int default null,_limit int default 100) returns jsonb language sql security invoker set search_path='' as $$ select fp_private.case_history(_application,_after,_through,_limit); $$;
grant execute on function fp_private.case_history(uuid,int,int,int),public.fp_case_history(uuid,int,int,int) to authenticated;

-- No guessed past basis is assigned. This is the first captured current-state snapshot of legacy cases.
do $$ declare a record; begin
  for a in select id,status from public.applications order by id loop
    perform fp_private.append_event(a.id,null,'system','review_baseline',a.status,a.status,
      'Current-state baseline; earlier evidence bases are unavailable',jsonb_build_object('coverage','current_state_only'));
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
