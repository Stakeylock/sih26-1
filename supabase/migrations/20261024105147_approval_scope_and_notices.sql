begin;
alter table public.notifications add column application_id uuid references public.applications;

-- Explicitly captured scope; existing dossiers have no invented academic-year scope.
alter table public.applications add column academic_year_start int check(academic_year_start between 2000 and 2100),
 add column scope_revision int not null default 0, add column scope_reviewed_revision int,
 add column scope_reviewed_by uuid references auth.users, add column scope_reviewed_at timestamptz, add column scope_review_note text;
create table public.approval_records(
 id uuid primary key default gen_random_uuid(),institution_id uuid not null references public.institutions,
 application_id uuid references public.applications,decision_event_id bigint not null references public.application_events,
 approval_type text not null check(length(approval_type) between 3 and 100),academic_year_start int not null check(academic_year_start between 2000 and 2100),
 academic_year_end int not null,valid_from date not null,valid_to date not null,conditions text[] not null default '{}',
 source_ref text not null,provenance text not null default 'recorded_decision' check(provenance='recorded_decision'),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users,
 check(academic_year_end between academic_year_start and academic_year_start+10),check(valid_to>=valid_from),unique(application_id),unique(decision_event_id));
create table public.application_scope_items(
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications,
 course_key text not null check(length(course_key) between 1 and 80),programme text not null check(length(programme) between 2 and 100),
 course_name text not null check(length(course_name) between 2 and 180),level text not null check(length(level) between 2 and 80),
 requested_intake int not null check(requested_intake between 1 and 100000),previous_scope_item_id uuid,
 previous_approved_intake int,unique(application_id,course_key));
create table public.approval_scope_items(
 id uuid primary key default gen_random_uuid(),approval_id uuid not null references public.approval_records,
 request_item_id uuid not null references public.application_scope_items,course_key text not null,programme text not null,course_name text not null,level text not null,
 previous_approved_intake int,requested_intake int not null,approved_intake int not null check(approved_intake>=0 and approved_intake<=requested_intake),unique(approval_id,course_key));
alter table public.application_scope_items add foreign key(previous_scope_item_id) references public.approval_scope_items;
alter table public.obligations add column approval_id uuid references public.approval_records,add column document_id uuid references public.application_documents,add column document_expiry_on date,
 add column required_evidence text[] not null default '{}',add column deadline_revision int not null default 1;
alter table public.obligations drop constraint obligations_deadline_source_check;
alter table public.obligations add constraint obligations_deadline_source_check check(deadline_source in('demo_sla','official_reference','reviewed_notice','document_validity'));
create unique index one_expiry_obligation_per_document on public.obligations(document_id) where kind='document_expiry' and document_id is not null;
alter table public.application_documents add column validity_mode text not null default 'unknown' check(validity_mode in ('unknown','dated','no_stated_expiry','not_applicable')),
 add column issue_date date,add column subject_institution_id uuid references public.institutions,
 add column supersedes_document_id uuid references public.application_documents,
 add column validity_reviewed_by uuid references auth.users,add column validity_reviewed_at timestamptz,add column validity_review_note text;
-- Known dates are retained, but this migration never invents an authorised review.
update public.application_documents d set validity_mode=case when expires_on is not null then 'dated' else 'unknown' end,
 subject_institution_id=a.institution_id from public.applications a where d.application_id=a.id;
create table public.policy_notices(
 id uuid primary key default gen_random_uuid(),code text not null unique check(length(code) between 3 and 80),title text not null check(length(title) between 5 and 200),
 issuer text not null check(length(issuer) between 3 and 200),source_url text not null check(source_url ~ '^(https://|demo://)'),
 source_version text not null check(length(source_version) between 1 and 100),source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 publication_date date not null,effective_date date not null check(effective_date>=publication_date),academic_year_start int not null check(academic_year_start between 2000 and 2100),
 application_type public.app_type,institution_id uuid references public.institutions,region text,
 deadline_kind text not null check(deadline_kind in ('application_sla','obligation')),obligation_kind text check(obligation_kind in ('undertaking','renewal','document_expiry')),
 trigger_type text not null check(trigger_type in ('fixed_date','application_submitted','document_expiry')),
 calendar_basis text not null check(calendar_basis in ('calendar_days','weekdays')),duration_days int check(duration_days between 0 and 3660),fixed_date date,
 supersedes_notice_id uuid references public.policy_notices,status text not null default 'draft' check(status in ('draft','reviewed','adopted')),
 revision int not null default 1,created_by uuid not null references auth.users,created_at timestamptz not null default now(),
 reviewed_by uuid references auth.users,reviewed_at timestamptz,review_note text,
 check((trigger_type='fixed_date' and fixed_date is not null and duration_days is null) or(trigger_type<>'fixed_date' and fixed_date is null and duration_days is not null)),
 check(deadline_kind='obligation' or (obligation_kind is null and trigger_type<>'document_expiry')));
create table public.notice_adoptions(id uuid primary key default gen_random_uuid(),notice_id uuid not null unique references public.policy_notices,
 actor_id uuid not null references auth.users,reason text not null,impact_hash text not null,created_at timestamptz not null default now());
create table public.applied_deadlines(
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications,obligation_id uuid references public.obligations,
 notice_id uuid not null references public.policy_notices,adoption_id uuid not null references public.notice_adoptions,
 subject_key text not null,subject_revision int not null,old_due_at timestamptz,new_due_at timestamptz not null,trigger_at timestamptz,
 calendar_basis text not null,source_version text not null,status text not null default 'active' check(status in ('active','superseded','closed')),created_at timestamptz not null default now());
create unique index one_active_deadline on public.applied_deadlines(subject_key) where status='active';
create table public.deadline_reminder_intents(
 id uuid primary key default gen_random_uuid(),deadline_id uuid not null references public.applied_deadlines,application_id uuid not null references public.applications,
 recipient_id uuid not null references auth.users,scheduled_for timestamptz not null,status text not null default 'pending' check(status in ('pending','sent','superseded','cancelled')),
 sent_at timestamptz,unique(deadline_id,recipient_id));
