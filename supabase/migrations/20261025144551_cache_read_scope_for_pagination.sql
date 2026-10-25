begin;
-- Each scalar SELECT becomes a statement initplan. Live grants are read once,
-- rather than rechecking the session and looking up the same case for every row.
create function fp_private.read_scope() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=fp_private.actor();result jsonb;
begin
 select jsonb_build_object('actor',uid,'institution',coalesce(bool_or(role='institution'),false),'national',coalesce(bool_or(role='national_admin'),false),'regions',coalesce(jsonb_agg(region) filter(where role not in('institution','national_admin')),'[]')) into result
 from public.user_roles where user_id=uid and active and revoked_at is null and(expires_at is null or expires_at>now());return result;
end $$;
revoke all on function fp_private.read_scope() from public,anon;grant execute on function fp_private.read_scope() to authenticated;
drop policy application_scope on public.applications;
create policy application_scope on public.applications for select to authenticated using(
 (owner_id=((select fp_private.read_scope())->>'actor')::uuid and ((select fp_private.read_scope())->>'institution')::boolean)
 or(status<>'draft' and (((select fp_private.read_scope())->>'national')::boolean or region in(select jsonb_array_elements_text((select fp_private.read_scope())->'regions')))));
drop policy institution_scope on public.institutions;
create policy institution_scope on public.institutions for select to authenticated using(owner_id=((select fp_private.read_scope())->>'actor')::uuid or ((select fp_private.read_scope())->>'national')::boolean or region in(select jsonb_array_elements_text((select fp_private.read_scope())->'regions')));
create index applications_owner_due_cursor on public.applications(owner_id,sla_due_at,id);
commit;
