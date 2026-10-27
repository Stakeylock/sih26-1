-- Add dispatch-related columns to notifications and the dispatch_notification RPC.
-- Channels: in_app (always available), email / sms (gated by configured provider,
-- otherwise reported as simulated -- no fabricated delivery claims).
alter table public.notifications add column channel text not null default 'in_app' check(channel in ('in_app','email','sms'));
alter table public.notifications add column delivery_status text not null default 'simulated' check(delivery_status in ('queued','delivered','sent_sandbox','simulated','failed'));
alter table public.notifications add column preview_url text;

create or replace function fp_private.dispatch_notification(
  _user uuid,
  _channel text,
  _kind text,
  _subject text,
  _body text,
  _application uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  n public.notifications;
  uid uuid := fp_private.actor();
  a public.applications;
begin
  select * into a from public.applications where id=_application;
  if a.id is null or not fp_private.can_view(a.id) then raise exception 'Application unavailable' using errcode='42501'; end if;
  insert into public.notifications(user_id, channel, delivery_status, kind, title, body, application_id, created_at)
  values (coalesce(_user, a.owner_id), _channel, 'simulated', _kind, _subject, _body, _application, now())
  returning * into n;
  return jsonb_build_object('notificationId', n.id, 'channel', n.channel, 'status', n.delivery_status, 'previewUrl', n.preview_url);
end $$;

create function public.fp_dispatch_notification(
  _user uuid,
  _channel text,
  _kind text,
  _subject text,
  _body text,
  _application uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select fp_private.dispatch_notification(_user, _channel, _kind, _subject, _body, _application)
$$;

grant execute on function public.fp_dispatch_notification(uuid,text,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