create index deadline_due_queue on public.deadline_reminder_intents(scheduled_for) where status='pending';
create table fp_private.governance_receipts(request_id uuid primary key,actor_id uuid not null,resource_id uuid,input jsonb not null,result jsonb not null);
create index scope_application on public.application_scope_items(application_id);
create index approval_institution on public.approval_records(institution_id);
create index approval_scope_parent on public.approval_scope_items(approval_id);
create index obligation_approval on public.obligations(approval_id);
create index applied_deadline_case on public.applied_deadlines(application_id);

create function fp_private.can_view_institution(_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.institutions i where i.id=_id and ((i.owner_id=fp_private.actor() and fp_private.has_role('institution')) or fp_private.has_role('national_admin') or fp_private.has_role('regional_officer',i.region) or exists(select 1 from public.applications a where a.institution_id=i.id and fp_private.can_view(a.id))));
$$;
alter table public.application_scope_items enable row level security;
alter table public.approval_records enable row level security;
alter table public.approval_scope_items enable row level security;
alter table public.policy_notices enable row level security;
alter table public.notice_adoptions enable row level security;
alter table public.applied_deadlines enable row level security;
alter table public.deadline_reminder_intents enable row level security;
create policy scope_read on public.application_scope_items for select to authenticated using(fp_private.can_view(application_id));
create policy approval_read on public.approval_records for select to authenticated using(fp_private.can_view_institution(institution_id));
create policy approved_scope_read on public.approval_scope_items for select to authenticated using(exists(select 1 from public.approval_records p where p.id=approval_id));
create policy notice_read on public.policy_notices for select to authenticated using(fp_private.has_role('national_admin') or (status<>'draft' and exists(select 1 from public.applications a where fp_private.can_view(a.id) and a.academic_year_start=policy_notices.academic_year_start and (policy_notices.institution_id is null or a.institution_id=policy_notices.institution_id) and (policy_notices.region is null or a.region=policy_notices.region) and (policy_notices.application_type is null or a.app_type=policy_notices.application_type))));
create policy adoption_read on public.notice_adoptions for select to authenticated using(fp_private.has_role('national_admin'));
create policy deadline_read on public.applied_deadlines for select to authenticated using(fp_private.can_view(application_id));
create policy reminder_read on public.deadline_reminder_intents for select to authenticated using(fp_private.can_view(application_id));
revoke all on public.application_scope_items,public.approval_records,public.approval_scope_items,public.policy_notices,public.notice_adoptions,public.applied_deadlines,public.deadline_reminder_intents from public,anon,authenticated;
grant select on public.application_scope_items,public.approval_records,public.approval_scope_items,public.policy_notices,public.notice_adoptions,public.applied_deadlines,public.deadline_reminder_intents to authenticated;
create trigger approval_immutable before update or delete on public.approval_records for each row execute function public.block_mutation();
create trigger approved_scope_immutable before update or delete on public.approval_scope_items for each row execute function public.block_mutation();
create trigger adoption_immutable before update or delete on public.notice_adoptions for each row execute function public.block_mutation();

create function fp_private.document_eligible(_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.application_documents d join public.applications a on a.id=d.application_id where d.id=_id
 and d.subject_institution_id=a.institution_id and d.scan_status='clean' and d.sha256 is not null
 and d.validity_reviewed_by is not null and d.validity_reviewed_at is not null
 and (d.issue_date is null or d.issue_date<=(now() at time zone 'Asia/Kolkata')::date)
 and ((d.validity_mode='no_stated_expiry' and d.expires_on is null) or (d.validity_mode='dated' and d.expires_on>=(now() at time zone 'Asia/Kolkata')::date)));
$$;
create or replace function fp_private.claim_evidence_valid(_claim uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.application_claims c join public.claim_evidence ce on ce.claim_id=c.id join public.application_documents d on d.id=ce.document_id
 where c.id=_claim and d.application_id=c.application_id and d.doc_type=any(c.evidence_types_snapshot) and fp_private.document_eligible(d.id));
$$;
alter function fp_private.recheck_deficiency(uuid,text,text) rename to recheck_deficiency_before_validity;
create function fp_private.recheck_deficiency(_deficiency uuid,_result text,_note text) returns void language plpgsql security definer set search_path='' as $$
declare response public.deficiencies;
begin
 select * into response from public.deficiencies where id=_deficiency;
 if _result='accepted' and not fp_private.document_eligible(response.evidence_id) then raise exception 'Current authorised validity review required for response evidence';end if;
 perform fp_private.recheck_deficiency_before_validity(_deficiency,_result,_note);
end $$;
create or replace function fp_private.review_basis(_claim uuid,_result public.claim_status) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.application_claims;a public.applications;inputs jsonb;evidence jsonb;evaluated jsonb;
begin
 select * into c from public.application_claims where id=_claim;select * into a from public.applications where id=c.application_id;
 if c.id is null then return null;end if;
 if _result='not_applicable' then inputs:=a.form_data;else select coalesce(jsonb_object_agg(k,a.form_data->k),'{}') into inputs from unnest(c.input_fields_snapshot) k;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'sha256',d.sha256,'doc_type',d.doc_type,'expires_on',d.expires_on,'scan_status',d.scan_status,
 'validity_mode',d.validity_mode,'issue_date',d.issue_date,'subject_institution_id',d.subject_institution_id,'supersedes_document_id',d.supersedes_document_id,'validity_reviewed_at',d.validity_reviewed_at,'validity_reviewed_by',d.validity_reviewed_by) order by d.id),'[]') into evidence
 from public.claim_evidence ce join public.application_documents d on d.id=ce.document_id where ce.claim_id=c.id and d.application_id=c.application_id and
 (_result='not_applicable' or(c.verification_method<>'system_check' and d.doc_type=any(c.evidence_types_snapshot) and fp_private.document_eligible(d.id)));
 if c.verification_method='system_check' and _result='verified' then evaluated:=fp_private.evaluate_system_claim(c.id);end if;
 return jsonb_build_object('schema',1,'result',_result,'method',c.verification_method,'clause',c.clause_snapshot,'requirement_version',c.requirement_version_snapshot,'mandatory',c.is_mandatory_snapshot,
 'evidence_types',to_jsonb(c.evidence_types_snapshot),'inputs',inputs,'documents',evidence,'system_result',evaluated);
