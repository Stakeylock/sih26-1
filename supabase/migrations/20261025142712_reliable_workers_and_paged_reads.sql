begin;
create index applications_due_cursor on public.applications(sla_due_at,id);
create index applications_region_due_cursor on public.applications(region,sla_due_at,id);

create function public.fp_application_page(_scope text default 'active',_query text default '',_region text default null,_status text default null,_cursor jsonb default null,_limit int default 25) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; page_size int:=least(greatest(coalesce(_limit,25),1),100);
begin
 perform fp_private.actor();
 if _scope not in('active','closed','all') or length(coalesce(_query,''))>200 then raise exception 'Invalid register filters';end if;
 with filtered as (
  select a.*,i.name as institution_name from public.applications a join public.institutions i on i.id=a.institution_id
  where (_scope='all' or (_scope='active' and a.status not in('draft','approved','rejected')) or (_scope='closed' and a.status in('approved','rejected')))
   and (_region is null or a.region=_region) and (_status is null or a.status::text=_status)
   and (coalesce(_query,'')='' or strpos(lower(a.ref_no||' '||a.title||' '||i.name),lower(_query))>0)
 ), candidates as (
  select * from filtered where _cursor is null or (coalesce(sla_due_at,'infinity'::timestamptz),id)>(coalesce((_cursor->>'due_at')::timestamptz,'infinity'::timestamptz),(_cursor->>'id')::uuid)
  order by sla_due_at asc nulls last,id limit page_size+1
 ), page as(select * from candidates order by sla_due_at asc nulls last,id limit page_size)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.sla_due_at asc nulls last,p.id) from page p),'[]'),
 'next_cursor',case when (select count(*) from candidates)>page_size then (select jsonb_build_object('due_at',p.sla_due_at,'id',p.id) from page p order by p.sla_due_at desc nulls first,p.id desc limit 1) else null end,
 'total',(select count(*) from filtered),'counts',(select jsonb_build_object('all',count(*),'active',count(*) filter(where status not in('draft','approved','rejected')),'closed',count(*) filter(where status in('approved','rejected'))) from public.applications),
 'as_of',clock_timestamp()) into result;
 return result;
end $$;
revoke all on function public.fp_application_page(text,text,text,text,jsonb,int) from public,anon;
grant execute on function public.fp_application_page(text,text,text,text,jsonb,int) to authenticated;

create function public.fp_case_bundle(_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.applications;result jsonb;pair record;rows jsonb;
begin
 perform fp_private.actor();select * into a from public.applications where id=_id;if a.id is null then raise exception 'Case unavailable' using errcode='42501';end if;
 result:=jsonb_build_object('applications',jsonb_build_array(to_jsonb(a)),'institutions',(select jsonb_agg(to_jsonb(i)) from public.institutions i where id=a.institution_id));
 for pair in select * from (values('documents','application_documents'),('checklist','checklist_items'),('visits','evc_visits'),('obligations','obligations'),('claims','application_claims'),('deficiencies','deficiencies'),('integrity_signals','integrity_signals'),('scope_requests','application_scope_items'),('deadlines','applied_deadlines'),('reminder_intents','deadline_reminder_intents'),('expert_reservations','expert_reservations'),('delivery_outbox','delivery_outbox')) v(key,tablename) loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r where application_id=$1',pair.tablename) into rows using _id;result:=result||jsonb_build_object(pair.key,rows);
 end loop;
 result:=result||jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence),'[]') from(select * from public.application_events where application_id=_id order by sequence desc limit 100) e),
 'claim_evidence',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.claim_evidence e join public.application_claims c on c.id=e.claim_id where c.application_id=_id),
 'approvals',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.approval_records r where institution_id=a.institution_id),
 'approval_scope',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.approval_scope_items s join public.approval_records r on r.id=s.approval_id where r.institution_id=a.institution_id),
 'case_reviews',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(public.fp_case_reviews()) r where r->>'application_id'=_id::text),
 'delivery_attempts',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.delivery_attempts t join public.delivery_outbox o on o.id=t.outbox_id where o.application_id=_id));
 return result;
end $$;
revoke all on function public.fp_case_bundle(uuid) from public,anon;
grant execute on function public.fp_case_bundle(uuid) to authenticated;

