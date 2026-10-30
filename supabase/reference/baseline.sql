
-- ============ ENUMS ============
create type public.app_role as enum ('institution','scrutiny_officer','evc_coordinator','evc_member','regional_officer','national_admin');
create type public.app_type as enum ('extension_self_disclosure','name_change','new_programme');
create type public.app_status as enum ('draft','submitted','under_scrutiny','deficiency_raised','resubmitted','evc_pending','evc_scheduled','pending_decision','approved','rejected');

-- ============ PROFILES & ROLES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  region text, -- null = national scope
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_officer(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role <> 'institution')
$$;

-- officer can see region if national admin, or any officer role whose region is null or equal
create or replace function public.officer_in_region(_user_id uuid, _region text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role <> 'institution'
      and (role = 'national_admin' or region is null or region = _region)
  )
$$;

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_officer(auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own roles read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'national_admin'));

-- signup: ALWAYS institution role only. Privileged roles never come from metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(left(new.raw_user_meta_data->>'full_name', 120), ''), coalesce(new.email,''));
  insert into public.user_roles (user_id, role) values (new.id, 'institution');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============ INSTITUTIONS ============
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique,
  name text not null check (char_length(name) between 3 and 200),
  aicte_ref text,
  region text not null check (region in ('North','South','East','West','Central','North-East')),
  state text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.institutions to authenticated;
grant all on public.institutions to service_role;
alter table public.institutions enable row level security;
create policy "inst owner read" on public.institutions for select to authenticated using (owner_id = auth.uid() or public.officer_in_region(auth.uid(), region));
create policy "inst owner insert" on public.institutions for insert to authenticated with check (owner_id = auth.uid() and public.has_role(auth.uid(),'institution'));
create policy "inst owner update" on public.institutions for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ============ WORKFLOW TEMPLATES ============
create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  app_type public.app_type not null,
  version int not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  name text not null,
  definition jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (app_type, version)
);
grant select on public.workflow_templates to authenticated;
grant all on public.workflow_templates to service_role;
alter table public.workflow_templates enable row level security;
create policy "templates read published or admin" on public.workflow_templates for select to authenticated
  using (status = 'published' or public.has_role(auth.uid(),'national_admin') or public.is_officer(auth.uid()));

create table public.config_audit (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.workflow_templates(id),
  actor_id uuid not null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
grant select on public.config_audit to authenticated;
grant all on public.config_audit to service_role;
alter table public.config_audit enable row level security;
create policy "config audit admin read" on public.config_audit for select to authenticated using (public.has_role(auth.uid(),'national_admin'));

-- ============ APPLICATIONS ============
create sequence public.app_ref_seq start 1001;
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default ('FP-' || to_char(now(),'YYYY') || '-' || nextval('public.app_ref_seq')),
  institution_id uuid not null references public.institutions(id),
  owner_id uuid not null,
  app_type public.app_type not null,
  title text not null,
  status public.app_status not null default 'draft',
  region text not null,
  template_id uuid not null references public.workflow_templates(id),
  template_version int not null,
  template_snapshot jsonb not null,
  form_data jsonb not null default '{}',
  evc_required boolean not null default false,
  assigned_officer uuid,
  submitted_at timestamptz,
  stage_entered_at timestamptz not null default now(),
  sla_due_at timestamptz,
  decision_reason text,
  decision_evidence text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- No direct INSERT/UPDATE/DELETE grants: all mutations go through SECURITY DEFINER RPCs.
grant select on public.applications to authenticated;
grant all on public.applications to service_role;
alter table public.applications enable row level security;
create policy "app read scoped" on public.applications for select to authenticated
  using (owner_id = auth.uid() or public.officer_in_region(auth.uid(), region));

create or replace function public.can_view_application(_app uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.applications a where a.id = _app
    and (a.owner_id = auth.uid() or public.officer_in_region(auth.uid(), a.region)))
$$;

-- ============ DOCUMENTS ============
create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  owner_id uuid not null,
  doc_type text not null,
  file_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes int not null,
  expires_on date,
  uploaded_at timestamptz not null default now()
);
grant select, insert, delete on public.application_documents to authenticated;
grant all on public.application_documents to service_role;
alter table public.application_documents enable row level security;
create policy "docs read" on public.application_documents for select to authenticated using (public.can_view_application(application_id));
create policy "docs insert owner editable" on public.application_documents for insert to authenticated
  with check (owner_id = auth.uid() and file_path like (auth.uid()::text || '/%') and exists (
    select 1 from public.applications a where a.id = application_id and a.owner_id = auth.uid() and a.status in ('draft','deficiency_raised')));
