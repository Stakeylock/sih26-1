begin;
-- Task 10 backend: time-bounded access, explicit revocation, and the read-only agent registry.
-- Everything here is DEMO ONLY synthetic configuration authorization; mutation stays RPC-only.

alter table public.user_roles
  add column expires_at timestamptz,
  add column revoked_at timestamptz,
  add column granted_by uuid,
  add column grant_reason text;
create index on public.user_roles(expires_at) where active;

-- The audit table already existed in the baseline; this adds the explicit
-- actor/target/role/reason shape used by the access RPCs (detail stays jsonb).
alter table public.config_audit
  add column target_user uuid,
  add column role public.app_role,
  add column reason text;

-- A grant is authority only while active, unrevoked, and unexpired.
-- in_region shares the filters so expired or revoked officers also lose can_view.
create or replace function fp_private.has_role(r public.app_role, area text default null) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=fp_private.actor() and role=r and active and revoked_at is null
    and (expires_at is null or expires_at>now())
    and (r in ('institution','national_admin') or region=area));
$$;
create or replace function fp_private.in_region(area text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=fp_private.actor() and active and revoked_at is null
    and (expires_at is null or expires_at>now()) and role<>'institution'
    and (role='national_admin' or region=area));
$$;
-- Self-check RPC follows the same contract so clients cannot read stale grants.
drop function if exists public.has_role(uuid,public.app_role);
create function public.has_role(_user_id uuid,_role public.app_role) returns boolean language sql stable security invoker set search_path='' as $$
  select _user_id=auth.uid() and exists(select 1 from public.user_roles where user_id=auth.uid() and role=_role and active
    and revoked_at is null and (expires_at is null or expires_at>now()));
$$;

-- Replaces the three-argument legacy signature; grants are now reason-bearing and dated.
drop function if exists public.fp_assign_role(_user uuid,_role public.app_role,_region text);
drop function if exists fp_private.assign_role(_user uuid,_role public.app_role,_region text);

create function fp_private.assign_role(_user uuid,_role public.app_role,_region text,_expires timestamptz,_reason text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=fp_private.actor();
begin
  if not fp_private.has_role('national_admin') then raise exception 'Administrator required' using errcode='42501'; end if;
  if coalesce(length(trim(_reason)),0) not between 10 and 1000 then raise exception 'A grant reason of 10-1000 characters is required'; end if;
  if _expires is not null and _expires<=now() then raise exception 'An expiry in the future is required for officer roles'; end if;
  if _role<>'institution' and _expires is null then raise exception 'An expiry in the future is required for officer roles'; end if;
  insert into public.user_roles(user_id,role,region,expires_at,revoked_at,active,granted_by,grant_reason)
    values(_user,_role,_region,_expires,null,true,uid,trim(_reason))
    on conflict(user_id,role) do update set region=excluded.region,active=true,revoked_at=null,
      expires_at=excluded.expires_at,granted_by=excluded.granted_by,grant_reason=excluded.grant_reason;
  insert into public.config_audit(actor_id,target_user,role,action,reason,detail)
    values(uid,_user,_role,'assign_role',trim(_reason),
      jsonb_build_object('user',_user,'role',_role,'region',_region,'expires_at',_expires,'reason',trim(_reason)));
end $$;
create function public.fp_assign_role(_user uuid,_role public.app_role,_region text,_expires timestamptz,_reason text) returns void language sql security invoker set search_path='' as $$
  select fp_private.assign_role(_user,_role,_region,_expires,_reason)
$$;

create function fp_private.revoke_role(_user uuid,_role public.app_role,_reason text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=fp_private.actor();
begin
  if not fp_private.has_role('national_admin') then raise exception 'Administrator required' using errcode='42501'; end if;
  if coalesce(length(trim(_reason)),0) not between 10 and 1000 then raise exception 'A revocation reason of 10-1000 characters is required'; end if;
  update public.user_roles set active=false,revoked_at=now() where user_id=_user and role=_role and revoked_at is null;
  if not found then raise exception 'No live grant to revoke for this user and role' using errcode='42501'; end if;
  insert into public.config_audit(actor_id,target_user,role,action,reason,detail)
    values(uid,_user,_role,'revoke_role',trim(_reason),
      jsonb_build_object('user',_user,'role',_role,'reason',trim(_reason)));
end $$;
create function public.fp_revoke_role(_user uuid,_role public.app_role,_reason text) returns void language sql security invoker set search_path='' as $$
  select fp_private.revoke_role(_user,_role,_reason)
$$;

-- Agents are registry entries only. can_approve cannot be true by table constraint,
-- and no RPC writes this table, so no agent can carry approval authority.
create table public.agent_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null,
  scopes text[] not null default '{}',
  can_approve boolean not null default false check (can_approve=false),
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.agent_registry enable row level security;
revoke all on public.agent_registry from anon,authenticated;
grant select on public.agent_registry to authenticated;
grant all on public.agent_registry to service_role;
create policy agent_registry_read on public.agent_registry for select to authenticated using(fp_private.actor() is not null);

create function fp_private.agent_registry() returns setof public.agent_registry language sql stable security definer set search_path='' as $$
  select * from public.agent_registry order by created_at
$$;
create function public.fp_agent_registry() returns setof public.agent_registry language sql security invoker set search_path='' as $$
  select * from fp_private.agent_registry()
$$;

revoke execute on function public.has_role(uuid,public.app_role),public.fp_assign_role(uuid,public.app_role,text,timestamptz,text),public.fp_revoke_role(uuid,public.app_role,text),public.fp_agent_registry() from public,anon,authenticated;
revoke execute on function fp_private.assign_role(uuid,public.app_role,text,timestamptz,text),fp_private.revoke_role(uuid,public.app_role,text),fp_private.agent_registry() from public,anon,authenticated;
grant execute on function public.has_role(uuid,public.app_role),public.fp_assign_role(uuid,public.app_role,text,timestamptz,text),public.fp_revoke_role(uuid,public.app_role,text),public.fp_agent_registry(),fp_private.assign_role(uuid,public.app_role,text,timestamptz,text),fp_private.revoke_role(uuid,public.app_role,text),fp_private.agent_registry() to authenticated;
notify pgrst,'reload schema';
commit;