end $$;

create function fp_private.notice_due(_notice public.policy_notices,_anchor timestamptz) returns timestamptz language plpgsql stable set search_path='' set timezone='Asia/Kolkata' as $$
declare due timestamptz:=_anchor;remaining int:=_notice.duration_days;
begin
 if _notice.trigger_type='fixed_date' then return ((_notice.fixed_date+time '23:59:59.999') at time zone 'Asia/Kolkata');end if;
 if due is null then raise exception 'A selected target has no recorded trigger date';end if;
 if _notice.calendar_basis='calendar_days' then return due+make_interval(days=>remaining);end if;
 while remaining>0 loop due:=due+interval '1 day';if extract(isodow from due at time zone 'Asia/Kolkata')<6 then remaining:=remaining-1;end if;end loop;
 return due;
end $$;
create function fp_private.notice_preview(_id uuid) returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare n public.policy_notices;items jsonb;row record;anchor timestamptz;due timestamptz;
begin
 if not fp_private.has_role('national_admin') then raise exception 'Notice administrator required' using errcode='42501';end if;
 select * into n from public.policy_notices where id=_id;
 if n.id is null or n.status<>'reviewed' or n.effective_date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Review an effective notice before previewing adoption';end if;
 items:='[]';
 for row in select a.id,a.ref_no,a.submitted_at,a.sla_due_at,a.version,o.id as obligation_id,o.title,o.due_date,o.deadline_revision,d.expires_on
 from public.applications a left join public.obligations o on n.deadline_kind='obligation' and o.application_id=a.id and o.status<>'fulfilled' and(n.obligation_kind is null or n.obligation_kind=o.kind)
 left join public.application_documents d on d.id=o.document_id
 where a.academic_year_start=n.academic_year_start and(n.application_type is null or a.app_type=n.application_type) and(n.institution_id is null or a.institution_id=n.institution_id) and(n.region is null or a.region=n.region)
 and ((n.deadline_kind='application_sla' and a.status not in ('draft','approved','rejected')) or(n.deadline_kind='obligation' and o.id is not null)) order by a.id,o.id
 loop
 anchor:=case when n.trigger_type='document_expiry' then (row.expires_on+time '23:59:59.999') at time zone 'Asia/Kolkata' else row.submitted_at end;
 due:=fp_private.notice_due(n,anchor);
 items:=items||jsonb_build_array(jsonb_build_object('subject_key',case when row.obligation_id is null then 'application:'||row.id else 'obligation:'||row.obligation_id end,
 'application_id',row.id,'obligation_id',row.obligation_id,'reference',row.ref_no||coalesce(' · '||row.title,''),'old_due_at',case when row.obligation_id is null then row.sla_due_at else (row.due_date+time '23:59:59.999') at time zone 'Asia/Kolkata' end,
 'new_due_at',due,'trigger_at',anchor,'revision',case when row.obligation_id is null then row.version else row.deadline_revision end));
 end loop;
 return jsonb_build_object('notice_id',n.id,'notice_revision',n.revision,'items',items,'impact_hash',encode(sha256(convert_to(jsonb_build_object('notice',to_jsonb(n),'items',items)::text,'UTF8')),'hex'));
end $$;

