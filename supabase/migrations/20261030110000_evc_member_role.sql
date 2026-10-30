begin;

-- OQ-15: Support evc_member role in database schema with regional jurisdiction
alter type public.app_role add value if not exists 'evc_member' after 'evc_coordinator';

alter table public.user_roles drop constraint if exists role_jurisdiction;
alter table public.user_roles add constraint role_jurisdiction check (
  (role in ('institution','national_admin') and region is null) or
  (role in ('scrutiny_officer','evc_coordinator','evc_member','regional_officer') and region in ('North','South','East','West','Central','North-East') and region is not null)
);

commit;
