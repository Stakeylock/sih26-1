begin;
-- Cosmetic wording for future records; previously recorded audit payloads are immutable.
update public.requirements set statement='Institution name and reference match the trust record' where code='INSTITUTION_IDENTITY';
update public.workflow_templates set definition=jsonb_set(definition,'{disclaimer}',to_jsonb('Prototype workflow with synthetic targets. Apply only a reviewed organisation policy.'::text));

create table public.analysis_snapshots(
 id uuid primary key default gen_random_uuid(),schema int not null default 1 check(schema=1),application_id uuid not null references public.applications,
 captured_at timestamptz not null default clock_timestamp(),captured_by uuid not null references auth.users,app_version int not null,
 head_sequence int not null,head_hash text,source_hash text not null,facts jsonb not null,coverage text not null check(coverage in('current','historical','partial')),limitations text[] not null default '{}');
create index analysis_snapshot_case on public.analysis_snapshots(application_id,captured_at desc);
create table public.analysis_scenarios(
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications,snapshot_id uuid not null references public.analysis_snapshots,
 created_by uuid not null references auth.users,created_at timestamptz not null default now(),engine_version text not null check(engine_version='review-analysis-v1'),
 parameters jsonb not null,source_hash text not null,parameter_hash text not null,name text not null check(length(name) between 3 and 120));
create index analysis_scenario_case on public.analysis_scenarios(application_id,created_at desc);
create table fp_private.analysis_receipts(request_id uuid primary key,actor_id uuid not null,application_id uuid not null,input jsonb not null,result jsonb not null);
alter table public.analysis_snapshots enable row level security;
alter table public.analysis_scenarios enable row level security;
create policy analysis_snapshot_read on public.analysis_snapshots for select to authenticated using(fp_private.can_view(application_id));
create policy analysis_scenario_read on public.analysis_scenarios for select to authenticated using(fp_private.can_view(application_id));
revoke all on public.analysis_snapshots,public.analysis_scenarios from public,anon,authenticated;
grant select on public.analysis_snapshots,public.analysis_scenarios to authenticated;
create trigger analysis_snapshot_immutable before update or delete on public.analysis_snapshots for each row execute function public.block_mutation();
create trigger analysis_scenario_immutable before update or delete on public.analysis_scenarios for each row execute function public.block_mutation();

create function fp_private.analysis_facts(_application uuid) returns jsonb language sql stable security definer set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('application',to_jsonb(a),'institution_name',i.name,
 'documents',coalesce((select jsonb_agg(to_jsonb(d)-'file_path'-'owner_id' order by d.id) from public.application_documents d where d.application_id=a.id),'[]'),
 'claims',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('basis_current',fp_private.review_basis_current(c.id)) order by c.id) from public.application_claims c where c.application_id=a.id),'[]'),
 'claim_evidence',coalesce((select jsonb_agg(to_jsonb(ce) order by ce.claim_id,ce.document_id) from public.claim_evidence ce join public.application_claims c on c.id=ce.claim_id where c.application_id=a.id),'[]'),
 'deficiencies',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.deficiencies d where d.application_id=a.id),'[]'),
 'obligations',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from public.obligations o where o.application_id=a.id),'[]'),
 'visits',coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from public.evc_visits v where v.application_id=a.id),'[]'),
 'signals',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.integrity_signals s where s.application_id=a.id),'[]'),
 'scope_requests',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.application_scope_items s where s.application_id=a.id),'[]'),
 'approvals',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.approval_records p where p.application_id=a.id),'[]'),
 'notices',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from public.policy_notices n where n.id in(select d.notice_id from public.applied_deadlines d where d.application_id=a.id)),'[]'),
 'deadlines',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.applied_deadlines d where d.application_id=a.id),'[]'),
 'history',jsonb_build_object('events','[]'::jsonb,'through',coalesce((select max(e.sequence) from public.application_events e where e.application_id=a.id),0),'head_hash',(select e.event_hash from public.application_events e where e.application_id=a.id order by e.sequence desc limit 1),'complete',true,'message','Recorded events are available through the scoped paginated history endpoint.'))
 from public.applications a join public.institutions i on i.id=a.institution_id where a.id=_application;