-- One guarded command surface, with fresh authorisation before reading a retry receipt.
create function fp_private.governance_command(_kind text,_id uuid,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=fp_private.actor();a public.applications;d public.application_documents;n public.policy_notices;p public.approval_records;prior public.approval_scope_items;
 receipt fp_private.governance_receipts;body jsonb:=jsonb_build_object('kind',_kind,'id',_id,'payload',_payload,'version',_expected_version);result jsonb:='{}';item jsonb;
 impact jsonb;adoption uuid;deadline uuid;old_deadline public.applied_deadlines;key text;year int;mode text;parent uuid;event_role text;kind text;selected uuid[];o public.obligations;
begin
 if _request_id is null or _payload is null or jsonb_typeof(_payload)<>'object' then raise exception 'Request ID and object payload required';end if;
 if _kind like 'notice_%' then
   if not fp_private.has_role('national_admin') then raise exception 'Notice administrator required' using errcode='42501';end if;
   if _kind<>'notice_create' then select * into n from public.policy_notices where id=_id for update;if n.id is null then raise exception 'Notice unavailable';end if;end if;
 else
   if _kind='document_validity' then select * into d from public.application_documents where id=_id;_id:=d.application_id;
   elsif _kind='obligation_fulfil' then select * into o from public.obligations where id=_id;_id:=o.application_id;end if;
   select * into a from public.applications where id=_id for update;
   if a.id is null or not fp_private.can_view(a.id) then raise exception 'Case unavailable' using errcode='42501';end if;
   if _kind='scope_save' then
     if not fp_private.can_edit(a.id) then raise exception 'Editable institution draft required' using errcode='42501';end if;
   elsif _kind='scope_review' then
     if a.owner_id=uid or a.status<>'under_scrutiny' or a.assigned_officer is distinct from uid or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501';end if;
   elsif _kind='document_validity' then
     if a.owner_id=uid or not((a.status='under_scrutiny' and a.assigned_officer=uid and fp_private.has_role('scrutiny_officer',a.region)) or fp_private.has_role('regional_officer',a.region) or fp_private.has_role('national_admin')) then raise exception 'Authorised validity reviewer required' using errcode='42501';end if;
   elsif _kind='obligation_fulfil' then
     if a.owner_id=uid or not(fp_private.has_role('regional_officer',a.region) or fp_private.has_role('national_admin')) then raise exception 'Compliance jurisdiction required' using errcode='42501';end if;
   else raise exception 'Unsupported command';end if;
 end if;
 select * into receipt from fp_private.governance_receipts where request_id=_request_id;
 if found then if receipt.actor_id<>uid or receipt.input<>body then raise exception 'Request ID already used';end if;return receipt.result;end if;
 if _kind<>'notice_create' and _expected_version is distinct from (case when _kind like 'notice_%' then n.revision else a.version end) then raise exception 'Record changed; reload before acting' using errcode='40001';end if;
 if _kind='scope_save' then
   year:=(_payload->>'academic_year_start')::int;
   if year is null or year not between 2000 and 2100 or jsonb_typeof(_payload->'items') is distinct from 'array' or jsonb_array_length(_payload->'items')>40 then raise exception 'Academic year and up to 40 course requests required';end if;
   delete from public.application_scope_items where application_id=a.id;
   for item in select value from jsonb_array_elements(_payload->'items') loop
     prior:=null;parent:=nullif(item->>'previous_scope_item_id','')::uuid;
     if parent is not null then
       select s.* into prior from public.approval_scope_items s join public.approval_records r on r.id=s.approval_id where s.id=parent and r.institution_id=a.institution_id and s.course_key=item->>'course_key' and r.academic_year_start<=year;
       if prior.id is null then raise exception 'Previous course scope must belong to this institution and course';end if;
     end if;
     insert into public.application_scope_items(application_id,course_key,programme,course_name,level,requested_intake,previous_scope_item_id,previous_approved_intake)
     values(a.id,trim(item->>'course_key'),trim(item->>'programme'),trim(item->>'course_name'),trim(item->>'level'),(item->>'requested_intake')::int,parent,prior.approved_intake);
   end loop;
   update public.applications set academic_year_start=year,scope_revision=scope_revision+1,scope_reviewed_revision=null,scope_reviewed_by=null,scope_reviewed_at=null,scope_review_note=null where id=a.id;
 elsif _kind='scope_review' then
   if a.scope_revision=0 or coalesce(length(trim(_payload->>'note')),0) not between 10 and 1000 then raise exception 'Saved scope and a review note required';end if;
   update public.applications set scope_reviewed_revision=scope_revision,scope_reviewed_by=uid,scope_reviewed_at=now(),scope_review_note=trim(_payload->>'note') where id=a.id;
 elsif _kind='document_validity' then
   select * into d from public.application_documents where id=d.id for update;
   if d.scan_status<>'clean' or d.sha256 is null then raise exception 'Scan must finish before validity review';end if;
   mode:=_payload->>'validity_mode';parent:=nullif(_payload->>'supersedes_document_id','')::uuid;
   if mode is null or mode not in ('unknown','dated','no_stated_expiry','not_applicable') or coalesce(length(trim(_payload->>'note')),0) not between 10 and 1000 then raise exception 'Validity mode and review explanation required';end if;
   if (mode='dated' and nullif(_payload->>'expires_on','') is null) or(mode<>'dated' and nullif(_payload->>'expires_on','') is not null) then raise exception 'Only dated validity requires an expiry date';end if;
   if nullif(_payload->>'issue_date','')::date>nullif(_payload->>'expires_on','')::date then raise exception 'Issue date must precede expiry';end if;
   if length(coalesce(_payload->>'issuer',''))>200 or length(coalesce(_payload->>'document_number',''))>200 then raise exception 'Document reference too long';end if;
   if parent is not null then
     if not exists(select 1 from public.application_documents x where x.id=parent and x.id<>d.id and x.application_id=a.id and x.doc_type=d.doc_type and x.subject_institution_id=a.institution_id) then raise exception 'Supersession requires another document of the same case, subject and type';end if;
     if exists(with recursive lineage as(select id,supersedes_document_id from public.application_documents where id=parent union select x.id,x.supersedes_document_id from public.application_documents x join lineage l on x.id=l.supersedes_document_id) select 1 from lineage where id=d.id) then raise exception 'Supersession cycle forbidden';end if;
   end if;
   update public.application_documents set validity_mode=mode,issue_date=nullif(_payload->>'issue_date','')::date,expires_on=nullif(_payload->>'expires_on','')::date,issuer=nullif(trim(_payload->>'issuer'),''),document_number=nullif(trim(_payload->>'document_number'),''),
   subject_institution_id=a.institution_id,supersedes_document_id=parent,validity_reviewed_by=uid,validity_reviewed_at=now(),validity_review_note=trim(_payload->>'note') where id=d.id;
   if mode='dated' and not exists(select 1 from public.obligations x where x.document_id=d.id and x.kind='document_expiry') then
    insert into public.obligations(institution_id,application_id,document_id,document_expiry_on,kind,title,due_date,region,required_evidence,deadline_source)
    values(a.institution_id,a.id,d.id,(_payload->>'expires_on')::date,'document_expiry','Document expiry follow-up · '||d.doc_type,(_payload->>'expires_on')::date,a.region,array[d.doc_type],'document_validity');
   end if;
 elsif _kind='obligation_fulfil' then
   select * into o from public.obligations where id=o.id for update;
   if o.status='fulfilled' or coalesce(length(trim(_payload->>'note')),0) not between 10 and 1000 then raise exception 'Open obligation and verification explanation required';end if;
   select coalesce(array_agg(value::uuid),'{}') into selected from jsonb_array_elements_text(_payload->'evidence_ids');
   if exists(select 1 from unnest(selected) x where not exists(select 1 from public.application_documents evidence_doc where evidence_doc.id=x and evidence_doc.application_id=a.id and fp_private.document_eligible(evidence_doc.id))) or exists(select 1 from unnest(o.required_evidence) t where not exists(select 1 from public.application_documents evidence_doc where evidence_doc.id=any(selected) and evidence_doc.doc_type=t and evidence_doc.application_id=a.id and fp_private.document_eligible(evidence_doc.id))) then raise exception 'Select reviewed current evidence of every required type';end if;
   if o.document_id is not null and not exists(select 1 from public.application_documents replacement where replacement.id=any(selected) and replacement.supersedes_document_id=o.document_id and replacement.id<>o.document_id and replacement.application_id=a.id and fp_private.document_eligible(replacement.id) and(replacement.validity_mode='no_stated_expiry' or replacement.expires_on>coalesce(o.document_expiry_on,o.due_date))) then raise exception 'Expiry follow-up requires a reviewed replacement extending the recorded evidence validity';end if;
   update public.obligations set status='fulfilled',deadline_revision=deadline_revision+1 where id=o.id;
   update public.applied_deadlines set status='closed' where obligation_id=o.id and status='active';
   update public.deadline_reminder_intents set status='cancelled' where status='pending' and deadline_id in(select id from public.applied_deadlines where obligation_id=o.id and status='closed');
 elsif _kind='notice_create' then
   insert into public.policy_notices(code,title,issuer,source_url,source_version,source_hash,publication_date,effective_date,academic_year_start,application_type,institution_id,region,deadline_kind,obligation_kind,trigger_type,calendar_basis,duration_days,fixed_date,supersedes_notice_id,created_by)
   values(trim(_payload->>'code'),trim(_payload->>'title'),trim(_payload->>'issuer'),_payload->>'source_url',_payload->>'source_version',_payload->>'source_hash',(_payload->>'publication_date')::date,(_payload->>'effective_date')::date,(_payload->>'academic_year_start')::int,nullif(_payload->>'application_type','')::public.app_type,nullif(_payload->>'institution_id','')::uuid,nullif(_payload->>'region',''),_payload->>'deadline_kind',nullif(_payload->>'obligation_kind',''),_payload->>'trigger_type',_payload->>'calendar_basis',(_payload->>'duration_days')::int,nullif(_payload->>'fixed_date','')::date,nullif(_payload->>'supersedes_notice_id','')::uuid,uid) returning * into n;
   if n.supersedes_notice_id is not null and not exists(select 1 from public.policy_notices where id=n.supersedes_notice_id and status='adopted') then raise exception 'Superseded notice must already be adopted';end if;
   result:=jsonb_build_object('id',n.id);
 elsif _kind='notice_review' then
   if n.status<>'draft' or coalesce(length(trim(_payload->>'note')),0) not between 10 and 1000 then raise exception 'Draft notice and source review explanation required';end if;
   update public.policy_notices set status='reviewed',revision=revision+1,reviewed_by=uid,reviewed_at=now(),review_note=trim(_payload->>'note') where id=n.id;
 elsif _kind='notice_adopt' then
   if n.status<>'reviewed' or coalesce(length(trim(_payload->>'note')),0) not between 10 and 1000 then raise exception 'Reviewed notice and adoption reason required';end if;
   impact:=fp_private.notice_preview(n.id);
   -- Lock parents in a common order, then re-evaluate the complete impact under those locks.
   perform 1 from public.applications where id in(select (value->>'application_id')::uuid from jsonb_array_elements(impact->'items')) order by id for update;
   perform 1 from public.obligations where id in(select (value->>'obligation_id')::uuid from jsonb_array_elements(impact->'items')) order by id for update;
   impact:=fp_private.notice_preview(n.id);
   if impact->>'impact_hash' is distinct from _payload->>'impact_hash' then raise exception 'Impact changed; preview again' using errcode='40001';end if;
   if jsonb_array_length(impact->'items')=0 then raise exception 'No eligible targets in the recorded notice scope';end if;
   insert into public.notice_adoptions(notice_id,actor_id,reason,impact_hash) values(n.id,uid,trim(_payload->>'note'),impact->>'impact_hash') returning id into adoption;
   for item in select value from jsonb_array_elements(impact->'items') loop
     key:=item->>'subject_key';select * into old_deadline from public.applied_deadlines where subject_key=key and status='active';
     if old_deadline.id is not null and old_deadline.notice_id is distinct from n.supersedes_notice_id then raise exception 'Explicitly supersede the notice that owns the current deadline';end if;
     update public.applied_deadlines set status='superseded' where id=old_deadline.id;
     update public.deadline_reminder_intents set status='superseded' where deadline_id=old_deadline.id and status='pending';
     insert into public.applied_deadlines(application_id,obligation_id,notice_id,adoption_id,subject_key,subject_revision,old_due_at,new_due_at,trigger_at,calendar_basis,source_version)
     values((item->>'application_id')::uuid,(item->>'obligation_id')::uuid,n.id,adoption,key,(item->>'revision')::int+1,(item->>'old_due_at')::timestamptz,(item->>'new_due_at')::timestamptz,(item->>'trigger_at')::timestamptz,n.calendar_basis,n.source_version) returning id into deadline;
     select * into a from public.applications where id=(item->>'application_id')::uuid;
     if item->>'obligation_id' is null then update public.applications set sla_due_at=(item->>'new_due_at')::timestamptz,version=version+1,updated_at=now() where id=a.id;
     else update public.obligations set due_date=((item->>'new_due_at')::timestamptz at time zone 'Asia/Kolkata')::date,deadline_revision=deadline_revision+1,deadline_source='reviewed_notice' where id=(item->>'obligation_id')::uuid;update public.applications set version=version+1,updated_at=now() where id=a.id;end if;
     insert into public.deadline_reminder_intents(deadline_id,application_id,recipient_id,scheduled_for) values(deadline,a.id,a.owner_id,(item->>'new_due_at')::timestamptz-interval '1 day');
     perform fp_private.event(a.id,'deadline_adopted',a.status,a.status,_payload->>'note',jsonb_build_object('notice_id',n.id,'adoption_id',adoption,'deadline',item,'source_version',n.source_version,'calendar_basis',n.calendar_basis));
   end loop;
   update public.policy_notices set status='adopted',revision=revision+1 where id=n.id;
   result:=jsonb_build_object('adoption_id',adoption,'affected_count',jsonb_array_length(impact->'items'));
 else raise exception 'Unsupported command';end if;
 if _kind not like 'notice_%' then
   update public.applications set version=version+1,updated_at=now() where id=a.id;
   -- Receipts retain the request, while events capture server-derived effective values.
   if _kind in('scope_save','scope_review') then
    select jsonb_build_object('academic_year_start',x.academic_year_start,'scope_revision',x.scope_revision,'reviewed_revision',x.scope_reviewed_revision,'note',_payload->>'note',
      'items',coalesce((select jsonb_agg(to_jsonb(s) order by s.course_key) from public.application_scope_items s where s.application_id=a.id),'[]')) into _payload from public.applications x where x.id=a.id;
   elsif _kind='document_validity' then
    select jsonb_build_object('document_id',x.id,'sha256',x.sha256,'validity_mode',x.validity_mode,'issue_date',x.issue_date,'expires_on',x.expires_on,'subject_institution_id',x.subject_institution_id,'supersedes_document_id',x.supersedes_document_id,'validity_reviewed_by',x.validity_reviewed_by,'validity_reviewed_at',x.validity_reviewed_at,'note',x.validity_review_note) into _payload from public.application_documents x where x.id=d.id;
   elsif _kind='obligation_fulfil' then
    _payload:=jsonb_build_object('obligation_id',o.id,'approval_id',o.approval_id,'note',_payload->>'note','evidence',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'sha256',x.sha256,'validity_mode',x.validity_mode,'expires_on',x.expires_on,'validity_reviewed_at',x.validity_reviewed_at) order by x.id) from public.application_documents x where x.id=any(selected)),'[]'));
   end if;
   perform fp_private.event(a.id,_kind,a.status,a.status,_payload->>'note',_payload||jsonb_build_object('resource_id',body->'id','request_id',_request_id));
 else insert into public.config_audit(actor_id,action,detail) values(uid,_kind,jsonb_build_object('notice_id',n.id,'request_id',_request_id,'source_hash',n.source_hash,'reason',_payload->>'note'));end if;
 insert into fp_private.governance_receipts values(_request_id,uid,(body->>'id')::uuid,body,result);return result;
