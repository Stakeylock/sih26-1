begin;
create table public.inspection_experts(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 3 and 160),organisation text not null check(length(organisation) between 3 and 200),discipline text not null check(length(discipline) between 3 and 120),region text not null check(region in('North','South','East','West','Central','North-East')),affiliated_institution_id uuid references public.institutions,active boolean not null default true,version int not null default 1,created_by uuid not null references auth.users,created_at timestamptz not null default now());
create table public.expert_availability(id uuid primary key default gen_random_uuid(),expert_id uuid not null references public.inspection_experts,starts_at timestamptz not null,ends_at timestamptz not null,note text not null check(length(note) between 10 and 2000),recorded_by uuid not null references auth.users,created_at timestamptz not null default now(),check(ends_at>starts_at));
create table public.expert_conflicts(id uuid primary key default gen_random_uuid(),expert_id uuid not null references public.inspection_experts,institution_id uuid not null references public.institutions,reason text not null check(length(reason) between 10 and 2000),active boolean not null default true,recorded_by uuid not null references auth.users,created_at timestamptz not null default now());
alter table public.evc_visits add column ends_at timestamptz,add column visit_mode text check(visit_mode in('physical','online','hybrid')),add column planning_state text not null default 'legacy' check(planning_state in('legacy','tentative','confirmed','completed','cancelled')),add column resource_planned boolean not null default false,add column version int not null default 1,add column panel_snapshot jsonb not null default '[]',add column planning_note text,add column report_basis jsonb,add column report_due_at timestamptz;
create table public.expert_reservations(id uuid primary key default gen_random_uuid(),expert_id uuid not null references public.inspection_experts,visit_id uuid not null references public.evc_visits,application_id uuid not null references public.applications,starts_at timestamptz not null,ends_at timestamptz not null,active boolean not null default true,check(ends_at>starts_at));
create index expert_region on public.inspection_experts(region);
create index expert_windows on public.expert_availability(expert_id,starts_at,ends_at);
create index expert_conflict_subject on public.expert_conflicts(expert_id,institution_id) where active;
create index expert_reservation_window on public.expert_reservations(expert_id,starts_at,ends_at) where active;
create index expert_reservation_case on public.expert_reservations(application_id);
create index expert_reservation_visit on public.expert_reservations(visit_id);
create table fp_private.planning_receipts(request_id uuid primary key,actor_id uuid not null,input jsonb not null,result jsonb not null);
create function fp_private.can_plan_region(_region text) returns boolean language sql stable security definer set search_path='' as $$select fp_private.has_role('national_admin') or fp_private.has_role('regional_officer',_region) or fp_private.has_role('evc_coordinator',_region)$$;
alter table public.inspection_experts enable row level security;
alter table public.expert_availability enable row level security;
alter table public.expert_conflicts enable row level security;
alter table public.expert_reservations enable row level security;
create policy experts_read on public.inspection_experts for select to authenticated using(fp_private.can_plan_region(region) or exists(select 1 from public.expert_reservations r where r.expert_id=inspection_experts.id and fp_private.can_view(r.application_id)));
create policy availability_read on public.expert_availability for select to authenticated using(exists(select 1 from public.inspection_experts e where e.id=expert_id and fp_private.can_plan_region(e.region)));
create policy conflicts_read on public.expert_conflicts for select to authenticated using(exists(select 1 from public.inspection_experts e where e.id=expert_id and fp_private.can_plan_region(e.region)));
create policy reservations_read on public.expert_reservations for select to authenticated using(fp_private.can_view(application_id));
revoke all on public.inspection_experts,public.expert_availability,public.expert_conflicts,public.expert_reservations from public,anon,authenticated;
grant select on public.inspection_experts,public.expert_availability,public.expert_conflicts,public.expert_reservations to authenticated;