-- Pending reminder work survives transaction rollback. Failed items have bounded retries.
alter table public.deadline_reminder_intents drop constraint deadline_reminder_intents_status_check;
alter table public.deadline_reminder_intents add constraint deadline_reminder_intents_status_check check(status in('pending','sent','superseded','cancelled','retry_wait','exhausted'));
alter table public.deadline_reminder_intents add column attempts int not null default 0,add column next_attempt_at timestamptz not null default now(),add column last_error text;
create index reminder_retry_queue on public.deadline_reminder_intents(next_attempt_at,scheduled_for,id) where status in('pending','retry_wait');
create or replace function fp_private.process_deadline_reminders(_limit int) returns int language plpgsql security definer set search_path='' as $$
declare candidate record;r public.deadline_reminder_intents;d public.applied_deadlines;a public.applications;done int:=0;
begin
 for candidate in select id,application_id from public.deadline_reminder_intents where status in('pending','retry_wait') and scheduled_for<=now() and next_attempt_at<=now() order by next_attempt_at,scheduled_for,id limit least(greatest(coalesce(_limit,0),0),100) loop
  select * into a from public.applications where id=candidate.application_id for update skip locked;if not found then continue;end if;
  select * into r from public.deadline_reminder_intents where id=candidate.id and status in('pending','retry_wait') for update skip locked;if not found then continue;end if;
  update public.deadline_reminder_intents set attempts=attempts+1 where id=r.id;
  begin
   select * into d from public.applied_deadlines where id=r.deadline_id;
   if d.status<>'active' or (d.obligation_id is null and(a.status in('draft','approved','rejected') or a.sla_due_at is distinct from d.new_due_at)) or(d.obligation_id is not null and not exists(select 1 from public.obligations o where o.id=d.obligation_id and o.status<>'fulfilled' and o.deadline_revision=d.subject_revision)) then update public.deadline_reminder_intents set status='cancelled' where id=r.id;continue;end if;
   insert into public.notifications(user_id,title,body,application_id) values(r.recipient_id,'Synthetic deadline reminder · '||a.ref_no,'Recorded source version '||d.source_version||'; due '||d.new_due_at::text||'. In-app reminder only.',a.id);
   update public.deadline_reminder_intents set status='sent',sent_at=now(),last_error=null where id=r.id;done:=done+1;
  exception when others then
   update public.deadline_reminder_intents set status=case when attempts>=5 then 'exhausted' else 'retry_wait' end,last_error='Reminder transaction failed ('||sqlstate||')',next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::int)) where id=r.id;
  end;
 end loop;return done;
end $$;

alter table public.delivery_outbox add column source_event_id bigint references public.application_events(id);
create unique index delivery_event_identity on public.delivery_outbox(source_event_id,recipient_id,channel) where source_event_id is not null;
create function fp_private.queue_workflow_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.applications;generation int;
begin
 if new.action not in('raise_deficiency','approve','reject') then return new;end if;
 select * into a from public.applications where id=new.application_id for update;
 select coalesce(max(o.generation),0)+1 into generation from public.delivery_outbox o where o.application_id=a.id;
 insert into public.delivery_outbox(application_id,recipient_id,channel,generation,source_hash,title,body,source_event_id)
 values(a.id,a.owner_id,'in_app',generation,fp_private.delivery_source(a.id,a.owner_id),'Case update · '||a.ref_no,'Recorded stage: '||a.status::text||'. Open the case to inspect the recorded action and evidence.',new.id) on conflict do nothing;return new;
end $$;
revoke all on function fp_private.queue_workflow_notification() from public,anon,authenticated;
create trigger workflow_notification after insert on public.application_events for each row execute function fp_private.queue_workflow_notification();

