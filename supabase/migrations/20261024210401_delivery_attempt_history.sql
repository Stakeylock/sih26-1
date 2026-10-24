begin;
alter function fp_private.policy_due(timestamptz,int,jsonb) set timezone='UTC';
create table public.delivery_attempts(id uuid primary key default gen_random_uuid(),outbox_id uuid not null references public.delivery_outbox(id),attempt int not null,state text not null,detail text not null,happened_at timestamptz not null default now());
create index on public.delivery_attempts(outbox_id,happened_at);
alter table public.delivery_attempts enable row level security;
revoke all on public.delivery_attempts from public,anon,authenticated;grant select on public.delivery_attempts to authenticated;grant select,insert on public.delivery_attempts to service_role;
create policy delivery_attempt_read on public.delivery_attempts for select to authenticated using(exists(select 1 from public.delivery_outbox o where o.id=outbox_id and fp_private.can_view(o.application_id)));
create function fp_private.record_delivery_attempt() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' or new.status is distinct from old.status or new.attempts is distinct from old.attempts then insert into public.delivery_attempts(outbox_id,attempt,state,detail) values(new.id,new.attempts,new.status,coalesce(new.last_error,case when new.status='processing' then 'Trusted worker claimed this attempt.' else 'Source-bound intent registered.' end));end if;return new;end $$;
create trigger record_delivery_attempt after insert or update on public.delivery_outbox for each row execute function fp_private.record_delivery_attempt();
create function fp_private.freeze_delivery_history() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Delivery attempt history is immutable';end $$;
create trigger freeze_delivery_history before update or delete on public.delivery_attempts for each row execute function fp_private.freeze_delivery_history();
create function public.fp_case_reviews() returns jsonb language plpgsql security definer set search_path='' as $$begin perform fp_private.actor();return (select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('basis_current',r.basis_hash=fp_private.case_content(r.application_id)) order by r.created_at desc),'[]') from(select * from public.case_reviews where fp_private.can_view(application_id) order by created_at desc limit 500) r);end $$;
revoke all on function public.fp_case_reviews() from public,anon,authenticated;grant execute on function public.fp_case_reviews() to authenticated;
notify pgrst,'reload schema';commit;
