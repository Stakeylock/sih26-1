begin;

alter table public.applications
  add column if not exists paused_remaining_working_days int,
  add column if not exists paused_at timestamptz,
  add column if not exists pause_reason text;

create or replace function fp_private.remaining_working_days(_due timestamptz,_calendar jsonb) returns int
language plpgsql stable set search_path='' as $$
declare cursor_date date:=(clock_timestamp() at time zone 'Asia/Kolkata')::date;due_date date:=(_due at time zone 'Asia/Kolkata')::date;result int:=0;key text;
begin
  if _due is null or _due<=clock_timestamp() then return 0;end if;
  if _calendar is null or _calendar='null'::jsonb or _calendar->>'basis'='calendar_days' then return greatest(0,ceil(extract(epoch from (_due-clock_timestamp()))/86400)::int);end if;
  while cursor_date<due_date loop
    cursor_date:=cursor_date+1;key:=cursor_date::text;
    if extract(isodow from cursor_date)<6 and not coalesce(_calendar->'holidays','[]'::jsonb)?key then result:=result+1;end if;
  end loop;
  return result;
end $$;

create or replace function fp_private.pause_application_clock() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='deficiency_raised' and old.status is distinct from new.status and old.sla_due_at is not null then
    new.paused_remaining_working_days:=fp_private.remaining_working_days(old.sla_due_at,old.template_snapshot->'calendar');
    new.paused_at:=clock_timestamp();
    new.pause_reason:=coalesce(new.pause_reason,'Institution correction window recorded.');
  elsif old.status='deficiency_raised' and new.status='resubmitted' and old.paused_remaining_working_days is not null then
    new.sla_due_at:=fp_private.policy_due(clock_timestamp(),old.paused_remaining_working_days,new.template_snapshot->'calendar');
    new.paused_remaining_working_days:=null;
    new.paused_at:=null;
    new.pause_reason:=null;
  end if;
  return new;
end $$;

drop trigger if exists a_pause_application_clock on public.applications;
create trigger a_pause_application_clock before update on public.applications for each row execute function fp_private.pause_application_clock();

create or replace function fp_private.relax_only_deadline() returns trigger language plpgsql set search_path='' as $$
begin
  if new.old_due_at is not null and new.new_due_at<new.old_due_at then raise exception 'Relax-only policy adoption cannot move a recorded deadline earlier';end if;
  return new;
end $$;

drop trigger if exists applied_deadline_relax_only on public.applied_deadlines;
create trigger applied_deadline_relax_only before insert on public.applied_deadlines for each row execute function fp_private.relax_only_deadline();

revoke all on function fp_private.remaining_working_days(timestamptz,jsonb),fp_private.pause_application_clock(),fp_private.relax_only_deadline() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