create table public.document_scan_jobs(id uuid primary key default gen_random_uuid(),document_id uuid not null unique references public.application_documents(id),application_id uuid not null references public.applications(id),status text not null default 'pending' check(status in('pending','processing','retry_wait','clean','rejected','exhausted')),attempts int not null default 0,next_attempt_at timestamptz not null default now(),lease_until timestamptz,last_error text,engine text,created_at timestamptz not null default now(),completed_at timestamptz);
alter table public.document_scan_jobs enable row level security;
revoke all on public.document_scan_jobs from public,anon,authenticated;grant select on public.document_scan_jobs to authenticated;grant all on public.document_scan_jobs to service_role;
create policy scan_job_read on public.document_scan_jobs for select to authenticated using(fp_private.can_view(application_id));
create index scan_due_queue on public.document_scan_jobs(next_attempt_at,id) where status in('pending','retry_wait','processing');
create table fp_private.scan_leases(id uuid primary key references public.document_scan_jobs(id),token uuid not null);
revoke all on fp_private.scan_leases from public,anon,authenticated;
create function fp_private.enqueue_scan(_document uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.application_documents;
begin perform fp_private.actor();select * into d from public.application_documents where id=_document;
 if d.id is null or not fp_private.can_edit(d.application_id) or d.scan_status<>'pending' then raise exception 'Pending editable document required' using errcode='42501';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='application-docs' and o.name=d.file_path and (o.metadata->>'size')::bigint=d.size_bytes) then raise exception 'Upload is not complete';end if;
 insert into public.document_scan_jobs(document_id,application_id) values(d.id,d.application_id) on conflict(document_id) do nothing;
end $$;
create function public.fp_enqueue_scan(_document uuid) returns void language sql security invoker set search_path='' as $$select fp_private.enqueue_scan(_document)$$;
revoke all on function fp_private.enqueue_scan(uuid),public.fp_enqueue_scan(uuid) from public,anon;grant execute on function fp_private.enqueue_scan(uuid),public.fp_enqueue_scan(uuid) to authenticated;
create function fp_private.scan_claim(_limit int) returns jsonb language plpgsql security definer set search_path='' as $$
declare item record;a public.applications;j public.document_scan_jobs;d public.application_documents;token uuid;result jsonb:='[]';
begin
 -- Recovery for a client that uploaded bytes but lost the finalize response.
 insert into public.document_scan_jobs(document_id,application_id) select doc.id,doc.application_id from public.application_documents doc join storage.objects o on o.name=doc.file_path and o.bucket_id='application-docs' where doc.scan_status='pending' and not exists(select 1 from public.document_scan_jobs queued where queued.document_id=doc.id) order by doc.uploaded_at limit 100 on conflict(document_id) do nothing;
 for item in select id,application_id from public.document_scan_jobs where (status in('pending','retry_wait') and next_attempt_at<=now()) or(status='processing' and lease_until<now()) order by next_attempt_at,id limit least(greatest(coalesce(_limit,1),1),25) loop
  select * into a from public.applications where id=item.application_id for update skip locked;if not found then continue;end if;
  select * into j from public.document_scan_jobs where id=item.id and ((status in('pending','retry_wait') and next_attempt_at<=now()) or(status='processing' and lease_until<now())) for update skip locked;if not found then continue;end if;
  if j.attempts>=5 then update public.document_scan_jobs set status='exhausted',last_error='Worker lease expired after final attempt' where id=j.id;continue;end if;
  select * into d from public.application_documents where id=j.document_id;
  if d.scan_status<>'pending' then update public.document_scan_jobs set status=case when d.scan_status='clean' then 'clean' else 'rejected' end,completed_at=now() where id=j.id;continue;end if;
  token:=gen_random_uuid();insert into fp_private.scan_leases values(j.id,token) on conflict(id) do update set token=excluded.token;
  update public.document_scan_jobs set status='processing',attempts=attempts+1,lease_until=now()+interval '5 minutes' where id=j.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',j.id,'document_id',d.id,'file_path',d.file_path,'mime_type',d.mime_type,'size_bytes',d.size_bytes,'lease_token',token));
 end loop;return result;
end $$;
create function fp_private.scan_finish(_id uuid,_token uuid,_outcome text,_sha256 text,_engine text,_detail text) returns text language plpgsql security definer set search_path='' as $$
declare j public.document_scan_jobs;a public.applications;
begin
 select a1.* into a from public.applications a1 join public.document_scan_jobs j1 on j1.application_id=a1.id where j1.id=_id for update of a1;
 select * into j from public.document_scan_jobs where id=_id for update;
 if j.status<>'processing' or j.lease_until<clock_timestamp() or not exists(select 1 from fp_private.scan_leases where id=j.id and token=_token) then raise exception 'Current scan lease required';end if;
 if _outcome='retry_wait' then update public.document_scan_jobs set status=case when attempts>=5 then 'exhausted' else 'retry_wait' end,next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::int)),lease_until=null,last_error=left(_detail,500) where id=j.id returning status into _outcome;
 elsif _outcome in('clean','rejected') and _engine like 'ClamAV %' and _sha256~'^[a-f0-9]{64}$' then
  perform fp_private.complete_document(j.document_id,_sha256,_outcome='clean',_engine);
  update public.document_scan_jobs set status=_outcome,engine=left(_engine,120),last_error=case when _outcome='rejected' then left(_detail,500) else null end,completed_at=now(),lease_until=null where id=j.id;
 else raise exception 'Verified scanner outcome required';end if;
 delete from fp_private.scan_leases where id=j.id;return _outcome;