end $$;

-- Extend subsequent event snapshots without reconstructing or rewriting earlier events.
alter function fp_private.review_snapshot(uuid) rename to review_snapshot_before_governance;
create function fp_private.review_snapshot(_application uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select fp_private.review_snapshot_before_governance(_application)||jsonb_build_object('governance',jsonb_build_object('schema',1,
 'academic_year_start',a.academic_year_start,'scope_revision',a.scope_revision,'scope_reviewed_revision',a.scope_reviewed_revision,'sla_due_at',a.sla_due_at,
 'scope_requests',coalesce((select jsonb_agg(to_jsonb(s) order by s.course_key) from public.application_scope_items s where s.application_id=a.id),'[]'),
 'approvals',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.approval_records p where p.application_id=a.id),'[]'),
 'obligations',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from public.obligations o where o.application_id=a.id),'[]'),
 'deadlines',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at,d.id) from public.applied_deadlines d where d.application_id=a.id),'[]'),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'subject_institution_id',d.subject_institution_id,'validity_mode',d.validity_mode,'issue_date',d.issue_date,'expires_on',d.expires_on,'supersedes_document_id',d.supersedes_document_id,'validity_reviewed_at',d.validity_reviewed_at,'validity_reviewed_by',d.validity_reviewed_by) order by d.id) from public.application_documents d where d.application_id=a.id),'[]')))
 from public.applications a where a.id=_application;
