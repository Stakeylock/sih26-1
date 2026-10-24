begin;
alter table public.workflow_templates add column revision int not null default 1,add column definition_hash text,add column source_url text,add column source_hash text,add column review_note text,add column reviewed_by uuid,add column reviewed_at timestamptz;
create function fp_private.policy_valid(d jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb;keys text[];expected text[];field_keys text[];
begin
 if jsonb_typeof(d) is distinct from 'object' or coalesce(d->>'evc_mode','') not in('none','conditional','required') or jsonb_typeof(d->'disclaimer') is distinct from 'string' or coalesce(length(d->>'disclaimer'),0) not between 10 and 2000 then return false;end if;
 if exists(select 1 from jsonb_object_keys(d) k where k not in('evc_mode','disclaimer','stages','required_fields','required_documents','checklist','undertakings','inspection_planning_required','calendar')) then return false;end if;
 if jsonb_typeof(d->'stages') is distinct from 'array' or jsonb_typeof(d->'required_fields') is distinct from 'array' then return false;end if;
 select array_agg(x->>'key' order by n) into keys from jsonb_array_elements(d->'stages') with ordinality a(x,n);
 expected:=case when d->>'evc_mode'='none' then array['submission','scrutiny','decision'] else array['submission','scrutiny','evc','decision'] end;
 if keys is distinct from expected then return false;end if;
 for item in select value from jsonb_array_elements(d->'stages') loop
  if exists(select 1 from jsonb_object_keys(item) k where k not in('key','label','role','sla_days')) or jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'sla_days') is distinct from 'number' or (item->>'sla_days') !~ '^\d+$' or (item->>'sla_days')::int not between (case when item->>'key'='submission' then 0 else 1 end) and 120 or coalesce(length(item->>'label'),0) not between 1 and 200 or item->>'role' is distinct from (case item->>'key' when 'submission' then 'institution' when 'scrutiny' then 'scrutiny_officer' when 'evc' then 'evc_coordinator' else 'regional_officer' end) then return false;end if;
 end loop;
 if jsonb_array_length(d->'required_fields') not between 1 and 40 then return false;end if;
 for item in select value from jsonb_array_elements(d->'required_fields') loop if exists(select 1 from jsonb_object_keys(item) k where k not in('key','label')) or jsonb_typeof(item->'label') is distinct from 'string' or coalesce(item->>'key','') !~ '^[a-z][a-z0-9_]{0,63}$' or coalesce(length(item->>'label'),0) not between 1 and 200 then return false;end if;end loop;
 select array_agg(x->>'key') into field_keys from jsonb_array_elements(d->'required_fields') x;if cardinality(field_keys)<>(select count(distinct x) from unnest(field_keys) x) then return false;end if;
 foreach item in array array[d->'required_documents',d->'checklist',d->'undertakings'] loop
  if jsonb_typeof(item) is distinct from 'array' or jsonb_array_length(item)>40 or exists(select 1 from jsonb_array_elements(item) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 1000) or jsonb_array_length(item)<>(select count(distinct value) from jsonb_array_elements_text(item)) then return false;end if;
 end loop;
 if jsonb_array_length(d->'required_documents')=0 or jsonb_array_length(d->'checklist')=0 then return false;end if;
 if d?'inspection_planning_required' and jsonb_typeof(d->'inspection_planning_required')<>'boolean' then return false;end if;
 if d?'calendar' then
  item:=d->'calendar';if exists(select 1 from jsonb_object_keys(item) k where k not in('id','version','label','basis','timezone','holidays','source')) or jsonb_typeof(item->'version') is distinct from 'number' or jsonb_typeof(item) is distinct from 'object' or item->>'timezone' is distinct from 'Asia/Kolkata' or coalesce(length(item->>'id'),0) not between 3 and 100 or coalesce(item->>'version','') !~ '^[1-9][0-9]*$' or coalesce(length(item->>'label'),0) not between 3 and 160 or coalesce(length(item->>'source'),0) not between 3 and 1000 or coalesce(item->>'basis','') not in('calendar_days','weekdays') or jsonb_typeof(item->'holidays') is distinct from 'array' then return false;end if;
  if jsonb_array_length(item->'holidays')>200 or jsonb_array_length(item->'holidays')<>(select count(distinct value) from jsonb_array_elements_text(item->'holidays')) then return false;end if;
  if exists(select 1 from jsonb_array_elements_text(item->'holidays') x where x !~ '^\d{4}-\d{2}-\d{2}$' or to_char(x::date,'YYYY-MM-DD')<>x) then return false;end if;
 end if;return true;