end $$;
create function public.fp_scan_claim(_limit int default 5) returns jsonb language sql security invoker set search_path='' as $$select fp_private.scan_claim(_limit)$$;
create function public.fp_scan_finish(_id uuid,_token uuid,_outcome text,_sha256 text,_engine text,_detail text) returns text language sql security invoker set search_path='' as $$select fp_private.scan_finish(_id,_token,_outcome,_sha256,_engine,_detail)$$;
revoke all on function fp_private.scan_claim(int),fp_private.scan_finish(uuid,uuid,text,text,text,text),public.fp_scan_claim(int),public.fp_scan_finish(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function fp_private.scan_claim(int),fp_private.scan_finish(uuid,uuid,text,text,text,text),public.fp_scan_claim(int),public.fp_scan_finish(uuid,uuid,text,text,text,text) to service_role;

create function public.fp_worker_jobs(_application uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin perform fp_private.actor();if not exists(select 1 from public.applications where id=_application) then raise exception 'Case unavailable' using errcode='42501';end if;
 return jsonb_build_object('scans',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from public.document_scan_jobs j where application_id=_application),'deadlines',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from public.deadline_reminder_intents j where application_id=_application),'checked_at',clock_timestamp());end $$;
revoke all on function public.fp_worker_jobs(uuid) from public,anon;grant execute on function public.fp_worker_jobs(uuid) to authenticated;
create function fp_private.job_retry(_kind text,_id uuid,_expected int,_note text,_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare app_id uuid;a public.applications;receipt fp_private.control_receipts;uid uuid:=fp_private.actor();body jsonb:=jsonb_build_object('kind',_kind,'id',_id,'version',_expected,'note',_note);
begin
 if _kind='scan' then select application_id into app_id from public.document_scan_jobs where id=_id;elsif _kind='deadline' then select application_id into app_id from public.deadline_reminder_intents where id=_id;else raise exception 'Unsupported job kind';end if;
 select * into a from public.applications where id=app_id for update;
 if a.id is null or not fp_private.can_view(a.id) or not fp_private.can_manage_case(a) then raise exception 'Case manager required' using errcode='42501';end if;
 select * into receipt from fp_private.control_receipts where request_id=_request;if found then if receipt.actor_id<>uid or receipt.input<>body then raise exception 'Request ID already used';end if;return;end if;
 if a.version is distinct from _expected or _request is null or length(trim(_note)) not between 10 and 2000 then raise exception 'Current case and recorded retry reason required';end if;
 if _kind='scan' then update public.document_scan_jobs set status='pending',attempts=0,next_attempt_at=now(),last_error=null where id=_id and status in('retry_wait','exhausted');else update public.deadline_reminder_intents set status='pending',attempts=0,next_attempt_at=now(),last_error=null where id=_id and status in('retry_wait','exhausted');end if;
 if not found then raise exception 'Only failed or waiting jobs can be retried';end if;
 update public.applications set version=version+1,updated_at=now() where id=a.id;
 perform fp_private.event(a.id,'job_retried',a.status,a.status,trim(_note),jsonb_build_object('job_id',_id,'kind',_kind));
 insert into fp_private.control_receipts(request_id,actor_id,input,result) values(_request,uid,body,'{}');
end $$;
create function public.fp_job_retry(_kind text,_id uuid,_expected int,_note text,_request uuid) returns void language sql security invoker set search_path='' as $$select fp_private.job_retry(_kind,_id,_expected,_note,_request)$$;
revoke all on function fp_private.job_retry(text,uuid,int,text,uuid),public.fp_job_retry(text,uuid,int,text,uuid) from public,anon;grant execute on function fp_private.job_retry(text,uuid,int,text,uuid),public.fp_job_retry(text,uuid,int,text,uuid) to authenticated;
commit;
