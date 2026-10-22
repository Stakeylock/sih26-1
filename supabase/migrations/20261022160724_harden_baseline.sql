begin;
-- Reviewed continuation of the two Baseline migrations in supabase/reference/.
-- This deployment is DEMO ONLY. Every transition is atomic with its audit event.
create schema fp_private;
revoke all on schema fp_private from public, anon;
grant usage on schema fp_private to authenticated, service_role;
alter default privileges in schema fp_private revoke execute on functions from public;

alter table public.user_roles add column active boolean not null default true;
alter table public.user_roles add constraint role_jurisdiction check (
  (role in ('institution','national_admin') and region is null) or
  (role in ('scrutiny_officer','evc_coordinator','regional_officer') and region in ('North','South','East','West','Central','North-East') and region is not null)
);
alter table public.applications add column version integer not null default 1;
alter table public.applications add column is_demo boolean not null default true check (is_demo);
alter table public.applications alter column ref_no set default ('DEMO-' || to_char(now(),'YYYY') || '-' || nextval('public.app_ref_seq'));
alter table public.application_documents add column scan_status text not null default 'pending' check (scan_status in ('pending','clean','rejected'));
alter table public.application_documents add column sha256 text check (sha256 ~ '^[a-f0-9]{64}$');
alter table public.application_documents add column scanned_at timestamptz;
alter table public.application_documents add column scan_engine text;
alter table public.application_documents add constraint valid_file_size check (size_bytes between 1 and 10485760);
alter table public.application_documents add constraint clean_has_provenance check (scan_status <> 'clean' or (sha256 is not null and scanned_at is not null and scan_engine is not null));
create table fp_private.transition_receipts (
  request_id uuid primary key, actor_id uuid not null, application_id uuid not null references public.applications(id),
  input jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table fp_private.transition_receipts enable row level security;
create index on public.applications(owner_id);
create index on public.applications(region,status);
create index on public.application_documents(application_id,scan_status);
create index on public.application_events(application_id,created_at);
create index on public.user_roles(user_id,role,region) where active;
create index on public.obligations(application_id);
create index on public.evc_visits(application_id);
create index on public.notifications(user_id,created_at);
create unique index one_renewal_per_application on public.obligations(application_id) where kind='renewal';

-- Revoke the legacy public definer API. New public endpoints are invoker facades.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' loop
    execute format('revoke execute on function %s from public,anon,authenticated', f.signature);
  end loop;
end $$;

create function fp_private.actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare uid uuid := auth.uid(); sid text := auth.jwt()->>'session_id';
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists (
    select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
  ) or not exists (
    select 1 from auth.sessions s where s.id::text=sid and s.user_id=uid and (s.not_after is null or s.not_after>now())
  ) then raise exception 'A verified active session is required' using errcode='42501'; end if;
  return uid;
end $$;
create function fp_private.has_role(r public.app_role, area text default null) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=fp_private.actor() and role=r and active
    and (r in ('institution','national_admin') or region=area));
$$;
create function fp_private.in_region(area text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=fp_private.actor() and active and role<>'institution'
    and (role='national_admin' or region=area));
$$;
create function fp_private.can_view(app uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.applications a where a.id=app and
    ((a.owner_id=fp_private.actor() and fp_private.has_role('institution')) or (a.status<>'draft' and fp_private.in_region(a.region))));
$$;
create function fp_private.can_edit(app uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.applications a where a.id=app and a.owner_id=fp_private.actor()
    and fp_private.has_role('institution') and a.status in ('draft','deficiency_raised'));
$$;
create or replace function public.has_role(_user_id uuid,_role public.app_role) returns boolean language sql stable security invoker set search_path='' as $$
  select _user_id=auth.uid() and exists(select 1 from public.user_roles where user_id=auth.uid() and role=_role and active);
$$;
create or replace function public.officer_in_region(_user_id uuid,_region text) returns boolean language sql stable security invoker set search_path='' as $$
  select _user_id=auth.uid() and fp_private.in_region(_region);
$$;
create or replace function public.can_view_application(_app uuid) returns boolean language sql stable security invoker set search_path='' as $$ select fp_private.can_view(_app) $$;

-- Replace every legacy policy. The private helpers bind authorization to the caller.
do $$ declare p record; begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in
    ('profiles','user_roles','institutions','workflow_templates','config_audit','applications','application_documents','application_events','checklist_items','evc_visits','obligations','notifications') loop
    execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;