create policy "docs delete owner draft" on public.application_documents for delete to authenticated
  using (owner_id = auth.uid() and exists (select 1 from public.applications a where a.id = application_id and a.status in ('draft','deficiency_raised')));

create or replace function public.validate_document()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.mime_type not in ('application/pdf','image/png','image/jpeg') then raise exception 'Unsupported file type'; end if;
  if new.size_bytes <= 0 or new.size_bytes > 10485760 then raise exception 'File must be under 10 MB'; end if;
  return new;
end $$;
create trigger trg_validate_document before insert on public.application_documents for each row execute function public.validate_document();

-- ============ AUDIT (append-only) ============
create table public.application_events (
  id bigserial primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_id uuid,
  actor_role text,
  action text not null,
  from_status public.app_status,
  to_status public.app_status,
  reason text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
grant select on public.application_events to authenticated;
grant all on public.application_events to service_role;
alter table public.application_events enable row level security;
create policy "events read" on public.application_events for select to authenticated using (public.can_view_application(application_id));
create or replace function public.block_mutation() returns trigger language plpgsql as $$
begin raise exception 'Audit log is append-only'; end $$;
create trigger trg_events_immutable before update or delete on public.application_events for each row execute function public.block_mutation();

-- ============ CHECKLIST, EVC ============
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  item text not null,
  passed boolean,
  note text,
  checked_by uuid,
  updated_at timestamptz not null default now(),
  unique (application_id, item)
);
grant select on public.checklist_items to authenticated;
grant all on public.checklist_items to service_role;
alter table public.checklist_items enable row level security;
create policy "checklist read" on public.checklist_items for select to authenticated using (public.can_view_application(application_id));