$$;

-- Approvals are immutable authority decisions; obligations use explicit dates from that decision.
create or replace function fp_private.transition(_id uuid,_action text,_reason text,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=fp_private.actor();a public.applications;r fp_private.transition_receipts;body jsonb:=jsonb_build_object('action',_action,'reason',_reason,'payload',_payload,'version',_expected_version);
 decision jsonb;item jsonb;s public.application_scope_items;approval uuid:=gen_random_uuid();event_id bigint;result jsonb;start_year int;end_year int;from_date date;to_date date;
begin
 select * into a from public.applications where id=_id for update;
 if a.id is null or not fp_private.can_view(_id) then raise exception 'Case unavailable' using errcode='42501';end if;
 if _action='raise_deficiency' and _payload->>'claim_id' is not null and not exists(select 1 from public.application_claims where id=(_payload->>'claim_id')::uuid and application_id=_id) then raise exception 'Claim does not belong to this application' using errcode='42501';end if;
 if _action in('pass_scrutiny','approve') and a.scope_revision>0 and a.scope_reviewed_revision is distinct from a.scope_revision then raise exception 'Review the current course scope before progressing';end if;
 if _action<>'approve' then
   if _action='pass_scrutiny' and a.status='under_scrutiny' and a.assigned_officer=uid and fp_private.has_role('scrutiny_officer',a.region) and exists(select 1 from jsonb_array_elements_text(a.template_snapshot->'required_documents') category where not exists(select 1 from public.application_documents evidence where evidence.application_id=a.id and evidence.doc_type=category and fp_private.document_eligible(evidence.id))) then raise exception 'Review validity of every required evidence category before accepting scrutiny';end if;
   result:=fp_private.transition_unchecked(_id,_action,_reason,_payload,_expected_version,_request_id);
   if exists(select 1 from public.applications where id=_id and status in('approved','rejected')) then
    update public.applied_deadlines set status='closed' where application_id=_id and obligation_id is null and status='active';
    update public.deadline_reminder_intents set status='cancelled' where status='pending' and deadline_id in(select id from public.applied_deadlines where application_id=_id and obligation_id is null and status='closed');
   end if;
   return result;
 end if;
 if a.owner_id=uid or not(fp_private.has_role('regional_officer',a.region) or fp_private.has_role('national_admin')) then raise exception 'Decision jurisdiction required' using errcode='42501';end if;
 select * into r from fp_private.transition_receipts where request_id=_request_id;
 if found then if r.actor_id<>uid or r.application_id<>_id or r.input<>body then raise exception 'Request ID already used';end if;return r.result;end if;
 if _request_id is null or a.version is distinct from _expected_version then raise exception 'Case changed; reload before acting' using errcode='40001';end if;
 if a.status<>'pending_decision' or coalesce(length(trim(_reason)),0) not between 10 and 5000 then raise exception 'Pending decision and reason required';end if;
 perform fp_private.integrity_gate(_id);
 if exists(select 1 from jsonb_array_elements_text(a.template_snapshot->'required_documents') category where not exists(select 1 from public.application_documents evidence where evidence.application_id=a.id and evidence.doc_type=category and fp_private.document_eligible(evidence.id))) then raise exception 'Review validity of every required evidence category before approval';end if;
 if jsonb_array_length(fp_private.missing(_id))>0 or not exists(select 1 from public.application_documents d where d.id::text=_payload->>'evidence' and d.application_id=_id and fp_private.document_eligible(d.id)) then raise exception 'Reference current validity-reviewed evidence from this case';end if;
 if a.evc_required and not exists(select 1 from public.evc_visits where application_id=_id and completed_at is not null) then raise exception 'EVC report required';end if;
 decision:=_payload->'approval';start_year:=(decision->>'academic_year_start')::int;end_year:=(decision->>'academic_year_end')::int;from_date:=(decision->>'valid_from')::date;to_date:=(decision->>'valid_to')::date;
 if decision is null or start_year is null or end_year is null or from_date is null or to_date is null or to_date<from_date or (a.academic_year_start is not null and start_year<>a.academic_year_start) or jsonb_typeof(decision->'items') is distinct from 'array' or jsonb_typeof(decision->'conditions') is distinct from 'array' or jsonb_array_length(decision->'conditions')>30 then raise exception 'Explicit approval period, academic year, scope and conditions required';end if;
 if (select count(*) from public.application_scope_items where application_id=_id)<>jsonb_array_length(decision->'items') or (select count(distinct value->>'request_item_id') from jsonb_array_elements(decision->'items'))<>jsonb_array_length(decision->'items') then raise exception 'Cover every requested course exactly once';end if;
 for item in select value from jsonb_array_elements(decision->'items') loop
   select * into s from public.application_scope_items where id=(item->>'request_item_id')::uuid and application_id=_id;
   if s.id is null or (item->>'approved_intake') is null or (item->>'approved_intake')::int not between 0 and s.requested_intake then raise exception 'Approved intake must be within this course request';end if;
 end loop;
 if jsonb_array_length(decision->'items')>0 and not exists(select 1 from jsonb_array_elements(decision->'items') i where (i->>'approved_intake')::int>0) then raise exception 'At least one approved course needs positive intake';end if;
 update public.applications set status='approved',version=version+1,updated_at=now(),stage_entered_at=now(),sla_due_at=null,decision_reason=trim(_reason),decision_evidence=_payload->>'evidence',decided_by=uid,decided_at=now() where id=_id;
 perform fp_private.event(_id,'approve',a.status,'approved',trim(_reason),_payload||jsonb_build_object('approval_id',approval,'request_id',_request_id,'demo',true,'authorization_role',case when fp_private.has_role('national_admin') then 'national_admin' else 'regional_officer' end));
 select id into event_id from public.application_events where application_id=_id order by sequence desc limit 1;
 insert into public.approval_records(id,institution_id,application_id,decision_event_id,approval_type,academic_year_start,academic_year_end,valid_from,valid_to,conditions,source_ref,created_by)
 values(approval,a.institution_id,_id,event_id,decision->>'approval_type',start_year,end_year,from_date,to_date,array(select value->>'title' from jsonb_array_elements(decision->'conditions')),'DEMO-DECISION-'||event_id,uid);
 insert into public.approval_scope_items(approval_id,request_item_id,course_key,programme,course_name,level,previous_approved_intake,requested_intake,approved_intake)
 select approval,request_row.id,request_row.course_key,request_row.programme,request_row.course_name,request_row.level,request_row.previous_approved_intake,request_row.requested_intake,(i->>'approved_intake')::int from jsonb_array_elements(decision->'items') i join public.application_scope_items request_row on request_row.id=(i->>'request_item_id')::uuid;
 for item in select value from jsonb_array_elements(decision->'conditions') loop
   if coalesce(length(trim(item->>'title')),0) not between 5 and 300 or nullif(item->>'due_date','') is null or jsonb_typeof(item->'required_evidence') is distinct from 'array' then raise exception 'Each continuing condition needs an explicit due date and evidence categories';end if;
   if exists(select 1 from jsonb_array_elements_text(item->'required_evidence') t where not(a.template_snapshot->'required_documents' ? t) and not exists(select 1 from public.application_claims c where c.application_id=a.id and t=any(c.evidence_types_snapshot))) then raise exception 'Condition evidence category must belong to this case';end if;
   insert into public.obligations(institution_id,application_id,approval_id,kind,title,due_date,region,required_evidence) values(a.institution_id,_id,approval,'undertaking',trim(item->>'title'),(item->>'due_date')::date,a.region,array(select jsonb_array_elements_text(item->'required_evidence')));
 end loop;
 update public.applied_deadlines set status='closed' where application_id=_id and obligation_id is null and status='active';
 update public.deadline_reminder_intents set status='cancelled' where status='pending' and deadline_id in(select id from public.applied_deadlines where application_id=_id and obligation_id is null and status='closed');
 insert into public.notifications(user_id,title,body) values(a.owner_id,'Demo approval recorded: '||a.ref_no,'Synthetic decision with explicitly recorded validity and course scope.');
 result:=jsonb_build_object('id',_id,'status','approved','version',a.version+1,'approval_id',approval);
 insert into fp_private.transition_receipts(request_id,actor_id,application_id,input,result) values(_request_id,uid,_id,body,result);return result;
end $$;

-- Legacy fulfilment cannot bypass the new evidence requirement. Parent-first locks match all review commands.
create or replace function fp_private.fulfil(_id uuid,_reason text) returns void language plpgsql security definer set search_path='' as $$
declare o public.obligations;
begin
 select * into o from public.obligations where id=_id;perform 1 from public.applications where id=o.application_id for update;
 select * into o from public.obligations where id=_id for update;
 if o.id is null or not(fp_private.has_role('regional_officer',o.region) or fp_private.has_role('national_admin')) or coalesce(length(trim(_reason)),0)<10 or o.status='fulfilled' then raise exception 'Decision jurisdiction and verification reason required';end if;
 if cardinality(o.required_evidence)>0 then raise exception 'Select reviewed evidence with the versioned compliance command';end if;
 update public.obligations set status='fulfilled',deadline_revision=deadline_revision+1 where id=_id;
 update public.applied_deadlines set status='closed' where obligation_id=o.id and status='active';
 update public.deadline_reminder_intents set status='cancelled' where status='pending' and deadline_id in(select id from public.applied_deadlines where obligation_id=o.id and status='closed');
 perform fp_private.event(o.application_id,'obligation_fulfilled',null,null,_reason,jsonb_build_object('obligation_id',_id));
end $$;
create or replace function fp_private.can_upload_document(app uuid,kind text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.applications a where a.id=app and a.owner_id=fp_private.actor() and fp_private.has_role('institution') and (
 (a.status in('draft','deficiency_raised') and ((a.template_snapshot->'required_documents') ? kind or exists(select 1 from public.application_claims c where c.application_id=a.id and kind=any(c.evidence_types_snapshot))))
 or(a.status='under_scrutiny' and exists(select 1 from public.deficiencies d join public.application_claims c on c.id=d.claim_id where d.application_id=a.id and d.status in('open','escalated') and kind=any(c.evidence_types_snapshot)))
 or exists(select 1 from public.obligations o where o.application_id=a.id and o.status<>'fulfilled' and kind=any(o.required_evidence))));
$$;
-- Adopted application-wide deadlines survive changes of workflow stage.
create function fp_private.preserve_adopted_deadline() returns trigger language plpgsql security definer set search_path='' as $$
declare due timestamptz;
begin
 if new.status not in('draft','approved','rejected') then
  select new_due_at into due from public.applied_deadlines where application_id=new.id and obligation_id is null and status='active';
  if found then new.sla_due_at:=due;end if;
 elsif new.status in('approved','rejected') then
  update public.applied_deadlines set status='closed' where application_id=new.id and obligation_id is null and status='active';
  update public.deadline_reminder_intents set status='cancelled' where status='pending' and deadline_id in(select id from public.applied_deadlines where application_id=new.id and obligation_id is null and status='closed');
 end if;return new;
end $$;
create trigger preserve_adopted_deadline before update on public.applications for each row execute function fp_private.preserve_adopted_deadline();
-- A reservation's subject is derived, never accepted from a client.
create function fp_private.document_subject() returns trigger language plpgsql set search_path='' as $$ begin
 select institution_id into new.subject_institution_id from public.applications where id=new.application_id;return new;end $$;
create trigger derive_document_subject before insert on public.application_documents for each row execute function fp_private.document_subject();

-- Trusted in-app outbox worker. It never sends email, webhooks or official notices.
create function fp_private.process_deadline_reminders(_limit int) returns int language plpgsql security definer set search_path='' as $$
declare candidate record;r public.deadline_reminder_intents;d public.applied_deadlines;a public.applications;count int:=0;
begin
 for candidate in select id,application_id from public.deadline_reminder_intents where status='pending' and scheduled_for<=now() order by scheduled_for,id limit least(greatest(coalesce(_limit,0),0),100) loop
  select * into a from public.applications where id=candidate.application_id for update skip locked;if not found then continue;end if;
  select * into r from public.deadline_reminder_intents where id=candidate.id and status='pending' for update;if not found then continue;end if;
  select * into d from public.applied_deadlines where id=r.deadline_id;
  if d.status<>'active' or (d.obligation_id is null and(a.status in('draft','approved','rejected') or a.sla_due_at is distinct from d.new_due_at)) or(d.obligation_id is not null and not exists(select 1 from public.obligations o where o.id=d.obligation_id and o.status<>'fulfilled' and o.deadline_revision=d.subject_revision)) then update public.deadline_reminder_intents set status='cancelled' where id=r.id;continue;end if;
  insert into public.notifications(user_id,title,body,application_id) values(r.recipient_id,'Synthetic deadline reminder · '||a.ref_no,'Recorded source version '||d.source_version||'; due '||d.new_due_at::text||'. In-app reminder only.',a.id);
  update public.deadline_reminder_intents set status='sent',sent_at=now() where id=r.id;count:=count+1;
 end loop;return count;
end $$;
create function public.fp_governance_command(_kind text,_id uuid,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select fp_private.governance_command(_kind,_id,_payload,_expected_version,_request_id)$$;
create function public.fp_notice_preview(_id uuid) returns jsonb language sql security invoker set search_path='' as $$select fp_private.notice_preview(_id)$$;
create function public.fp_process_deadline_reminders(_limit int default 50) returns int language sql security invoker set search_path='' as $$select fp_private.process_deadline_reminders(_limit)$$;
revoke all on function fp_private.can_view_institution(uuid),fp_private.document_eligible(uuid),fp_private.review_snapshot(uuid),fp_private.review_snapshot_before_governance(uuid),fp_private.recheck_deficiency(uuid,text,text),fp_private.recheck_deficiency_before_validity(uuid,text,text),fp_private.notice_due(public.policy_notices,timestamptz),fp_private.notice_preview(uuid),fp_private.governance_command(text,uuid,jsonb,int,uuid),fp_private.document_subject(),fp_private.preserve_adopted_deadline(),fp_private.process_deadline_reminders(int) from public,anon,authenticated;
revoke all on function public.fp_governance_command(text,uuid,jsonb,int,uuid),public.fp_notice_preview(uuid),public.fp_process_deadline_reminders(int) from public,anon,authenticated;
grant execute on function fp_private.can_view_institution(uuid),fp_private.notice_preview(uuid),fp_private.governance_command(text,uuid,jsonb,int,uuid),public.fp_governance_command(text,uuid,jsonb,int,uuid),public.fp_notice_preview(uuid) to authenticated;
grant execute on function fp_private.process_deadline_reminders(int),public.fp_process_deadline_reminders(int) to service_role;
notify pgrst,'reload schema';
commit;