revoke all on public.profiles,public.institutions,public.application_documents,public.notifications from authenticated;
grant select on public.profiles,public.institutions,public.application_documents,public.notifications to authenticated;
create policy profile_self on public.profiles for select to authenticated using(id=fp_private.actor());
create policy roles_self on public.user_roles for select to authenticated using(user_id=fp_private.actor() and active);
create policy institution_scope on public.institutions for select to authenticated using(owner_id=fp_private.actor() or fp_private.in_region(region));
create policy template_read on public.workflow_templates for select to authenticated using(fp_private.actor() is not null and (status='published' or fp_private.has_role('national_admin')));
create policy config_admin on public.config_audit for select to authenticated using(fp_private.has_role('national_admin'));
create policy application_scope on public.applications for select to authenticated using(fp_private.can_view(id));
create policy document_scope on public.application_documents for select to authenticated using(fp_private.can_view(application_id));
create policy event_scope on public.application_events for select to authenticated using(fp_private.can_view(application_id));
create policy checklist_scope on public.checklist_items for select to authenticated using(fp_private.can_view(application_id));
create policy visit_scope on public.evc_visits for select to authenticated using(fp_private.can_view(application_id));
create policy obligation_scope on public.obligations for select to authenticated using(exists(select 1 from public.institutions i where i.id=institution_id and i.owner_id=fp_private.actor()) or fp_private.in_region(region));
create policy notification_scope on public.notifications for select to authenticated using(user_id=fp_private.actor());

create function fp_private.event(app uuid,action text,old_state public.app_status,new_state public.app_status,reason text default null,detail jsonb default '{}') returns void language sql security definer set search_path='' as $$
  insert into public.application_events(application_id,actor_id,actor_role,action,from_status,to_status,reason,payload)
  values(app,fp_private.actor(),(select role::text from public.user_roles where user_id=auth.uid() and active
    order by case role when 'national_admin' then 1 when 'regional_officer' then 2 when 'evc_coordinator' then 3 when 'scrutiny_officer' then 4 else 5 end limit 1),action,old_state,new_state,reason,detail);
