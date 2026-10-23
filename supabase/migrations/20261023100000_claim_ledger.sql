begin;
create type public.claim_status as enum ('unverified','verified','deficient','not_applicable');
create type public.verification_method as enum ('document_review','cross_check','evc_physical','system_check');
create type public.deficiency_status as enum ('open','resolved','waived','escalated');

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  app_type public.app_type not null,
  version int not null default 1,
  code text not null,
  clause text not null,
  statement text not null,
  evidence_types text[] not null default '{}',
  verification_method public.verification_method not null default 'document_review',
  is_mandatory boolean not null default true,
  sort_order int not null default 0,
  active boolean not null default true,
  unique (app_type, version, code)
);

create table public.application_claims (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  requirement_id uuid not null references public.requirements(id),
  status public.claim_status not null default 'unverified',
  statement_snapshot text not null,
  clause_snapshot text not null,
  evidence_types_snapshot text[] not null default '{}',
  verification_method public.verification_method not null,
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, requirement_id)
);

create table public.claim_evidence (
  claim_id uuid not null references public.application_claims(id) on delete cascade,
  document_id uuid not null references public.application_documents(id) on delete cascade,
  linked_by uuid not null,
  linked_at timestamptz not null default now(),
  note text,
  primary key (claim_id, document_id)
);

create table public.deficiencies (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  claim_id uuid not null references public.application_claims(id) on delete cascade,
  clause text not null,
  observation text not null,
  remedy text not null,
  due_at timestamptz not null,
  status public.deficiency_status not null default 'open',
  raised_by uuid not null,
  raised_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  evidence_id uuid references public.application_documents(id),
  rechecked_by uuid,
  rechecked_at timestamptz,
  recheck_note text
);

create index on public.requirements(app_type, version) where active;
create index on public.application_claims(application_id, status);
create index on public.deficiencies(application_id, status);
create index on public.deficiencies(claim_id);

alter table public.requirements enable row level security;
alter table public.application_claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.deficiencies enable row level security;

revoke all on public.requirements,public.application_claims,public.claim_evidence,public.deficiencies from anon,authenticated;
grant select on public.requirements,public.application_claims,public.claim_evidence,public.deficiencies to authenticated;
grant all on public.requirements,public.application_claims,public.claim_evidence,public.deficiencies to service_role;

create policy requirements_read on public.requirements for select to authenticated using(active and fp_private.actor() is not null);
create policy claims_read on public.application_claims for select to authenticated using(fp_private.can_view(application_id));
create policy claim_evidence_read on public.claim_evidence for select to authenticated using(exists(
  select 1 from public.application_claims c where c.id=claim_id and fp_private.can_view(c.application_id)
));
create policy deficiencies_read on public.deficiencies for select to authenticated using(fp_private.can_view(application_id));

insert into public.requirements(app_type,version,code,clause,statement,evidence_types,verification_method,is_mandatory,sort_order) values
  ('extension_self_disclosure',1,'INSTITUTION_IDENTITY','APH identity','Institution name and AICTE reference match the trust record',array['Affidavit'],'cross_check',true,10),
  ('extension_self_disclosure',1,'ACADEMIC_YEAR','APH year','Academic year matches the application year',array['Affidavit'],'cross_check',true,20),
  ('extension_self_disclosure',1,'SANCTIONED_INTAKE','APH intake','Sanctioned intake matches the previous approval',array['Affidavit'],'cross_check',true,30),
  ('extension_self_disclosure',1,'FACULTY_STRENGTH','APH faculty','Faculty count and cadre ratio meet the declared norm',array['Faculty List'],'document_review',true,40),
  ('extension_self_disclosure',1,'STUDENT_FACULTY_RATIO','APH ratio','Student-faculty ratio is within the declared norm',array['Faculty List'],'system_check',true,50),
  ('extension_self_disclosure',1,'LAND_OWNERSHIP','APH land','Land ownership or lease is valid for the academic year',array['Land Document'],'document_review',true,60),
  ('extension_self_disclosure',1,'BUILT_UP_AREA','APH infrastructure','Built-up and instructional area meet the declared norm',array['Building Plan'],'document_review',true,70),
  ('extension_self_disclosure',1,'FIRE_SAFETY','APH safety','Fire safety certificate is valid on the scrutiny date',array['Fire Safety Certificate'],'document_review',true,80),
  ('extension_self_disclosure',1,'UNDERTAKING','APH undertaking','Institution accepts the post-approval undertakings',array['Undertaking'],'document_review',true,90)
on conflict(app_type,version,code) do update set
  clause=excluded.clause,
  statement=excluded.statement,
  evidence_types=excluded.evidence_types,
  verification_method=excluded.verification_method,
  is_mandatory=excluded.is_mandatory,
  sort_order=excluded.sort_order,
  active=true;

create function fp_private.seed_claims(_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.applications; req_version int;
begin
  select * into a from public.applications where id=_id;
  if a.id is null then raise exception 'Application unavailable'; end if;
  select max(version) into req_version from public.requirements where app_type=a.app_type and active;
  if req_version is null then return; end if;
  insert into public.application_claims(application_id,requirement_id,status,statement_snapshot,clause_snapshot,evidence_types_snapshot,verification_method)
  select a.id,r.id,'unverified',r.statement,r.clause,r.evidence_types,r.verification_method
  from public.requirements r
  where r.app_type=a.app_type and r.version=req_version and r.active
  on conflict(application_id,requirement_id) do nothing;
end $$;

create or replace function fp_private.create_application(_type public.app_type,_title text) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.institutions; t public.workflow_templates; result uuid;
begin
  if not fp_private.has_role('institution') or length(trim(_title)) not between 5 and 200 or _title is null then raise exception 'Institution role and a title of 5–200 characters required'; end if;
  select * into i from public.institutions where owner_id=fp_private.actor();
  if i.id is null then raise exception 'Complete your institution profile first'; end if;
  select * into t from public.workflow_templates where app_type=_type and status='published' order by version desc limit 1;
  if t.id is null then raise exception 'No published workflow'; end if;
  insert into public.applications(institution_id,owner_id,app_type,title,region,template_id,template_version,template_snapshot)
  values(i.id,fp_private.actor(),_type,trim(_title),i.region,t.id,t.version,t.definition) returning id into result;
  perform fp_private.seed_claims(result);
  perform fp_private.event(result,'created',null,'draft');
  return result;
end $$;

do $$ declare a record; begin
  for a in select id from public.applications loop perform fp_private.seed_claims(a.id); end loop;
end $$;

revoke all on function fp_private.seed_claims(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