create function fp_private.inspection_command(_kind text,_id uuid,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare uid uuid:=fp_private.actor();a public.applications;v public.evc_visits;e public.inspection_experts;r fp_private.planning_receipts;body jsonb:=jsonb_build_object('kind',_kind,'id',_id,'payload',_payload,'version',_expected_version);result jsonb:='{}';expert_ids uuid[];starts timestamptz;ends timestamptz;planned_visit uuid;panel jsonb;expert_id uuid;target uuid;
begin
 if _request_id is null or jsonb_typeof(_payload) is distinct from 'object' then raise exception 'Request ID and object payload required';end if;
 if _kind in('expert_create','availability','conflict','conflict_resolve','expert_status') then
  if _kind='expert_create' then if not fp_private.can_plan_region(_payload->>'region') then raise exception 'Directory jurisdiction required' using errcode='42501';end if;
  else select * into e from public.inspection_experts where id=_id for update;if e.id is null or not fp_private.can_plan_region(e.region) then raise exception 'Expert unavailable' using errcode='42501';end if;end if;
 else
  if _kind='plan' then select * into a from public.applications where id=_id for update;
  else select * into v from public.evc_visits where id=_id;select * into a from public.applications where id=v.application_id for update;select * into v from public.evc_visits where id=_id for update;end if;
  if a.id is null or not fp_private.can_view(a.id) or a.owner_id=uid then raise exception 'Inspection case unavailable' using errcode='42501';end if;
  if _kind in('cancel','reassign') then if not(fp_private.has_role('evc_coordinator',a.region) and v.coordinator_id=uid or fp_private.has_role('regional_officer',a.region) or fp_private.has_role('national_admin')) then raise exception 'Inspection management jurisdiction required' using errcode='42501';end if;
  elsif not fp_private.has_role('evc_coordinator',a.region) or (_kind<>'plan' and v.coordinator_id<>uid) then raise exception 'Assigned EVC coordinator required' using errcode='42501';end if;
 end if;
 select * into r from fp_private.planning_receipts where request_id=_request_id;
 if found then if r.actor_id<>uid or r.input<>body then raise exception 'Request ID already used';end if;return r.result;end if;
 if _kind<>'expert_create' and _expected_version is distinct from (case when _kind in('availability','conflict','conflict_resolve','expert_status') then e.version else a.version end) then raise exception 'Record changed; reload before planning' using errcode='40001';end if;
 if coalesce(length(trim(_payload->>'note')),0) not between 10 and 2000 then raise exception 'A recorded planning reason of 10-2000 characters is required';end if;
 if _kind='expert_create' then
  if nullif(_payload->>'affiliated_institution_id','') is not null and not fp_private.can_view_institution((_payload->>'affiliated_institution_id')::uuid) then raise exception 'Affiliation outside permitted scope' using errcode='42501';end if;
  insert into public.inspection_experts(name,organisation,discipline,region,affiliated_institution_id,active,created_by) values(trim(_payload->>'name'),trim(_payload->>'organisation'),trim(_payload->>'discipline'),_payload->>'region',nullif(_payload->>'affiliated_institution_id','')::uuid,coalesce((_payload->>'active')::boolean,true),uid) returning * into e;result:=to_jsonb(e);
 elsif _kind='availability' then
  starts:=(_payload->>'starts_at')::timestamptz;ends:=(_payload->>'ends_at')::timestamptz;
  if starts is null or ends is null or ends<=starts then raise exception 'A positive availability window is required';end if;
  insert into public.expert_availability(expert_id,starts_at,ends_at,note,recorded_by) values(e.id,starts,ends,trim(_payload->>'note'),uid);
 elsif _kind='conflict' then
  target:=(_payload->>'institution_id')::uuid;if target is null or not fp_private.can_view_institution(target) then raise exception 'Conflict institution outside scope' using errcode='42501';end if;
  insert into public.expert_conflicts(expert_id,institution_id,reason,recorded_by) values(e.id,target,trim(_payload->>'note'),uid);
 elsif _kind='conflict_resolve' then
  if not exists(select 1 from public.expert_conflicts c where c.id=(_payload->>'conflict_id')::uuid and c.expert_id=e.id and c.active) then raise exception 'Active conflict for this expert required';end if;
  update public.expert_conflicts set active=false where id=(_payload->>'conflict_id')::uuid and expert_id=e.id;
 elsif _kind='expert_status' then
  if jsonb_typeof(_payload->'active') is distinct from 'boolean' then raise exception 'Explicit expert status required';end if;
  update public.inspection_experts set active=(_payload->>'active')::boolean where id=e.id;
 elsif _kind='plan' then
  if a.status not in('evc_pending','evc_scheduled') then raise exception 'A case pending or scheduled for inspection is required';end if;
  starts:=(_payload->>'starts_at')::timestamptz;ends:=(_payload->>'ends_at')::timestamptz;
  if starts is null or ends is null or starts<=clock_timestamp() or ends<=starts or ends>starts+interval '7 days' or coalesce(_payload->>'mode','') not in('physical','online','hybrid') then raise exception 'Future positive visit window up to seven days and a supported mode required';end if;
  if jsonb_typeof(_payload->'expert_ids') is distinct from 'array' or jsonb_array_length(_payload->'expert_ids') not between 1 and 10 then raise exception 'Select between one and ten panel members';end if;
  select array_agg(value::uuid order by value) into expert_ids from jsonb_array_elements_text(_payload->'expert_ids');
  if cardinality(expert_ids)<>(select count(distinct x) from unnest(expert_ids) x) then raise exception 'Panel members must be unique';end if;
  planned_visit:=nullif(_payload->>'visit_id','')::uuid;
  if planned_visit is not null then select * into v from public.evc_visits where id=planned_visit and application_id=a.id for update;
   if v.id is null or v.coordinator_id<>uid or v.completed_at is not null or v.planning_state='cancelled' then raise exception 'Existing visit cannot be rescheduled';end if;
  elsif exists(select 1 from public.evc_visits x where x.application_id=a.id and x.completed_at is null and x.planning_state<>'cancelled') then raise exception 'Manage the existing visit instead of creating a duplicate';end if;
  perform 1 from public.inspection_experts x where x.id=any(expert_ids) order by x.id for update;
  if (select count(*) from public.inspection_experts x where x.id=any(expert_ids))<>cardinality(expert_ids) then raise exception 'Panel contains an unknown expert';end if;
  panel:='[]';
  foreach expert_id in array expert_ids loop
   select * into e from public.inspection_experts where id=expert_id;
   if not e.active or not fp_private.can_plan_region(e.region) then raise exception 'Expert inactive or outside directory scope' using errcode='42501';end if;
   if e.affiliated_institution_id=a.institution_id or exists(select 1 from public.expert_conflicts c where c.expert_id=e.id and c.institution_id=a.institution_id and c.active) then raise exception 'Declared affiliation/conflict blocks this panel member';end if;
   if not exists(select 1 from public.expert_availability w where w.expert_id=e.id and w.starts_at<=starts and w.ends_at>=ends) then raise exception 'No recorded availability covers the complete visit';end if;
   if exists(select 1 from public.expert_reservations reservation where reservation.expert_id=e.id and reservation.active and reservation.starts_at<ends and reservation.ends_at>starts and(planned_visit is null or reservation.visit_id<>planned_visit)) then raise exception 'Expert already reserved for an overlapping visit';end if;
   panel:=panel||jsonb_build_array(jsonb_build_object('expert_id',e.id,'name',e.name,'organisation',e.organisation,'discipline',e.discipline,'declaration','Coordinator-recorded availability and conflict screening; not a credential certification.'));
  end loop;
  if planned_visit is null then insert into public.evc_visits(application_id,coordinator_id,scheduled_for,ends_at,visit_mode,planning_state,resource_planned,panel_snapshot,planning_note,report_due_at) values(a.id,uid,starts,ends,_payload->>'mode','tentative',true,panel,trim(_payload->>'note'),ends+make_interval(days=>coalesce((select (stage->>'sla_days')::int from jsonb_array_elements(a.template_snapshot->'stages') stage where stage->>'key'='evc' limit 1),21))) returning id into planned_visit;
  else update public.expert_reservations set active=false where expert_reservations.visit_id=planned_visit;
   update public.evc_visits set scheduled_for=starts,ends_at=ends,visit_mode=_payload->>'mode',planning_state='tentative',resource_planned=true,panel_snapshot=panel,planning_note=trim(_payload->>'note'),report_due_at=ends+interval '21 days',version=version+1 where id=planned_visit;
  end if;
  insert into public.expert_reservations(expert_id,visit_id,application_id,starts_at,ends_at) select x,planned_visit,a.id,starts,ends from unnest(expert_ids) x;
  update public.applications set status='evc_scheduled',version=version+1,updated_at=now(),sla_due_at=coalesce(sla_due_at,starts) where id=a.id;
  perform fp_private.event(a.id,'inspection_planned',a.status,'evc_scheduled',trim(_payload->>'note'),jsonb_build_object('visit_id',planned_visit,'mode',_payload->>'mode','starts_at',starts,'ends_at',ends,'panel',panel,'request_id',_request_id));result:=jsonb_build_object('visit_id',planned_visit);
 elsif _kind in('confirm','report','cancel','reassign') then
  if v.id is null or v.completed_at is not null or v.planning_state='cancelled' or a.status<>'evc_scheduled' then raise exception 'An active scheduled visit is required';end if;
  if _kind='confirm' then
   if not v.resource_planned or v.planning_state<>'tentative' then raise exception 'A resource-planned tentative visit is required';end if;
   perform 1 from public.inspection_experts x where x.id in(select reservation.expert_id from public.expert_reservations reservation where reservation.visit_id=v.id and reservation.active) order by x.id for update;
   if exists(select 1 from public.expert_reservations reservation join public.inspection_experts expert on expert.id=reservation.expert_id where reservation.visit_id=v.id and reservation.active and(not expert.active or expert.affiliated_institution_id=a.institution_id or exists(select 1 from public.expert_conflicts c where c.expert_id=expert.id and c.institution_id=a.institution_id and c.active))) then raise exception 'Panel eligibility changed; revise the visit';end if;
   update public.evc_visits set planning_state='confirmed',version=version+1 where id=v.id;
  elsif _kind='report' then
   if not v.resource_planned or v.planning_state<>'confirmed' or v.ends_at is null or v.ends_at>clock_timestamp() or coalesce(length(trim(_payload->>'report')),0) not between 20 and 10000 or coalesce(_payload->>'recommendation','') not in('recommend','conditional','not_recommend') then raise exception 'A completed confirmed window, full findings and recommendation required';end if;
   perform 1 from public.inspection_experts x where x.id in(select reservation.expert_id from public.expert_reservations reservation where reservation.visit_id=v.id and reservation.active) order by x.id for update;
   if jsonb_array_length(v.panel_snapshot)=0 or exists(select 1 from public.expert_reservations reservation join public.inspection_experts expert on expert.id=reservation.expert_id where reservation.visit_id=v.id and reservation.active and(not expert.active or expert.affiliated_institution_id=a.institution_id or exists(select 1 from public.expert_conflicts c where c.expert_id=expert.id and c.institution_id=a.institution_id and c.active))) then raise exception 'Panel eligibility changed; resolve the declaration before reporting';end if;
   update public.evc_visits set planning_state='completed',completed_at=now(),report=trim(_payload->>'report'),recommendation=_payload->>'recommendation',version=version+1,report_basis=jsonb_build_object('text_sha256',encode(sha256(convert_to(trim(_payload->>'report'),'UTF8')),'hex'),'actor_id',uid,'panel',v.panel_snapshot,'recorded_at',clock_timestamp()) where id=v.id;
   update public.expert_reservations set active=false where expert_reservations.visit_id=v.id;
  elsif _kind='cancel' then update public.evc_visits set planning_state='cancelled',planning_note=trim(_payload->>'note'),version=version+1 where id=v.id;update public.expert_reservations set active=false where expert_reservations.visit_id=v.id;
  else
   target:=(_payload->>'coordinator_id')::uuid;
   if not exists(select 1 from public.user_roles role_record join auth.users u on u.id=role_record.user_id where role_record.user_id=target and role_record.role='evc_coordinator' and role_record.region=a.region and role_record.active and role_record.revoked_at is null and(role_record.expires_at is null or role_record.expires_at>clock_timestamp()) and u.email_confirmed_at is not null and(u.banned_until is null or u.banned_until<clock_timestamp())) then raise exception 'An active coordinator in the case region is required';end if;
   update public.evc_visits set coordinator_id=target,version=version+1 where id=v.id;
  end if;
  update public.applications set status=case when _kind='report' then 'pending_decision'::public.app_status when _kind='cancel' then 'evc_pending'::public.app_status else status end,version=version+1,updated_at=now() where id=a.id;
  perform fp_private.event(a.id,'inspection_'||_kind,a.status,(select status from public.applications where id=a.id),trim(_payload->>'note'),jsonb_build_object('visit_id',v.id,'request_id',_request_id,'recommendation',_payload->>'recommendation'));
 else raise exception 'Unsupported inspection command';end if;
 if _kind in('availability','conflict','conflict_resolve','expert_status') then update public.inspection_experts set version=version+1 where id=e.id;end if;
 if _kind in('expert_create','availability','conflict','conflict_resolve','expert_status') then insert into public.config_audit(actor_id,action,detail) values(uid,'inspection_'||_kind,jsonb_build_object('expert_id',e.id,'note',_payload->>'note','request_id',_request_id));end if;
 insert into fp_private.planning_receipts values(_request_id,uid,body,result);return result;
end $$;

alter function fp_private.transition(uuid,text,text,jsonb,int,uuid) rename to transition_before_planner;
create function fp_private.transition(_id uuid,_action text,_reason text,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform fp_private.actor();perform 1 from public.applications where id=_id for update;
 if _action='schedule_evc' and exists(select 1 from public.applications a where a.id=_id and coalesce((a.template_snapshot->>'inspection_planning_required')::boolean,false)) then raise exception 'Use the expert resource planner for this route';end if;
 if _action='submit_evc_report' and exists(select 1 from public.evc_visits v where v.application_id=_id and v.resource_planned and v.completed_at is null and v.planning_state<>'cancelled') then raise exception 'Use the confirmed resource-planned visit report command';end if;
 return fp_private.transition_before_planner(_id,_action,_reason,_payload,_expected_version,_request_id);
end $$;
create function public.fp_inspection_command(_kind text,_id uuid,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select fp_private.inspection_command(_kind,_id,_payload,_expected_version,_request_id)$$;
revoke all on function fp_private.can_plan_region(text),fp_private.inspection_command(text,uuid,jsonb,int,uuid),fp_private.transition_before_planner(uuid,text,text,jsonb,int,uuid),fp_private.transition(uuid,text,text,jsonb,int,uuid),public.fp_inspection_command(text,uuid,jsonb,int,uuid) from public,anon,authenticated;
grant execute on function fp_private.can_plan_region(text),fp_private.inspection_command(text,uuid,jsonb,int,uuid),fp_private.transition(uuid,text,text,jsonb,int,uuid),public.fp_inspection_command(text,uuid,jsonb,int,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