$$;
create function fp_private.create_institution(_name text,_ref text,_region text,_state text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not fp_private.has_role('institution') then raise exception 'Institution role required'; end if;
  if length(trim(_name)) not between 3 and 200 or _ref is null or _ref !~ '^DEMO-[A-Z0-9-]{3,40}$' or length(trim(_state)) not between 2 and 100 then raise exception 'Use a synthetic institution and DEMO identifier'; end if;
  insert into public.institutions(owner_id,name,aicte_ref,region,state) values(fp_private.actor(),trim(_name),_ref,_region,trim(_state));
end $$;
create function fp_private.create_application(_type public.app_type,_title text) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.institutions; t public.workflow_templates; result uuid;
begin
  if not fp_private.has_role('institution') or length(trim(_title)) not between 5 and 200 or _title is null then raise exception 'Institution role and a title of 5–200 characters required'; end if;
  select * into i from public.institutions where owner_id=fp_private.actor();
  if i.id is null then raise exception 'Complete your institution profile first'; end if;
  select * into t from public.workflow_templates where app_type=_type and status='published' order by version desc limit 1;
  if t.id is null then raise exception 'No published workflow'; end if;
  insert into public.applications(institution_id,owner_id,app_type,title,region,template_id,template_version,template_snapshot)
  values(i.id,fp_private.actor(),_type,trim(_title),i.region,t.id,t.version,t.definition) returning id into result;
  perform fp_private.event(result,'created',null,'draft'); return result;
end $$;
create function fp_private.save_draft(_id uuid,_title text,_form jsonb,_version int) returns void language plpgsql security definer set search_path='' as $$
declare a public.applications;
begin
  select * into a from public.applications where id=_id for update;
  if not fp_private.can_edit(_id) then raise exception 'Application unavailable or locked' using errcode='42501'; end if;
  if a.version<>_version then raise exception 'Case changed; reload before saving' using errcode='40001'; end if;
  if _title is null or length(trim(_title)) not between 5 and 200 or _form is null or jsonb_typeof(_form)<>'object' or pg_column_size(_form)>50000 then raise exception 'Invalid draft'; end if;
  if exists(select 1 from jsonb_each(_form) f where jsonb_typeof(f.value)<>'string' or length(f.value::text)>5000 or not exists(select 1 from jsonb_array_elements(a.template_snapshot->'required_fields') s where s->>'key'=f.key)) then raise exception 'Unknown field or invalid field value'; end if;
  update public.applications set title=trim(_title),form_data=_form,version=version+1,updated_at=now() where id=_id;
  perform fp_private.event(_id,'draft_saved',a.status,a.status);
end $$;
create function fp_private.missing(_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.applications; result jsonb:='[]'; f jsonb; doc text;
begin
  if not fp_private.can_view(_id) then raise exception 'Application unavailable' using errcode='42501'; end if;
  select * into a from public.applications where id=_id;
  for f in select * from jsonb_array_elements(a.template_snapshot->'required_fields') loop
    if coalesce(trim(a.form_data->>(f->>'key')),'')='' then result:=result||jsonb_build_array(f->>'label'); end if;
  end loop;
  for doc in select jsonb_array_elements_text(a.template_snapshot->'required_documents') loop
    if not exists(select 1 from public.application_documents d join storage.objects o on o.name=d.file_path and o.bucket_id='application-docs'
      where d.application_id=_id and d.doc_type=doc and d.scan_status='clean' and (d.expires_on is null or d.expires_on>=current_date)) then result:=result||jsonb_build_array(doc); end if;
  end loop;
  return result;
end $$;
create function fp_private.transition(_id uuid,_action text,_reason text,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.applications; uid uuid:=fp_private.actor(); nxt public.app_status; want_evc boolean; ts timestamptz; r fp_private.transition_receipts;
  body jsonb; result jsonb; role_for_action public.app_role;
begin
  if _request_id is null or _expected_version is null or _payload is null or jsonb_typeof(_payload)<>'object' or pg_column_size(_payload)>10000 or length(coalesce(_reason,''))>5000 then raise exception 'Invalid transition input'; end if;
  select * into a from public.applications where id=_id for update;
  if a.id is null or not fp_private.can_view(_id) then raise exception 'Application unavailable' using errcode='42501'; end if;
  _reason:=nullif(trim(coalesce(_reason,'')),'');
  body:=jsonb_build_object('action',_action,'reason',_reason,'payload',_payload,'version',_expected_version);
  select * into r from fp_private.transition_receipts where request_id=_request_id;
  if r.request_id is not null then
    if r.actor_id<>uid or r.application_id<>_id or r.input<>body then raise exception 'Idempotency key already used for different input'; end if;
    return r.result;
  end if;
  if a.version<>_expected_version then raise exception 'Case changed; reload before acting' using errcode='40001'; end if;
  if _action in ('submit','resubmit') then
    if not fp_private.can_edit(_id) or (_action='submit' and a.status<>'draft') or (_action='resubmit' and a.status<>'deficiency_raised') then raise exception 'Illegal institution transition'; end if;
    if jsonb_array_length(fp_private.missing(_id))>0 then raise exception 'Complete all required fields and clean documents'; end if;
    if _action='resubmit' and coalesce(length(_reason),0)<10 then raise exception 'Explain the deficiency response (10 characters minimum)'; end if;
    nxt:=case _action when 'submit' then 'submitted'::public.app_status else 'resubmitted'::public.app_status end;
    update public.applications set submitted_at=coalesce(submitted_at,now()) where id=_id;
  else
    if a.owner_id=uid then raise exception 'You cannot review your own application' using errcode='42501'; end if;
    if _action in ('start_scrutiny','raise_deficiency','pass_scrutiny') then
      role_for_action:='scrutiny_officer';
      if not fp_private.has_role(role_for_action,a.region) then raise exception 'Scrutiny jurisdiction required' using errcode='42501'; end if;
      if _action='start_scrutiny' then
        if a.status not in ('submitted','resubmitted') then raise exception 'Illegal scrutiny transition'; end if;
        nxt:='under_scrutiny'; update public.applications set assigned_officer=uid where id=_id;
      else
        if a.status<>'under_scrutiny' or a.assigned_officer is distinct from uid then raise exception 'Only the assigned scrutiny officer may act'; end if;
        if _action='raise_deficiency' then
          if coalesce(length(_reason),0)<10 then raise exception 'A specific deficiency reason is required'; end if; nxt:='deficiency_raised';
        else
          if exists(select 1 from jsonb_array_elements_text(a.template_snapshot->'checklist') required where not exists(select 1 from public.checklist_items c where c.application_id=_id and c.item=required and c.passed is true)) then raise exception 'Complete every required checklist item'; end if;
          want_evc:=case a.template_snapshot->>'evc_mode' when 'required' then true when 'conditional' then coalesce((_payload->>'evc')::boolean,false) else false end;
          if a.template_snapshot->>'evc_mode'='none' and coalesce((_payload->>'evc')::boolean,false) then raise exception 'This route has no EVC'; end if;
          if a.template_snapshot->>'evc_mode'='conditional' and coalesce(length(_reason),0)<10 then raise exception 'Explain whether an EVC is needed'; end if;
          nxt:=case when want_evc then 'evc_pending'::public.app_status else 'pending_decision'::public.app_status end;
          update public.applications set evc_required=want_evc where id=_id;
        end if;
      end if;
    elsif _action in ('schedule_evc','submit_evc_report') then
      role_for_action:='evc_coordinator';
      if not fp_private.has_role(role_for_action,a.region) then raise exception 'EVC jurisdiction required' using errcode='42501'; end if;
      if _action='schedule_evc' then
        if a.status<>'evc_pending' then raise exception 'Illegal visit transition'; end if;
        ts:=(_payload->>'scheduled_for')::timestamptz;
        if ts is null or ts<=now() or ts>now()+interval '180 days' then raise exception 'Schedule within the next 180 days'; end if;
        insert into public.evc_visits(application_id,coordinator_id,scheduled_for) values(_id,uid,ts); nxt:='evc_scheduled';
      else
        if a.status<>'evc_scheduled' or coalesce(length(_reason),0)<20 or (_payload->>'recommendation') is null or (_payload->>'recommendation') not in ('recommend','not_recommend','conditional') then raise exception 'Visit report and recommendation required'; end if;
        update public.evc_visits set report=_reason,recommendation=_payload->>'recommendation',completed_at=now()
        where application_id=_id and coordinator_id=uid and completed_at is null and scheduled_for<=now();
        if not found then raise exception 'Only the assigned coordinator may report after the scheduled visit'; end if; nxt:='pending_decision';
      end if;
    elsif _action in ('approve','reject') then
      role_for_action:='regional_officer';
      if not (fp_private.has_role('regional_officer',a.region) or fp_private.has_role('national_admin')) then raise exception 'Decision jurisdiction required' using errcode='42501'; end if;
      if a.status<>'pending_decision' or coalesce(length(_reason),0)<10 then raise exception 'Pending decision and a reason are required'; end if;
      if jsonb_array_length(fp_private.missing(_id))>0 or not exists(select 1 from public.application_documents where id::text=_payload->>'evidence' and application_id=_id and scan_status='clean') then raise exception 'Reference a clean document from this case'; end if;
      if a.evc_required and not exists(select 1 from public.evc_visits where application_id=_id and completed_at is not null) then raise exception 'EVC report required'; end if;
      nxt:=case _action when 'approve' then 'approved'::public.app_status else 'rejected'::public.app_status end;
      update public.applications set decision_reason=_reason,decision_evidence=_payload->>'evidence',decided_by=uid,decided_at=now() where id=_id;
      if _action='approve' then
        insert into public.obligations(institution_id,application_id,kind,title,due_date,region)
        values(a.institution_id,_id,'renewal','Demo annual renewal: '||a.title,current_date+365,a.region);
        insert into public.obligations(institution_id,application_id,kind,title,due_date,region)
        select a.institution_id,_id,'undertaking',u,current_date+90,a.region from jsonb_array_elements_text(a.template_snapshot->'undertakings') u;
      end if;
    else raise exception 'Unknown transition'; end if;
  end if;
  update public.applications set status=nxt,version=version+1,updated_at=now(),stage_entered_at=now(),
    sla_due_at=case when nxt in ('approved','rejected') then null else now()+make_interval(days=>case when nxt='deficiency_raised' then 30 when nxt in ('evc_pending','evc_scheduled') then 21 else 15 end) end where id=_id;
  perform fp_private.event(_id,_action,a.status,nxt,_reason,_payload||jsonb_build_object('request_id',_request_id,'demo',true,'authorization_role',role_for_action));
  insert into public.notifications(user_id,title,body) values(a.owner_id,'Demo case '||a.ref_no||': '||replace(nxt::text,'_',' '),coalesce(left(_reason,200),'Workflow updated'));
  result:=jsonb_build_object('id',_id,'status',nxt,'version',a.version+1);
  insert into fp_private.transition_receipts(request_id,actor_id,application_id,input,result) values(_request_id,uid,_id,body,result);
  return result;
end $$;

create function fp_private.checklist(_id uuid,_item text,_passed boolean,_note text) returns void language plpgsql security definer set search_path='' as $$
declare a public.applications;
begin
  select * into a from public.applications where id=_id for update;
  if a.id is null or a.status<>'under_scrutiny' or a.assigned_officer is distinct from fp_private.actor() or a.owner_id=auth.uid() or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501'; end if;
  if _item is null or not (a.template_snapshot->'checklist') ? _item or _passed is null or length(coalesce(_note,''))>500 then raise exception 'Invalid checklist item'; end if;
  insert into public.checklist_items(application_id,item,passed,note,checked_by) values(_id,_item,_passed,_note,auth.uid())
    on conflict(application_id,item) do update set passed=excluded.passed,note=excluded.note,checked_by=excluded.checked_by,updated_at=now();
  update public.applications set version=version+1,updated_at=now() where id=_id;
  perform fp_private.event(_id,'checklist',a.status,a.status,_note,jsonb_build_object('item',_item,'passed',_passed));
end $$;
create function fp_private.reserve_document(_id uuid,_type text,_name text,_mime text,_size int) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.applications; doc uuid:=gen_random_uuid(); extension text;
begin
  select * into a from public.applications where id=_id for update;
  if not fp_private.can_edit(_id) then raise exception 'Application is locked' using errcode='42501'; end if;
  if not (a.template_snapshot->'required_documents') ? _type or _name is null or length(_name) not between 1 and 180 or _name ~ '[[:cntrl:]/\\]' or _mime not in ('application/pdf','image/png','image/jpeg') or _mime is null or _size is null or _size not between 1 and 10485760 then raise exception 'Invalid document'; end if;
  if (select count(*) from public.application_documents where application_id=_id)>49 then raise exception 'Document limit reached'; end if;
  extension:=case _mime when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end;
  insert into public.application_documents(id,application_id,owner_id,doc_type,file_path,file_name,mime_type,size_bytes)
    values(doc,_id,fp_private.actor(),_type,auth.uid()::text||'/'||_id::text||'/'||doc::text||extension,_name,_mime,_size);
  perform fp_private.event(_id,'document_reserved',a.status,a.status,_type,jsonb_build_object('document_id',doc)); return doc;
end $$;
create function fp_private.complete_document(_id uuid,_sha256 text,_clean boolean,_engine text) returns void language plpgsql security definer set search_path='' as $$
declare d public.application_documents;
begin
  select * into d from public.application_documents where id=_id for update;
  if d.id is null or d.scan_status<>'pending' or _clean is null or _sha256 is null or _sha256 !~ '^[a-f0-9]{64}$' or coalesce(length(_engine),0)<3 then raise exception 'Invalid scan completion'; end if;
  if not exists(select 1 from storage.objects o where o.name=d.file_path and o.bucket_id='application-docs' and (o.metadata->>'size')::bigint=d.size_bytes and o.metadata->>'mimetype'=d.mime_type) then raise exception 'Uploaded bytes and metadata do not match'; end if;
  update public.application_documents set scan_status=case when _clean then 'clean' else 'rejected' end,sha256=_sha256,scanned_at=now(),scan_engine=left(_engine,120) where id=_id;
  insert into public.application_events(application_id,actor_role,action,payload) values(d.application_id,'scanner','document_scanned',jsonb_build_object('document_id',_id,'clean',_clean,'sha256',_sha256,'engine',_engine));
end $$;
create function fp_private.mark_read(_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin update public.notifications set read_at=coalesce(read_at,now()) where id=_id and user_id=fp_private.actor(); end $$;
create function fp_private.fulfil(_id uuid,_reason text) returns void language plpgsql security definer set search_path='' as $$
declare o public.obligations;
begin
  select * into o from public.obligations where id=_id for update;
  if o.id is null or not (fp_private.has_role('regional_officer',o.region) or fp_private.has_role('national_admin')) or coalesce(length(trim(_reason)),0)<10 or o.status='fulfilled' then raise exception 'Decision jurisdiction and a verification reason required'; end if;
  update public.obligations set status='fulfilled' where id=_id;
  perform fp_private.event(o.application_id,'obligation_fulfilled',null,null,_reason,jsonb_build_object('obligation_id',_id));
end $$;

-- Only trusted administration can provision staff; metadata is never an authority.
create function fp_private.assign_role(_user uuid,_role public.app_role,_region text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not fp_private.has_role('national_admin') then raise exception 'Administrator required' using errcode='42501'; end if;
  insert into public.user_roles(user_id,role,region) values(_user,_role,_region) on conflict(user_id,role) do update set region=excluded.region,active=true;
  insert into public.config_audit(actor_id,action,detail) values(fp_private.actor(),'assign_role',jsonb_build_object('user',_user,'role',_role,'region',_region));
end $$;
create or replace function public.block_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Audit log is append-only'; end $$;
create trigger config_audit_immutable before update or delete on public.config_audit for each row execute function public.block_mutation();
revoke truncate on public.application_events,public.config_audit from public,anon,authenticated,service_role;

-- Private evidence: reserved paths only, immutable objects, clean downloads only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('application-docs','application-docs',false,10485760,array['application/pdf','image/png','image/jpeg'])
  on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "docs upload own folder" on storage.objects;
drop policy if exists "docs read if can view" on storage.objects;
drop policy if exists "docs delete own" on storage.objects;
create policy reserved_upload on storage.objects for insert to authenticated with check(bucket_id='application-docs' and exists(
  select 1 from public.application_documents d where d.file_path=name and d.owner_id=fp_private.actor() and d.scan_status='pending' and fp_private.can_edit(d.application_id)));
create policy clean_download on storage.objects for select to authenticated using(bucket_id='application-docs' and exists(
  select 1 from public.application_documents d where d.file_path=name and d.scan_status='clean' and fp_private.can_view(d.application_id)));

-- Public, typed RPC facades. No public SECURITY DEFINER endpoint is exposed.
create function public.fp_create_institution(_name text,_ref text,_region text,_state text) returns void language sql security invoker set search_path='' as $$ select fp_private.create_institution(_name,_ref,_region,_state) $$;
create function public.fp_create_application(_type public.app_type,_title text) returns uuid language sql security invoker set search_path='' as $$ select fp_private.create_application(_type,_title) $$;
create function public.fp_save_draft(_id uuid,_title text,_form jsonb,_version int) returns void language sql security invoker set search_path='' as $$ select fp_private.save_draft(_id,_title,_form,_version) $$;
create function public.fp_transition(_id uuid,_action text,_reason text,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select fp_private.transition(_id,_action,_reason,_payload,_expected_version,_request_id) $$;
create function public.fp_checklist(_id uuid,_item text,_passed boolean,_note text) returns void language sql security invoker set search_path='' as $$ select fp_private.checklist(_id,_item,_passed,_note) $$;
create function public.fp_reserve_document(_id uuid,_type text,_name text,_mime text,_size int) returns uuid language sql security invoker set search_path='' as $$ select fp_private.reserve_document(_id,_type,_name,_mime,_size) $$;
create function public.fp_missing(_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select fp_private.missing(_id) $$;
create function public.fp_mark_read(_id uuid) returns void language sql security invoker set search_path='' as $$ select fp_private.mark_read(_id) $$;
create function public.fp_fulfil(_id uuid,_reason text) returns void language sql security invoker set search_path='' as $$ select fp_private.fulfil(_id,_reason) $$;
create function public.fp_assign_role(_user uuid,_role public.app_role,_region text) returns void language sql security invoker set search_path='' as $$ select fp_private.assign_role(_user,_role,_region) $$;
create function public.fp_complete_document(_id uuid,_sha256 text,_clean boolean,_engine text) returns void language sql security invoker set search_path='' as $$ select fp_private.complete_document(_id,_sha256,_clean,_engine) $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('fp_private','public') loop
    if f.nspname='fp_private' or f.proname like 'fp\_%' then
      execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
      if f.proname not in ('complete_document','fp_complete_document','event') then execute format('grant execute on function %s to authenticated',f.signature); end if;
    end if;
  end loop;
end $$;
grant execute on function fp_private.complete_document(uuid,text,boolean,text),public.fp_complete_document(uuid,text,boolean,text) to service_role;
-- Explicitly remove Data API grants for anonymous callers even when defaults grant them.
revoke all on all tables in schema public from anon;
notify pgrst,'reload schema';
commit;