create table public.evc_visits (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  coordinator_id uuid not null,
  scheduled_for timestamptz not null,
  report text,
  recommendation text check (recommendation in ('recommend','not_recommend','conditional')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.evc_visits to authenticated;
grant all on public.evc_visits to service_role;
alter table public.evc_visits enable row level security;
create policy "evc read" on public.evc_visits for select to authenticated using (public.can_view_application(application_id));

-- ============ COMPLIANCE & NOTIFICATIONS ============
create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  kind text not null check (kind in ('undertaking','renewal','document_expiry')),
  title text not null,
  due_date date not null,
  status text not null default 'open' check (status in ('open','fulfilled','escalated')),
  deadline_source text not null default 'demo_sla' check (deadline_source in ('demo_sla','official_reference')),
  region text not null,
  created_at timestamptz not null default now()
);
grant select on public.obligations to authenticated;
grant all on public.obligations to service_role;
alter table public.obligations enable row level security;
create policy "obligations read" on public.obligations for select to authenticated using (
  exists (select 1 from public.institutions i where i.id = institution_id and i.owner_id = auth.uid())
  or public.officer_in_region(auth.uid(), region));

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notif own read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.notify(_user uuid, _title text, _body text, _link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link) values (_user, _title, _body, _link);
$$;
revoke execute on function public.notify(uuid,text,text,text) from public, anon, authenticated;

-- notify officers in region with a role
create or replace function public.notify_role(_role public.app_role, _region text, _title text, _body text, _link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link)
  select distinct user_id, _title, _body, _link from public.user_roles
  where role = _role and (region is null or region = _region);
$$;
revoke execute on function public.notify_role(public.app_role,text,text,text,text) from public, anon, authenticated;

-- document expiry -> obligation
create or replace function public.doc_expiry_obligation()
returns trigger language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if new.expires_on is not null then
    select app.institution_id, app.region into a from public.applications app where app.id = new.application_id;
    insert into public.obligations (institution_id, application_id, kind, title, due_date, region, deadline_source)
    values (a.institution_id, new.application_id, 'document_expiry', 'Renew document: ' || new.doc_type, new.expires_on, a.region, 'demo_sla');
  end if;
  return new;
end $$;
create trigger trg_doc_expiry after insert on public.application_documents for each row execute function public.doc_expiry_obligation();

-- ============ STORAGE POLICIES ============
create policy "docs upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'application-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs read if can view" on storage.objects for select to authenticated
  using (bucket_id = 'application-docs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.application_documents d where d.file_path = name and public.can_view_application(d.application_id))));
create policy "docs delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'application-docs' and (storage.foldername(name))[1] = auth.uid()::text);


-- ============ HELPERS ============
create or replace function public.primary_role(_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.user_roles where user_id = _uid
  order by case role when 'national_admin' then 1 when 'regional_officer' then 2 when 'evc_coordinator' then 3 when 'scrutiny_officer' then 4 else 5 end limit 1
$$;

create or replace function public.log_event(_app uuid, _action text, _from public.app_status, _to public.app_status, _reason text, _payload jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.application_events (application_id, actor_id, actor_role, action, from_status, to_status, reason, payload)
  values (_app, auth.uid(), public.primary_role(auth.uid()), _action, _from, _to, _reason, coalesce(_payload,'{}'));
$$;
revoke execute on function public.log_event(uuid,text,public.app_status,public.app_status,text,jsonb) from public, anon, authenticated;

create or replace function public.validate_definition(_def jsonb)
returns void language plpgsql immutable as $$
declare keys text[];
begin
  select array_agg(s->>'key') into keys from jsonb_array_elements(coalesce(_def->'stages','[]')) s;
  if keys is null or not ('submission' = any(keys)) or not ('scrutiny' = any(keys)) or not ('decision' = any(keys)) then
    raise exception 'Template must contain submission, scrutiny and decision stages';
  end if;
  if (_def->>'evc_mode') not in ('none','conditional','required') then raise exception 'evc_mode must be none, conditional or required'; end if;
  if (_def->>'evc_mode') <> 'none' and not ('evc' = any(keys)) then raise exception 'EVC stage required when evc_mode is not none'; end if;
  if (_def->>'evc_mode') = 'none' and ('evc' = any(keys)) then raise exception 'Remove EVC stage when evc_mode is none'; end if;
  if exists (select 1 from jsonb_array_elements(_def->'stages') s where s->>'key'='decision' and s->>'role' not in ('regional_officer','national_admin')) then
    raise exception 'Final decision must be assigned to a human regional officer or national administrator';
  end if;
  if coalesce((_def->>'auto_approve')::boolean,false) then raise exception 'Automatic approval is not permitted'; end if;
end $$;

create or replace function public.stage_sla_days(_def jsonb, _stage text)
returns int language sql immutable as $$
  select coalesce((select (s->>'sla_days')::int from jsonb_array_elements(_def->'stages') s where s->>'key' = _stage limit 1), 15)
$$;

-- ============ INSTITUTION RPCs ============
create or replace function public.create_application(_type public.app_type, _title text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inst record; tpl record; new_id uuid;
begin
  if not public.has_role(auth.uid(),'institution') then raise exception 'Only institutions can create applications'; end if;
  if _title is null or char_length(trim(_title)) < 5 or char_length(_title) > 200 then raise exception 'Title must be 5-200 characters'; end if;
  select * into inst from public.institutions where owner_id = auth.uid();
  if inst is null then raise exception 'Complete your institution profile first'; end if;
  select * into tpl from public.workflow_templates where app_type = _type and status = 'published' order by version desc limit 1;
  if tpl is null then raise exception 'No published workflow for this application type'; end if;
  insert into public.applications (institution_id, owner_id, app_type, title, region, template_id, template_version, template_snapshot)
  values (inst.id, auth.uid(), _type, trim(_title), inst.region, tpl.id, tpl.version, tpl.definition)
  returning id into new_id;
  perform public.log_event(new_id, 'created', null, 'draft', null, jsonb_build_object('template_version', tpl.version));
  return new_id;
end $$;

create or replace function public.save_draft(_id uuid, _title text, _form jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.applications where id = _id for update;
  if a is null or a.owner_id <> auth.uid() then raise exception 'Not found'; end if;
  if a.status not in ('draft','deficiency_raised') then raise exception 'Application is locked in status %', a.status; end if;
  if char_length(coalesce(trim(_title),'')) < 5 then raise exception 'Title must be at least 5 characters'; end if;
  if jsonb_typeof(_form) <> 'object' or pg_column_size(_form) > 50000 then raise exception 'Invalid form data'; end if;
  update public.applications set title = trim(_title), form_data = _form, updated_at = now() where id = _id;
end $$;

create or replace function public.missing_inputs(_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; missing jsonb := '[]'; f jsonb; d text;
begin
  select * into a from public.applications where id = _id;
  for f in select * from jsonb_array_elements(coalesce(a.template_snapshot->'required_fields','[]')) loop
    if coalesce(trim(a.form_data->>(f->>'key')),'') = '' then missing := missing || jsonb_build_array('field:' || (f->>'label')); end if;
  end loop;
  for d in select jsonb_array_elements_text(coalesce(a.template_snapshot->'required_documents','[]')) loop
    if not exists (select 1 from public.application_documents x where x.application_id = _id and x.doc_type = d) then
      missing := missing || jsonb_build_array('document:' || d); end if;
  end loop;
  return missing;
end $$;

create or replace function public.submit_application(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; m jsonb;
begin
  select * into a from public.applications where id = _id for update;
  if a is null or a.owner_id <> auth.uid() then raise exception 'Not found'; end if;
  if a.status <> 'draft' then raise exception 'Only drafts can be submitted'; end if;
  m := public.missing_inputs(_id);
  if jsonb_array_length(m) > 0 then raise exception 'Missing required inputs: %', m; end if;
  update public.applications set status = 'submitted', submitted_at = now(), stage_entered_at = now(),
    sla_due_at = now() + make_interval(days => public.stage_sla_days(a.template_snapshot,'scrutiny')), updated_at = now() where id = _id;
  perform public.log_event(_id, 'submitted', 'draft', 'submitted', null, '{}');
  perform public.notify_role('scrutiny_officer', a.region, 'New application ' || a.ref_no, a.title, '/review/' || _id);
end $$;

create or replace function public.resubmit_application(_id uuid, _response text)
returns void language plpgsql security definer set search_path = public as $$
declare a record; m jsonb;
begin
  select * into a from public.applications where id = _id for update;
  if a is null or a.owner_id <> auth.uid() then raise exception 'Not found'; end if;
  if a.status <> 'deficiency_raised' then raise exception 'No open deficiency on this application'; end if;
  if char_length(coalesce(trim(_response),'')) < 10 then raise exception 'Response must be at least 10 characters'; end if;
  m := public.missing_inputs(_id);
  if jsonb_array_length(m) > 0 then raise exception 'Missing required inputs: %', m; end if;
  update public.applications set status = 'resubmitted', stage_entered_at = now(),
    sla_due_at = now() + make_interval(days => public.stage_sla_days(a.template_snapshot,'scrutiny')), updated_at = now() where id = _id;
  perform public.log_event(_id, 'resubmitted', 'deficiency_raised', 'resubmitted', trim(_response), '{}');
  if a.assigned_officer is not null then perform public.notify(a.assigned_officer, 'Resubmission ' || a.ref_no, left(_response,200), '/review/' || _id); end if;
end $$;

-- ============ OFFICER STATE MACHINE ============
-- Every officer transition is validated here: role, region, from-status, reason. Atomic with audit.
create or replace function public.officer_action(_id uuid, _action text, _reason text default null, _payload jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare a record; uid uuid := auth.uid(); nxt public.app_status; evc_mode text; want_evc boolean; ts timestamptz;
begin
  select * into a from public.applications where id = _id for update;
  if a is null or not public.officer_in_region(uid, a.region) then raise exception 'Not found or outside your jurisdiction'; end if;
  evc_mode := a.template_snapshot->>'evc_mode';
  _reason := nullif(trim(coalesce(_reason,'')),'');

  if _action = 'start_scrutiny' then
    if not public.has_role(uid,'scrutiny_officer') then raise exception 'Requires scrutiny officer role'; end if;
    if a.status not in ('submitted','resubmitted') then raise exception 'Illegal transition from %', a.status; end if;
    nxt := 'under_scrutiny';
    update public.applications set assigned_officer = uid where id = _id;

  elsif _action = 'raise_deficiency' then
    if not public.has_role(uid,'scrutiny_officer') then raise exception 'Requires scrutiny officer role'; end if;
    if a.status <> 'under_scrutiny' then raise exception 'Illegal transition from %', a.status; end if;
    if _reason is null or char_length(_reason) < 10 then raise exception 'A deficiency reason (min 10 chars) is mandatory'; end if;
    nxt := 'deficiency_raised';
    perform public.notify(a.owner_id, 'Deficiency raised on ' || a.ref_no, left(_reason,200), '/applications/' || _id);

  elsif _action = 'pass_scrutiny' then
    if not public.has_role(uid,'scrutiny_officer') then raise exception 'Requires scrutiny officer role'; end if;
    if a.status <> 'under_scrutiny' then raise exception 'Illegal transition from %', a.status; end if;
    if exists (select 1 from public.checklist_items c where c.application_id = _id and c.passed is false) then
      raise exception 'Checklist has failed items; raise a deficiency instead'; end if;
    if (select count(*) from public.checklist_items c where c.application_id = _id and c.passed is true)
       < jsonb_array_length(coalesce(a.template_snapshot->'checklist','[]')) then
      raise exception 'Complete every checklist item before passing scrutiny'; end if;
    want_evc := case evc_mode when 'required' then true when 'conditional' then coalesce((_payload->>'evc')::boolean,false) else false end;
    if evc_mode = 'none' and coalesce((_payload->>'evc')::boolean,false) then raise exception 'This workflow does not route to EVC'; end if;
    if evc_mode = 'conditional' and want_evc and _reason is null then raise exception 'Give a reason for EVC assignment'; end if;
    nxt := case when want_evc then 'evc_pending'::public.app_status else 'pending_decision'::public.app_status end;
    update public.applications set evc_required = want_evc where id = _id;
    if want_evc then perform public.notify_role('evc_coordinator', a.region, 'EVC needed: ' || a.ref_no, a.title, '/review/' || _id);
    else perform public.notify_role('regional_officer', a.region, 'Decision pending: ' || a.ref_no, a.title, '/review/' || _id); end if;

  elsif _action = 'schedule_evc' then
    if not public.has_role(uid,'evc_coordinator') then raise exception 'Requires EVC coordinator role'; end if;
    if a.status <> 'evc_pending' then raise exception 'Illegal transition from %', a.status; end if;
    ts := (_payload->>'scheduled_for')::timestamptz;
    if ts is null or ts < now() then raise exception 'Visit must be scheduled in the future'; end if;
    insert into public.evc_visits (application_id, coordinator_id, scheduled_for) values (_id, uid, ts);
    nxt := 'evc_scheduled';
    perform public.notify(a.owner_id, 'EVC visit scheduled ' || a.ref_no, 'Visit on ' || to_char(ts,'DD Mon YYYY HH24:MI'), '/applications/' || _id);

  elsif _action = 'submit_evc_report' then
    if not public.has_role(uid,'evc_coordinator') then raise exception 'Requires EVC coordinator role'; end if;
    if a.status <> 'evc_scheduled' then raise exception 'Illegal transition from %', a.status; end if;
    if _reason is null or char_length(_reason) < 20 then raise exception 'EVC report must be at least 20 characters'; end if;
    if (_payload->>'recommendation') not in ('recommend','not_recommend','conditional') then raise exception 'Recommendation required'; end if;
    update public.evc_visits set report = _reason, recommendation = _payload->>'recommendation', completed_at = now()
      where id = (select id from public.evc_visits where application_id = _id and completed_at is null order by created_at desc limit 1);
    nxt := 'pending_decision';
    perform public.notify_role('regional_officer', a.region, 'Decision pending: ' || a.ref_no, 'EVC report filed', '/review/' || _id);

  elsif _action in ('approve','reject') then
    if not (public.has_role(uid,'regional_officer') or public.has_role(uid,'national_admin')) then raise exception 'Requires regional officer or national administrator'; end if;
    if a.status <> 'pending_decision' then raise exception 'Illegal transition from %', a.status; end if;
    if _reason is null or char_length(_reason) < 10 then raise exception 'Decision reason (min 10 chars) is mandatory'; end if;
    if char_length(coalesce(trim(_payload->>'evidence'),'')) < 5 then raise exception 'Evidence reference is mandatory'; end if;
    nxt := case _action when 'approve' then 'approved'::public.app_status else 'rejected'::public.app_status end;
    update public.applications set decision_reason = _reason, decision_evidence = trim(_payload->>'evidence'), decided_by = uid, decided_at = now() where id = _id;
    if _action = 'approve' then
      insert into public.obligations (institution_id, application_id, kind, title, due_date, region)
      select a.institution_id, _id, 'undertaking', u, (now() + interval '90 days')::date, a.region
      from jsonb_array_elements_text(coalesce(a.template_snapshot->'undertakings','[]')) u;
      insert into public.obligations (institution_id, application_id, kind, title, due_date, region)
      values (a.institution_id, _id, 'renewal', 'Annual renewal: ' || a.title, (now() + interval '365 days')::date, a.region);
    end if;
    perform public.notify(a.owner_id, 'Decision recorded: ' || a.ref_no, upper(nxt::text) || ' — ' || left(_reason,160), '/applications/' || _id);
  else
    raise exception 'Unknown action';
  end if;

  update public.applications set status = nxt, stage_entered_at = now(), updated_at = now(),
    sla_due_at = case
      when nxt in ('approved','rejected') then null
      when nxt = 'deficiency_raised' then now() + interval '30 days'
      when nxt in ('evc_pending','evc_scheduled') then now() + make_interval(days => public.stage_sla_days(a.template_snapshot,'evc'))
      when nxt = 'pending_decision' then now() + make_interval(days => public.stage_sla_days(a.template_snapshot,'decision'))
      else sla_due_at end
  where id = _id;
  perform public.log_event(_id, _action, a.status, nxt, _reason, coalesce(_payload,'{}'));
end $$;

create or replace function public.set_checklist(_id uuid, _item text, _passed boolean, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.applications where id = _id;
  if a is null or not public.officer_in_region(auth.uid(), a.region) or not public.has_role(auth.uid(),'scrutiny_officer') then raise exception 'Not permitted'; end if;
  if a.status <> 'under_scrutiny' then raise exception 'Checklist editable only during scrutiny'; end if;
  if not (a.template_snapshot->'checklist') ? _item then raise exception 'Unknown checklist item'; end if;
  insert into public.checklist_items (application_id, item, passed, note, checked_by, updated_at)
  values (_id, _item, _passed, left(_note,500), auth.uid(), now())
  on conflict (application_id, item) do update set passed = excluded.passed, note = excluded.note, checked_by = excluded.checked_by, updated_at = now();
  perform public.log_event(_id, 'checklist', a.status, a.status, _item, jsonb_build_object('passed', _passed));
end $$;

-- ============ COMPLIANCE ============
create or replace function public.refresh_obligations()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select o.*, i.owner_id from public.obligations o join public.institutions i on i.id = o.institution_id
    where o.status = 'open' and o.due_date < current_date
      and (i.owner_id = auth.uid() or public.officer_in_region(auth.uid(), o.region)) for update of o loop
    update public.obligations set status = 'escalated' where id = r.id;
    perform public.notify(r.owner_id, 'Obligation overdue — escalated', r.title, '/compliance');
    perform public.notify_role('regional_officer', r.region, 'Escalation: ' || r.title, 'Overdue since ' || r.due_date, '/compliance');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.fulfil_obligation(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select ob.* into o from public.obligations ob where ob.id = _id;
  if o is null or not (public.has_role(auth.uid(),'regional_officer') or public.has_role(auth.uid(),'national_admin'))
     or not public.officer_in_region(auth.uid(), o.region) then raise exception 'Only regional officers can verify fulfilment'; end if;
  update public.obligations set status = 'fulfilled' where id = _id;
end $$;

-- ============ ADMIN: ROLES ============
create or replace function public.assign_role(_email text, _role public.app_role, _region text)
returns void language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not public.has_role(auth.uid(),'national_admin') then raise exception 'Only national administrators can assign roles'; end if;
  if _region is not null and _region not in ('North','South','East','West','Central','North-East') then raise exception 'Invalid region'; end if;
  select id into target from public.profiles where lower(email) = lower(trim(_email));
  if target is null then raise exception 'No account with that email'; end if;
  insert into public.user_roles (user_id, role, region) values (target, _role, _region)
  on conflict (user_id, role) do update set region = excluded.region;
  insert into public.config_audit (actor_id, action, detail) values (auth.uid(), 'assign_role', jsonb_build_object('user', target, 'role', _role, 'region', _region));
end $$;

create or replace function public.revoke_role(_user uuid, _role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'national_admin') then raise exception 'Only national administrators can revoke roles'; end if;
  if _user = auth.uid() and _role = 'national_admin' then raise exception 'You cannot revoke your own admin role'; end if;
  delete from public.user_roles where user_id = _user and role = _role;
  insert into public.config_audit (actor_id, action, detail) values (auth.uid(), 'revoke_role', jsonb_build_object('user', _user, 'role', _role));
end $$;

create or replace function public.list_staff()
returns table (user_id uuid, email text, full_name text, role public.app_role, region text)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.email, p.full_name, r.role, r.region from public.user_roles r join public.profiles p on p.id = r.user_id
  where r.role <> 'institution' and public.is_officer(auth.uid()) order by r.role, p.email
$$;

-- workload per officer (open assigned cases in caller's jurisdiction)
create or replace function public.officer_workload()
returns table (officer_id uuid, email text, open_cases bigint)
language sql stable security definer set search_path = public as $$
  select a.assigned_officer, p.email, count(*) from public.applications a join public.profiles p on p.id = a.assigned_officer
  where a.status not in ('approved','rejected','draft') and public.officer_in_region(auth.uid(), a.region)
  group by a.assigned_officer, p.email
$$;

-- ============ ADMIN: TEMPLATES ============
create or replace function public.create_template_draft(_type public.app_type)
returns uuid language plpgsql security definer set search_path = public as $$
declare src record; nid uuid;
begin
  if not public.has_role(auth.uid(),'national_admin') then raise exception 'Admin only'; end if;
  if exists (select 1 from public.workflow_templates where app_type = _type and status = 'draft') then raise exception 'A draft already exists for this type'; end if;
  select * into src from public.workflow_templates where app_type = _type order by version desc limit 1;
  insert into public.workflow_templates (app_type, version, status, name, definition, created_by)
  values (_type, coalesce(src.version,0) + 1, 'draft', src.name, src.definition, auth.uid()) returning id into nid;
  insert into public.config_audit (template_id, actor_id, action, detail) values (nid, auth.uid(), 'create_draft', jsonb_build_object('from_version', src.version));
  return nid;
end $$;

create or replace function public.update_template_draft(_id uuid, _name text, _definition jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if not public.has_role(auth.uid(),'national_admin') then raise exception 'Admin only'; end if;
  select * into t from public.workflow_templates where id = _id for update;
  if t is null or t.status <> 'draft' then raise exception 'Only drafts are editable; published versions are immutable'; end if;
  perform public.validate_definition(_definition);
  update public.workflow_templates set name = left(trim(_name),120), definition = _definition where id = _id;
  insert into public.config_audit (template_id, actor_id, action, detail) values (_id, auth.uid(), 'update_draft', jsonb_build_object('before', t.definition, 'after', _definition));
end $$;

create or replace function public.publish_template(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if not public.has_role(auth.uid(),'national_admin') then raise exception 'Admin only'; end if;
  select * into t from public.workflow_templates where id = _id for update;
  if t is null or t.status <> 'draft' then raise exception 'Only drafts can be published'; end if;
  perform public.validate_definition(t.definition);
  update public.workflow_templates set status = 'archived' where app_type = t.app_type and status = 'published';
  update public.workflow_templates set status = 'published', published_at = now() where id = _id;
  insert into public.config_audit (template_id, actor_id, action, detail) values (_id, auth.uid(), 'publish', jsonb_build_object('version', t.version));
end $$;

create or replace function public.delete_template_draft(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'national_admin') then raise exception 'Admin only'; end if;
  insert into public.config_audit (actor_id, action, detail) values (auth.uid(), 'discard_draft', jsonb_build_object('template', _id));
  delete from public.workflow_templates where id = _id and status = 'draft';
end $$;

-- lock down RPC execution to authenticated users only
do $$ declare f text; begin
  foreach f in array array['create_application(public.app_type,text)','save_draft(uuid,text,jsonb)','submit_application(uuid)','resubmit_application(uuid,text)',
    'officer_action(uuid,text,text,jsonb)','set_checklist(uuid,text,boolean,text)','refresh_obligations()','fulfil_obligation(uuid)',
    'assign_role(text,public.app_role,text)','revoke_role(uuid,public.app_role)','list_staff()','officer_workload()',
    'create_template_draft(public.app_type)','update_template_draft(uuid,text,jsonb)','publish_template(uuid)','delete_template_draft(uuid)','missing_inputs(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============ SEED v1 TEMPLATES (APH 2024-27 prototype model; exemplary, requires authority verification) ============
insert into public.workflow_templates (app_type, version, status, name, definition, published_at) values
('extension_self_disclosure', 1, 'published', 'Extension of Approval — Self Disclosure', '{
  "evc_mode":"none",
  "disclaimer":"Prototype route modelled on APH 2024-27; exemplary only, to be verified by AICTE.",
  "stages":[{"key":"submission","label":"Self-disclosure submission","role":"institution","sla_days":0},
            {"key":"scrutiny","label":"Disclosure verification","role":"scrutiny_officer","sla_days":7},
            {"key":"decision","label":"Regional decision","role":"regional_officer","sla_days":7}],
  "required_fields":[{"key":"academic_year","label":"Academic year"},{"key":"intake","label":"Sanctioned intake"},{"key":"faculty_count","label":"Faculty count"},{"key":"declaration","label":"Self-disclosure declaration"}],
  "required_documents":["Affidavit","Fire Safety Certificate"],
  "checklist":["Affidavit notarised","Intake matches previous approval","Faculty ratio within norms","Fire certificate valid"],
  "undertakings":["Maintain faculty ratio for academic year"]}'::jsonb, now()),
('name_change', 1, 'published', 'Change in Name of Institution', '{
  "evc_mode":"none",
  "disclaimer":"Prototype route modelled on APH 2024-27; exemplary only, to be verified by AICTE.",
  "stages":[{"key":"submission","label":"Submission","role":"institution","sla_days":0},
            {"key":"scrutiny","label":"Document scrutiny","role":"scrutiny_officer","sla_days":15},
            {"key":"decision","label":"Regional decision","role":"regional_officer","sla_days":10}],
  "required_fields":[{"key":"current_name","label":"Current name"},{"key":"proposed_name","label":"Proposed name"},{"key":"justification","label":"Justification"}],
  "required_documents":["Board Resolution","University NOC","Trust Deed Amendment"],
  "checklist":["Board resolution authentic","University NOC attached","No conflicting name in registry","Trust deed amended"],
  "undertakings":["Update name on all certificates and website within 60 days"]}'::jsonb, now()),
('new_programme', 1, 'published', 'Introduction of New Programme', '{
  "evc_mode":"conditional",
  "disclaimer":"Prototype route modelled on APH 2024-27; exemplary only, to be verified by AICTE.",
  "stages":[{"key":"submission","label":"Submission","role":"institution","sla_days":0},
            {"key":"scrutiny","label":"Scrutiny","role":"scrutiny_officer","sla_days":15},
            {"key":"evc","label":"Expert Visit Committee","role":"evc_coordinator","sla_days":21},
            {"key":"decision","label":"Regional decision","role":"regional_officer","sla_days":10}],
  "required_fields":[{"key":"programme_name","label":"Programme name"},{"key":"level","label":"Level"},{"key":"intake","label":"Proposed intake"},{"key":"lab_details","label":"Laboratory infrastructure"}],
  "required_documents":["Building Plan","Faculty List","Lab Equipment Inventory"],
  "checklist":["Built-up area adequate","Faculty qualified for programme","Lab inventory meets norms","Library resources adequate"],
  "undertakings":["Recruit remaining faculty before commencement","Submit lab commissioning report"]}'::jsonb, now());
