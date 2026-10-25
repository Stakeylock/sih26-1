begin;
create or replace function fp_private.readiness() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=fp_private.actor();h public.worker_health;pending_count bigint;failed_count bigint;age_seconds numeric;
begin
 if not fp_private.has_role('national_admin') and not exists(select 1 from public.user_roles where user_id=uid and role='regional_officer' and active and revoked_at is null and(expires_at is null or expires_at>now())) then raise exception 'Operational oversight role required' using errcode='42501';end if;
 select * into h from public.worker_health where id='clauseway-worker';
 select count(*),coalesce(extract(epoch from max(now()-created_at)),0) into pending_count,age_seconds from public.delivery_outbox where status in('pending','retry_wait','processing') and fp_private.can_view(application_id);
 select count(*) into failed_count from(select application_id from public.delivery_outbox where status in('exhausted','ambiguous') union all select application_id from public.document_scan_jobs where status='exhausted' union all select application_id from public.deadline_reminder_intents where status='exhausted') j where fp_private.can_view(application_id);
 return jsonb_build_object('checked_at',clock_timestamp(),'checks',jsonb_build_array(
 jsonb_build_object('name','Database and permission boundary','state','pass','detail','Current authenticated oversight scope is enforced.'),
 jsonb_build_object('name','Private document bucket configuration','state',case when exists(select 1 from storage.buckets where id='application-docs' and not public) then 'pass' else 'attention' end,'detail','Private storage configuration; scanner verdicts are recorded per uploaded document.'),
 jsonb_build_object('name','Background worker heartbeat','state',case when h.last_seen_at>now()-interval '90 seconds' and h.detail#>>'{tasks,deliveries,state}'='pass' and h.detail#>>'{tasks,deadlines,state}'='pass' then 'pass' else 'attention' end,'detail','Last observed worker tick: '||coalesce(h.last_seen_at::text,'not recorded')),
 jsonb_build_object('name','Malware scanner and signature freshness','state',case when h.last_seen_at>now()-interval '90 seconds' and h.detail#>>'{tasks,scanner,state}'='pass' then 'pass' else 'attention' end,'detail',coalesce(h.detail#>>'{tasks,scanner,result}','No recent verified scanner heartbeat')),
 jsonb_build_object('name','Delivery queue and failed jobs','state',case when failed_count=0 then 'pass' else 'attention' end,'detail',pending_count||' pending delivery intents; oldest age '||round(age_seconds)||' seconds; '||failed_count||' failed or ambiguous jobs in this scope.'),
 jsonb_build_object('name','Recovery and deployment release gates','state','attention','detail','Restore drills and remote deployment validation remain environment-specific. Local synthetic workload results do not certify production capacity.')));
end $$;
commit;
