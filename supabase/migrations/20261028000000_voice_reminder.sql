-- Allow simulated voice reminder records. No telephony gateway exists; the
-- channel stores a rehearsal outcome, never a placed call.
alter table public.notifications drop constraint if exists notifications_channel_check;
alter table public.notifications add constraint notifications_channel_check check(channel in ('in_app','email','sms','voice'));
notify pgrst,'reload schema';