exception when others then return false;
end $$;
create function fp_private.policy_due(anchor timestamptz,days int,cal jsonb) returns timestamptz language plpgsql immutable set search_path='' as $$
declare target timestamptz:=anchor;counted int:=0;steps int:=0;day_key text;
begin
 if cal is null or cal='null'::jsonb or cal->>'basis'='calendar_days' then return anchor+make_interval(days=>days);end if;
 if days<0 or days>120 or coalesce(cal->>'basis','')<>'weekdays' then raise exception 'Invalid calendar target';end if;
 while counted<days loop target:=target+interval '1 day';steps:=steps+1;if steps>2000 then raise exception 'Calendar target exceeds supported horizon';end if;day_key:=to_char(target at time zone 'Asia/Kolkata','YYYY-MM-DD');
  if extract(dow from target at time zone 'Asia/Kolkata') not in(0,6) and not (cal->'holidays')?day_key then counted:=counted+1;end if;
 end loop;return target;
end $$;
create function fp_private.policy_shape(d jsonb) returns jsonb language sql immutable set search_path='' as $$select (d-'calendar'-'stages')||jsonb_build_object('stages',(select jsonb_agg(x-'sla_days' order by n) from jsonb_array_elements(d->'stages') with ordinality a(x,n)))$$;
create table fp_private.control_receipts(request_id uuid primary key,actor_id uuid not null,input jsonb not null,result jsonb not null);
create function fp_private.policy_command(_kind text,_id uuid,_payload jsonb,_expected int,_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=fp_private.actor();t public.workflow_templates;a public.applications;r fp_private.control_receipts;body jsonb:=jsonb_build_object('kind',_kind,'id',_id,'payload',_payload,'expected',_expected);result jsonb:='{}';reason text:=trim(_payload->>'note');next_version int;old_due timestamptz;stage_key text;
begin
 if not fp_private.has_role('national_admin') and not (_kind='adopt' and fp_private.has_role('institution')) then raise exception 'Policy administrator required' using errcode='42501';end if;
 if coalesce(length(reason),0) not between 10 and 2000 then raise exception 'Source review or adoption reason of 10-2000 characters required';end if;
 if _kind='adopt' then select * into a from public.applications where id=_id for update;if a.id is null or not fp_private.can_view(a.id) or (a.owner_id=uid and (a.status<>'draft' or not fp_private.has_role('institution'))) then raise exception 'Case unavailable for policy adoption' using errcode='42501';end if;select * into t from public.workflow_templates where id=(_payload->>'policy_id')::uuid for update;
 elsif _kind='create' then perform pg_advisory_xact_lock(hashtext('policy:'||(_payload->>'app_type')));select * into t from public.workflow_templates where app_type=(_payload->>'app_type')::public.app_type and status='published' order by version desc limit 1;
 else select * into t from public.workflow_templates where id=_id for update;end if;
 if t.id is null then raise exception 'Policy source unavailable';end if;
 select * into r from fp_private.control_receipts where request_id=_request;if found then if r.actor_id<>uid or r.input<>body then raise exception 'Request ID already used';end if;return r.result;end if;
 if _kind<>'create' and _expected is distinct from (case when _kind='adopt' then a.version else t.revision end) then raise exception 'Policy or case changed; reload before applying' using errcode='40001';end if;
 if _kind='create' then
  if exists(select 1 from public.workflow_templates where app_type=t.app_type and status='draft') then raise exception 'Continue the existing draft before creating another';end if;
  select max(version)+1 into next_version from public.workflow_templates where app_type=t.app_type;
  insert into public.workflow_templates(app_type,version,status,name,definition,created_by) values(t.app_type,next_version,'draft',t.name,t.definition,uid) returning * into t;
 elsif _kind='edit' then
  if t.status<>'draft' or not fp_private.policy_valid(_payload->'definition') or coalesce(length(trim(_payload->>'name')),0) not between 3 and 120 or coalesce(_payload->>'source_url','') !~ '^(https://|demo://)' or coalesce(_payload->>'source_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Valid editable draft, supported workflow and supplied source fingerprint required';end if;
  update public.workflow_templates set name=trim(_payload->>'name'),definition=_payload->'definition',source_url=_payload->>'source_url',source_hash=_payload->>'source_hash',definition_hash=encode(sha256(convert_to((_payload->'definition')::text,'UTF8')),'hex'),review_note=null,reviewed_by=null,reviewed_at=null,revision=revision+1 where id=t.id returning * into t;
 elsif _kind='review' then
  if t.status<>'draft' or t.source_hash is null or not fp_private.policy_valid(t.definition) then raise exception 'Save a valid sourced draft before reviewing';end if;
  update public.workflow_templates set review_note=reason,reviewed_by=uid,reviewed_at=now(),revision=revision+1 where id=t.id returning * into t;
 elsif _kind='publish' then
  if t.status<>'draft' or t.reviewed_by is null or not fp_private.policy_valid(t.definition) or t.definition_hash<>encode(sha256(convert_to(t.definition::text,'UTF8')),'hex') then raise exception 'Current valid draft and source review required before publication';end if;
  perform pg_advisory_xact_lock(hashtext('policy:'||t.app_type::text));update public.workflow_templates set status='archived' where app_type=t.app_type and status='published';update public.workflow_templates set status='published',published_at=now(),revision=revision+1 where id=t.id returning * into t;
 elsif _kind='retire' then
  if t.status<>'published' then raise exception 'Only a published revision can be retired';end if;
  if not exists(select 1 from public.workflow_templates where app_type=t.app_type and status='published' and id<>t.id) then raise exception 'Publish a replacement before retiring the sole active route';end if;
  update public.workflow_templates set status='archived',revision=revision+1 where id=t.id returning * into t;
 elsif _kind='adopt' then
  if t.status<>'published' or t.app_type<>a.app_type or (_payload->>'policy_revision')::int is distinct from t.revision or a.status in('approved','rejected') then raise exception 'Current published matching policy and an open case required';end if;
  if a.status<>'draft' and fp_private.policy_shape(a.template_snapshot)<>fp_private.policy_shape(t.definition) then raise exception 'Active cases permit calendar and target changes only; structural changes require a draft case';end if;
  old_due:=a.sla_due_at;stage_key:=case when a.status in('evc_pending','evc_scheduled') then 'evc' when a.status='pending_decision' then 'decision' else 'scrutiny' end;
  update public.applications set template_id=t.id,template_version=t.version,template_snapshot=t.definition,form_data=case when status='draft' then coalesce((select jsonb_object_agg(k,v) from jsonb_each(form_data) f(k,v) where exists(select 1 from jsonb_array_elements(t.definition->'required_fields') field where field->>'key'=k)),'{}') else form_data end,version=version+1,updated_at=now(),sla_due_at=case when sla_due_at is null then null else fp_private.policy_due(clock_timestamp(),coalesce((select (x->>'sla_days')::int from jsonb_array_elements(t.definition->'stages') x where x->>'key'=stage_key),7),t.definition->'calendar') end where id=a.id;
  perform fp_private.event(a.id,'policy_adopted',a.status,a.status,reason,jsonb_build_object('policy_id',t.id,'policy_version',t.version,'definition_hash',t.definition_hash,'old_due_at',old_due,'new_due_at',(select sla_due_at from public.applications where id=a.id),'target_anchor','explicit adoption time','request_id',_request));
 else raise exception 'Unsupported policy command';end if;
 if _kind<>'adopt' then insert into public.config_audit(actor_id,template_id,action,detail) values(uid,t.id,'policy_'||_kind,jsonb_build_object('revision',t.revision,'definition_hash',t.definition_hash,'note',reason,'request_id',_request));end if;
 result:=to_jsonb(t);insert into fp_private.control_receipts values(_request,uid,body,result);return result;
end $$;
create function public.fp_policy_command(_kind text,_id uuid,_payload jsonb,_expected int,_request uuid) returns jsonb language sql security invoker set search_path='' as $$select fp_private.policy_command(_kind,_id,_payload,_expected,_request)$$;
revoke all on function fp_private.policy_valid(jsonb),fp_private.policy_due(timestamptz,int,jsonb),fp_private.policy_shape(jsonb),fp_private.policy_command(text,uuid,jsonb,int,uuid),public.fp_policy_command(text,uuid,jsonb,int,uuid) from public,anon,authenticated;
grant execute on function fp_private.policy_command(text,uuid,jsonb,int,uuid),public.fp_policy_command(text,uuid,jsonb,int,uuid) to authenticated;
create function fp_private.freeze_published_workflow() returns trigger language plpgsql set search_path='' as $$begin if old.status<>'draft' and (new.definition,new.name,new.source_url,new.source_hash,new.definition_hash,new.review_note,new.reviewed_by,new.reviewed_at) is distinct from (old.definition,old.name,old.source_url,old.source_hash,old.definition_hash,old.review_note,old.reviewed_by,old.reviewed_at) then raise exception 'Published workflow contents are immutable; create a reviewed revision';end if;return new;end $$;
create trigger freeze_published_workflow before update on public.workflow_templates for each row execute function fp_private.freeze_published_workflow();
notify pgrst,'reload schema';commit;
