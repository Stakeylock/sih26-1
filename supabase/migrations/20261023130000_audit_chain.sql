begin;

alter table public.application_events
  add column sequence int,
  add column prev_hash text,
  add column event_hash text;

create function fp_private.audit_hash(_event jsonb) returns text
language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(jsonb_build_array(
    _event->>'application_id',
    (_event->>'sequence')::int,
    coalesce(_event->>'prev_hash',''),
    coalesce(_event->>'actor_id',''),
    coalesce(_event->>'actor_role',''),
    _event->>'action',
    coalesce(_event->>'from_status',''),
    coalesce(_event->>'to_status',''),
    coalesce(_event->>'reason',''),
    coalesce(_event->'payload','{}'::jsonb),
    to_char((_event->>'created_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text,'UTF8')),'hex')
$$;

alter table public.application_events disable trigger trg_events_immutable;

do $$
declare
  target uuid;
  ev record;
  n int;
  previous text;
  hash text;
begin
  for target in select distinct application_id from public.application_events loop
    n := 0;
    previous := '';
    for ev in
      select * from public.application_events
      where application_id=target
      order by created_at,id
    loop
      n := n + 1;
      hash := fp_private.audit_hash(to_jsonb(ev) || jsonb_build_object('sequence',n,'prev_hash',previous));
      update public.application_events
      set sequence=n,prev_hash=previous,event_hash=hash
      where id=ev.id;
      previous := hash;
    end loop;
  end loop;
end $$;

alter table public.application_events enable trigger trg_events_immutable;

alter table public.application_events
  alter column sequence set not null,
  alter column prev_hash set not null,
  alter column event_hash set not null;

alter table public.application_events
  add constraint event_chain_shape check (
    sequence > 0
    and event_hash ~ '^[a-f0-9]{64}$'
    and ((sequence = 1 and prev_hash = '') or (sequence > 1 and prev_hash ~ '^[a-f0-9]{64}$'))
  );

create unique index application_event_sequence
  on public.application_events(application_id,sequence);

create function fp_private.append_event(
  _application uuid,
  _actor uuid,
  _actor_role text,
  _action text,
  _from_state public.app_status,
  _to_state public.app_status,
  _reason text,
  _detail jsonb
) returns void
language plpgsql security definer set search_path='' as $$
declare
  next_sequence int;
  previous text;
  recorded_at timestamptz := clock_timestamp();
  hash text;
begin
  if _application is null or not exists(select 1 from public.applications where id=_application) then
    raise exception 'Application unavailable' using errcode='42501';
  end if;
  if coalesce(length(_action),0) not between 1 and 200 then
    raise exception 'Invalid audit action';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_application::text,0));

  select coalesce(max(sequence),0)+1 into next_sequence
  from public.application_events where application_id=_application;

  select coalesce((
    select event_hash from public.application_events
    where application_id=_application
    order by sequence desc limit 1
  ),'') into previous;

  hash := fp_private.audit_hash(jsonb_build_object(
    'application_id',_application,
    'sequence',next_sequence,
    'prev_hash',previous,
    'actor_id',_actor,
    'actor_role',_actor_role,
    'action',_action,
    'from_status',_from_state,
    'to_status',_to_state,
    'reason',_reason,
    'payload',coalesce(_detail,'{}'::jsonb),
    'created_at',recorded_at
  ));

  insert into public.application_events(
    application_id,actor_id,actor_role,action,from_status,to_status,reason,payload,
    sequence,prev_hash,event_hash,created_at
  ) values(
    _application,_actor,_actor_role,_action,_from_state,_to_state,_reason,coalesce(_detail,'{}'::jsonb),
    next_sequence,previous,hash,recorded_at
  );
end $$;

create or replace function fp_private.event(
  app uuid,
  action text,
  old_state public.app_status,
  new_state public.app_status,
  reason text default null,
  detail jsonb default '{}'
) returns void
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := fp_private.actor();
  selected_role text;
begin
  select role::text into selected_role
  from public.user_roles
  where user_id=auth.uid() and active
  order by case role
    when 'national_admin' then 1
    when 'regional_officer' then 2
    when 'evc_coordinator' then 3
    when 'scrutiny_officer' then 4
    else 5
  end
  limit 1;

  perform fp_private.append_event(app,uid,selected_role,action,old_state,new_state,reason,detail);
end $$;

create or replace function fp_private.complete_document(_id uuid,_sha256 text,_clean boolean,_engine text)
returns void language plpgsql security definer set search_path='' as $$
declare d public.application_documents;
begin
  select * into d from public.application_documents where id=_id for update;
  if d.id is null or d.scan_status<>'pending' or _clean is null or _sha256 is null or _sha256 !~ '^[a-f0-9]{64}$' or coalesce(length(_engine),0)<3 then raise exception 'Invalid scan completion'; end if;
  if not exists(select 1 from storage.objects o where o.name=d.file_path and o.bucket_id='application-docs' and (o.metadata->>'size')::bigint=d.size_bytes and o.metadata->>'mimetype'=d.mime_type) then raise exception 'Uploaded bytes and metadata do not match'; end if;
  update public.application_documents set scan_status=case when _clean then 'clean' else 'rejected' end,sha256=_sha256,scanned_at=now(),scan_engine=left(_engine,120) where id=_id;
  perform fp_private.append_event(d.application_id,null,'scanner','document_scanned',null,null,null,
    jsonb_build_object('document_id',_id,'clean',_clean,'sha256',_sha256,'engine',_engine));
end $$;

create function fp_private.verify_audit_rows(_application uuid,_events jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  event jsonb;
  checked int := 0;
  previous text := '';
  expected text;
begin
  if jsonb_typeof(_events) <> 'array' then raise exception 'Audit events must be an array'; end if;

  for event in
    select value from jsonb_array_elements(_events)
    order by coalesce((value->>'sequence')::int,2147483647)
  loop
    if (event->>'application_id') is distinct from _application::text
       or coalesce((event->>'sequence')::int,0) <> checked+1
       or coalesce(event->>'prev_hash','') <> previous then
      return jsonb_build_object('intact',false,'checked',checked,'head',nullif(previous,''),'broken_at',checked+1);
    end if;

    expected := fp_private.audit_hash(jsonb_set(event,'{prev_hash}',to_jsonb(previous),true));
    if event->>'event_hash' is distinct from expected then
      return jsonb_build_object('intact',false,'checked',checked,'head',nullif(previous,''),'broken_at',checked+1);
    end if;

    checked := checked + 1;
    previous := expected;
  end loop;

  return jsonb_build_object('intact',true,'checked',checked,'head',nullif(previous,''),'broken_at',null);
end $$;

create function fp_private.verify_audit_chain(_application uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb;
begin
  if not exists(select 1 from public.applications where id=_application) or not fp_private.can_view(_application) then
    raise exception 'Application unavailable' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence),'[]'::jsonb) into rows
  from public.application_events e where e.application_id=_application;
  return fp_private.verify_audit_rows(_application,rows);
end $$;

create function fp_private.demo_tamper_replay(_application uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  a public.applications;
  rows jsonb;
  tampered jsonb;
  target int;
  result jsonb;
begin
  select * into a from public.applications where id=_application;
  if a.id is null or not a.is_demo then
    raise exception 'Tamper replay is available for demo cases only' using errcode='42501';
  end if;
  if a.owner_id=fp_private.actor() or not (
    fp_private.has_role('scrutiny_officer',a.region)
    or fp_private.has_role('regional_officer',a.region)
    or fp_private.has_role('national_admin')
  ) then
    raise exception 'Review or decision authority required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence),'[]'::jsonb) into rows
  from public.application_events e where e.application_id=_application;

  if jsonb_array_length(rows)=0 then return fp_private.verify_audit_rows(_application,rows); end if;

  target := greatest(1,(jsonb_array_length(rows)+1)/2);
  tampered := jsonb_set(
    rows,
    array[(target-1)::text,'reason'],
    to_jsonb(coalesce(rows->(target-1)->>'reason','Synthetic event') || ' [tamper replay on copy]'),
    true
  );
  result := fp_private.verify_audit_rows(_application,tampered);
  return result || jsonb_build_object('replay',true,'tampered_at',target);
end $$;

create or replace function fp_private.integrity_gate(_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce((fp_private.verify_audit_chain(_id)->>'intact')::boolean,false) then
    raise exception 'The audit chain is broken';
  end if;
  if not exists(select 1 from public.application_claims where application_id=_id) then return; end if;
  if exists(select 1 from public.application_claims c join public.requirements r on r.id=c.requirement_id where c.application_id=_id and r.is_mandatory and c.status not in ('verified','not_applicable')) then raise exception 'Every mandatory claim must be verified or not applicable'; end if;
  if exists(select 1 from public.deficiencies where application_id=_id and status in ('open','escalated')) then raise exception 'Resolve or waive every open deficiency'; end if;
  if exists(select 1 from public.integrity_signals where application_id=_id and disposition='confirmed') then raise exception 'A confirmed integrity signal blocks this decision'; end if;
  if exists(select 1 from public.application_claims c where c.application_id=_id and c.status='verified' and c.verification_method<>'system_check' and not exists(select 1 from public.claim_evidence ce join public.application_documents d on d.id=ce.document_id where ce.claim_id=c.id and d.scan_status='clean' and (d.expires_on is null or d.expires_on>=current_date))) then raise exception 'Every verified claim needs current clean evidence'; end if;
end $$;

create function public.fp_verify_audit_chain(_application uuid) returns jsonb
language sql security invoker set search_path='' as $$ select fp_private.verify_audit_chain(_application) $$;

create function public.fp_demo_tamper_replay(_application uuid) returns jsonb
language sql security invoker set search_path='' as $$ select fp_private.demo_tamper_replay(_application) $$;

revoke all on function fp_private.audit_hash(jsonb),fp_private.append_event(uuid,uuid,text,text,public.app_status,public.app_status,text,jsonb),fp_private.verify_audit_rows(uuid,jsonb),fp_private.verify_audit_chain(uuid),fp_private.demo_tamper_replay(uuid) from public,anon,authenticated;
revoke all on function public.fp_verify_audit_chain(uuid),public.fp_demo_tamper_replay(uuid) from public,anon,authenticated;
grant execute on function fp_private.verify_audit_chain(uuid),fp_private.demo_tamper_replay(uuid) to authenticated;
grant execute on function public.fp_verify_audit_chain(uuid),public.fp_demo_tamper_replay(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