$$;
create function fp_private.capture_analysis(_application uuid,_expected_version int,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare uid uuid:=fp_private.actor();a public.applications;f jsonb;s public.analysis_snapshots;r fp_private.analysis_receipts;body jsonb:=jsonb_build_object('action','capture','application',_application,'version',_expected_version);
begin
 select * into a from public.applications where id=_application for update;
 if a.id is null or not fp_private.can_view(a.id) then raise exception 'Case unavailable' using errcode='42501';end if;
 if _request_id is null then raise exception 'Request ID required';end if;
 select * into r from fp_private.analysis_receipts where request_id=_request_id;
 if found then if r.actor_id<>uid or r.application_id<>a.id or r.input<>body then raise exception 'Request ID already used';end if;return r.result;end if;
 if a.version is distinct from _expected_version then raise exception 'Case changed; reload before capturing' using errcode='40001';end if;
 f:=fp_private.analysis_facts(a.id);
 insert into public.analysis_snapshots(application_id,captured_by,app_version,head_sequence,head_hash,source_hash,facts,coverage)
 values(a.id,uid,a.version,(f->'history'->>'through')::int,f->'history'->>'head_hash',encode(sha256(convert_to(f::text,'UTF8')),'hex'),f,'current') returning * into s;
 insert into fp_private.analysis_receipts values(_request_id,uid,a.id,body,to_jsonb(s));return to_jsonb(s);
end $$;
create function fp_private.save_analysis(_snapshot uuid,_parameters jsonb,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare uid uuid:=fp_private.actor();a public.applications;s public.analysis_snapshots;result public.analysis_scenarios;r fp_private.analysis_receipts;
 body jsonb:=jsonb_build_object('action','save','snapshot',_snapshot,'parameters',_parameters);item jsonb;key text;day text;f jsonb;
begin
 select * into s from public.analysis_snapshots where id=_snapshot;
 select * into a from public.applications where id=s.application_id for update;
 if s.id is null or a.id is null or not fp_private.can_view(a.id) then raise exception 'Analysis snapshot unavailable' using errcode='42501';end if;
 if _request_id is null then raise exception 'Request ID required';end if;
 select * into r from fp_private.analysis_receipts where request_id=_request_id;
 if found then if r.actor_id<>uid or r.application_id<>a.id or r.input<>body then raise exception 'Request ID already used';end if;return r.result;end if;
 f:=fp_private.analysis_facts(a.id);
 if a.version<>s.app_version or encode(sha256(convert_to(f::text,'UTF8')),'hex')<>s.source_hash then raise exception 'Captured case changed; capture a fresh analysis snapshot' using errcode='40001';end if;
 if jsonb_typeof(_parameters) is distinct from 'object' or (select count(*) from jsonb_object_keys(_parameters))<>8 or not(_parameters ?& array['name','horizonDays','scrutinyDelayDays','evcDelayDays','workloadMultiplier','extraMissingClaimIds','assumedAcceptedClaimIds','calendar']) then raise exception 'Use the supported scenario parameter schema';end if;
 if jsonb_typeof(_parameters->'name') is distinct from 'string' or coalesce(length(trim(_parameters->>'name')),0) not between 3 and 120 then raise exception 'Scenario name required';end if;
 foreach key in array array['horizonDays','scrutinyDelayDays','evcDelayDays'] loop
  if jsonb_typeof(_parameters->key) is distinct from 'number' or (_parameters->>key)!~'^[0-9]+$' or (_parameters->>key)::int not between 0 and (case when key='horizonDays' then 365 else 60 end) then raise exception 'Scenario duration outside allowed range';end if;
 end loop;
 if jsonb_typeof(_parameters->'workloadMultiplier') is distinct from 'number' or (_parameters->>'workloadMultiplier')::numeric not between 1 and 3 then raise exception 'Workload multiplier outside allowed range';end if;
 foreach key in array array['extraMissingClaimIds','assumedAcceptedClaimIds'] loop
  if jsonb_typeof(_parameters->key) is distinct from 'array' or jsonb_array_length(_parameters->key)>100 then raise exception 'Claim assumption list invalid';end if;
  if (select count(distinct value) from jsonb_array_elements_text(_parameters->key))<>jsonb_array_length(_parameters->key) then raise exception 'Claim assumptions must be unique';end if;
  for item in select value from jsonb_array_elements(_parameters->key) loop
   if jsonb_typeof(item)<>'string' or not exists(select 1 from public.application_claims c where c.id::text=item#>>'{}' and c.application_id=a.id) then raise exception 'Claim assumption outside captured case' using errcode='42501';end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements_text(_parameters->'extraMissingClaimIds') x where _parameters->'assumedAcceptedClaimIds' ? x) then raise exception 'Contradictory claim assumptions';end if;
 item:=_parameters->'calendar';
 foreach key in array array['id','label','basis','timezone','source'] loop if jsonb_typeof(item->key) is distinct from 'string' then raise exception 'Calendar metadata must use strings';end if;end loop;
 if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>7 or not(item ?& array['id','version','label','basis','timezone','holidays','source']) or item->>'basis' not in('calendar_days','weekdays') or item->>'timezone'<>'Asia/Kolkata' or coalesce(length(item->>'id'),0) not between 3 and 100 or coalesce(length(item->>'label'),0) not between 3 and 160 or coalesce(length(item->>'source'),0) not between 3 and 1000 or coalesce(item->>'version','')!~'^[1-9][0-9]{0,6}$' then raise exception 'Explicit supported calendar metadata required';end if;
 if jsonb_typeof(item->'holidays') is distinct from 'array' or jsonb_array_length(item->'holidays')>200 then raise exception 'Calendar holiday list invalid';end if;
 if exists(select 1 from jsonb_array_elements(item->'holidays') holiday where jsonb_typeof(holiday) is distinct from 'string') then raise exception 'Holiday dates must use strings';end if;
 if (select count(distinct value) from jsonb_array_elements_text(item->'holidays'))<>jsonb_array_length(item->'holidays') then raise exception 'Holiday dates must be unique';end if;
 for day in select jsonb_array_elements_text(item->'holidays') loop
  if day!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(day::date,'YYYY-MM-DD')<>day then raise exception 'Invalid calendar date';end if;
 end loop;
 insert into public.analysis_scenarios(application_id,snapshot_id,created_by,engine_version,parameters,source_hash,parameter_hash,name)
 values(a.id,s.id,uid,'review-analysis-v1',_parameters,s.source_hash,encode(sha256(convert_to(_parameters::text,'UTF8')),'hex'),trim(_parameters->>'name')) returning * into result;
 insert into fp_private.analysis_receipts values(_request_id,uid,a.id,body,to_jsonb(result));return to_jsonb(result);
end $$;
create function public.fp_capture_analysis(_application uuid,_expected_version int,_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select fp_private.capture_analysis(_application,_expected_version,_request_id)$$;
create function public.fp_save_analysis(_snapshot uuid,_parameters jsonb,_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select fp_private.save_analysis(_snapshot,_parameters,_request_id)$$;
revoke all on function fp_private.analysis_facts(uuid),fp_private.capture_analysis(uuid,int,uuid),fp_private.save_analysis(uuid,jsonb,uuid),public.fp_capture_analysis(uuid,int,uuid),public.fp_save_analysis(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function fp_private.capture_analysis(uuid,int,uuid),fp_private.save_analysis(uuid,jsonb,uuid),public.fp_capture_analysis(uuid,int,uuid),public.fp_save_analysis(uuid,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
