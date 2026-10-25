begin;
create or replace function fp_private.policy_command(_kind text,_id uuid,_payload jsonb,_expected int,_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if t.status<>'draft' or t.reviewed_by is null or not fp_private.policy_valid(t.definition) or not t.definition?'calendar' or t.definition_hash<>encode(sha256(convert_to(t.definition::text,'UTF8')),'hex') then raise exception 'Publication requires a reviewed draft with an explicitly recorded calendar basis';end if;
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
revoke all on function fp_private.policy_command(text,uuid,jsonb,int,uuid),public.fp_policy_command(text,uuid,jsonb,int,uuid) from public,anon,authenticated;
grant execute on function fp_private.policy_command(text,uuid,jsonb,int,uuid),public.fp_policy_command(text,uuid,jsonb,int,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
