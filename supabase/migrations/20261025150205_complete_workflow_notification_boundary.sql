begin;
alter function public.validate_definition(jsonb) set search_path='';
alter function public.stage_sla_days(jsonb,text) set search_path='';
create or replace function fp_private.queue_workflow_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.applications;generation int;
begin
 if new.action not in('raise_deficiency','deficiency_raised','approve','reject') then return new;end if;
 select * into a from public.applications where id=new.application_id for update;
 select coalesce(max(o.generation),0)+1 into generation from public.delivery_outbox o where o.application_id=a.id;
 insert into public.delivery_outbox(application_id,recipient_id,channel,generation,source_hash,title,body,source_event_id)
 values(a.id,a.owner_id,'in_app',generation,fp_private.delivery_source(a.id,a.owner_id),case when new.action in('raise_deficiency','deficiency_raised') then 'Correction recorded · ' else 'Case update · ' end||a.ref_no,'Recorded stage: '||a.status::text||'. Open the case to inspect the recorded action and evidence.',new.id) on conflict do nothing;return new;
end $$;
commit;
