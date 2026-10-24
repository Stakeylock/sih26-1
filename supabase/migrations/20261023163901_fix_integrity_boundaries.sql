begin;
-- Corrective migration: preserve already published migrations and audit records.
-- Rules below are explicitly synthetic demo rules, never official AICTE policy.
alter default privileges revoke execute on functions from public;

alter table public.requirements add column system_rule jsonb;
alter table public.application_claims add column system_rule_snapshot jsonb;
alter table public.application_claims add column system_inputs jsonb;
alter table public.application_claims add column system_result jsonb;
update public.requirements set system_rule='{"id":"demo-student-faculty-ratio","version":1,"max_ratio":20,"source":"demo_rule"}'
  where code='STUDENT_FACULTY_RATIO' and verification_method='system_check';
update public.application_claims c set system_rule_snapshot=r.system_rule
  from public.requirements r where r.id=c.requirement_id and c.verification_method='system_check';
-- Previous manual assertions did not evaluate a rule; require a fresh verification.
update public.application_claims set status='unverified',verified_by=null,verified_at=null,verification_note=null
  where verification_method='system_check' and status='verified';

create or replace function fp_private.seed_claims(_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.applications; req_version int;
begin
  select * into a from public.applications where id=_id;
  if a.id is null then raise exception 'Application unavailable'; end if;
  select max(version) into req_version from public.requirements where app_type=a.app_type and active;
  if req_version is null then return; end if;
  insert into public.application_claims(application_id,requirement_id,status,statement_snapshot,clause_snapshot,evidence_types_snapshot,verification_method,system_rule_snapshot)
  select a.id,r.id,'unverified',r.statement,r.clause,r.evidence_types,r.verification_method,r.system_rule
  from public.requirements r where r.app_type=a.app_type and r.version=req_version and r.active
  on conflict(application_id,requirement_id) do nothing;
end $$;

create function fp_private.evaluate_system_claim(_claim uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.application_claims; a public.applications; students numeric; faculty numeric; threshold numeric;
begin
  select * into c from public.application_claims where id=_claim;
  select * into a from public.applications where id=c.application_id;
  if c.id is null or not fp_private.can_view(a.id) then raise exception 'Claim unavailable' using errcode='42501'; end if;
  if c.system_rule_snapshot->>'id' is distinct from 'demo-student-faculty-ratio' or c.system_rule_snapshot->>'version' is distinct from '1' then
    return jsonb_build_object('passed',false,'reason','No supported demo system rule is configured');
  end if;
  if coalesce(a.form_data->>'intake','') !~ '^[1-9][0-9]{0,5}$' or coalesce(a.form_data->>'faculty_count','') !~ '^[1-9][0-9]{0,5}$' then
    return jsonb_build_object('passed',false,'reason','Positive integer intake and faculty count are required');
  end if;
  students:=(a.form_data->>'intake')::numeric; faculty:=(a.form_data->>'faculty_count')::numeric;
  threshold:=(c.system_rule_snapshot->>'max_ratio')::numeric;
  if threshold is null or threshold<=0 then return jsonb_build_object('passed',false,'reason','Invalid demo rule'); end if;
  return jsonb_build_object('passed',students/faculty<=threshold,'rule',c.system_rule_snapshot,'ratio',round(students/faculty,4),
    'inputs',jsonb_build_array(jsonb_build_object('field','intake','label','Sanctioned intake','value',a.form_data->>'intake'),jsonb_build_object('field','faculty_count','label','Faculty count','value',a.form_data->>'faculty_count')));
end $$;

create function fp_private.claim_evidence_valid(_claim uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.application_claims c join public.claim_evidence ce on ce.claim_id=c.id
    join public.application_documents d on d.id=ce.document_id
    where c.id=_claim and d.application_id=c.application_id and d.doc_type=any(c.evidence_types_snapshot)
      and d.scan_status='clean' and (d.expires_on is null or d.expires_on>=current_date));
$$;

create or replace function fp_private.verify_claim(_claim uuid,_result public.claim_status,_note text) returns void language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; uid uuid:=fp_private.actor(); evaluated jsonb;
begin
  select * into c from public.application_claims where id=_claim for update;
  if c.id is null then raise exception 'Claim unavailable' using errcode='42501'; end if;
  select * into a from public.applications where id=c.application_id for update;
  if a.id is null or a.owner_id=uid or a.status<>'under_scrutiny' or a.assigned_officer is distinct from uid or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501'; end if;
  if _result is null or _result not in ('verified','not_applicable') then raise exception 'Choose verified or not applicable'; end if;
  if length(coalesce(_note,''))>1000 then raise exception 'Verification note is too long'; end if;
  if _result='not_applicable' and coalesce(length(trim(_note)),0)<10 then raise exception 'Explain why the claim is not applicable (10 characters minimum)'; end if;
  if exists(select 1 from public.deficiencies where claim_id=_claim and status in ('open','escalated')) then raise exception 'Resolve and re-check the open deficiency first'; end if;
  if _result='verified' then
    if c.verification_method='system_check' then
      evaluated:=fp_private.evaluate_system_claim(_claim);
      if not coalesce((evaluated->>'passed')::boolean,false) then raise exception 'Demo system rule failed: %',coalesce(evaluated->>'reason','student/faculty ratio exceeds the configured demo maximum'); end if;
    elsif not fp_private.claim_evidence_valid(_claim) then raise exception 'Link current clean evidence of the required type before verifying'; end if;
  end if;
  update public.application_claims set status=_result,verified_by=uid,verified_at=now(),verification_note=nullif(trim(coalesce(_note,'')),''),
    system_result=evaluated,system_inputs=evaluated->'inputs',updated_at=now() where id=_claim;
  perform fp_private.event(a.id,'claim_verified',a.status,a.status,_note,jsonb_build_object('claim_id',_claim,'result',_result,'method',c.verification_method,'system_result',evaluated));
end $$;

create function fp_private.invalidate_system_claims() returns trigger language plpgsql security definer set search_path='' as $$
declare changed int;
begin
  if (new.form_data->>'intake',new.form_data->>'faculty_count') is distinct from (old.form_data->>'intake',old.form_data->>'faculty_count') then
    update public.application_claims set status='unverified',verified_by=null,verified_at=null,verification_note=null,system_inputs=null,system_result=null,updated_at=now()
    where application_id=new.id and verification_method='system_check' and status='verified';
    get diagnostics changed=row_count;
    if changed>0 then perform fp_private.append_event(new.id,auth.uid(),'system','system_check_invalidated',old.status,new.status,'Declared system-check inputs changed','{}'); end if;
  end if; return new;
end $$;
create trigger invalidate_system_claims after update of form_data on public.applications for each row execute function fp_private.invalidate_system_claims();

create or replace function fp_private.integrity_gate(_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not coalesce((fp_private.verify_audit_chain(_id)->>'intact')::boolean,false) then raise exception 'The audit chain is broken'; end if;
  if not exists(select 1 from public.application_claims where application_id=_id) then return; end if;
  if exists(select 1 from public.application_claims c join public.requirements r on r.id=c.requirement_id where c.application_id=_id and r.is_mandatory and c.status not in ('verified','not_applicable')) then raise exception 'Every mandatory claim must be verified or not applicable'; end if;
  if exists(select 1 from public.deficiencies where application_id=_id and status in ('open','escalated')) then raise exception 'Resolve or waive every open deficiency'; end if;
  if exists(select 1 from public.integrity_signals where application_id=_id and disposition='confirmed') then raise exception 'A confirmed integrity signal blocks this decision'; end if;
  if exists(select 1 from public.application_claims c where c.application_id=_id and c.status='verified' and c.verification_method<>'system_check' and not fp_private.claim_evidence_valid(c.id)) then raise exception 'Every verified claim needs current clean evidence of the required type'; end if;
  if exists(select 1 from public.application_claims c where c.application_id=_id and c.status='verified' and c.verification_method='system_check'
    and (not coalesce((c.system_result->>'passed')::boolean,false) or not coalesce((fp_private.evaluate_system_claim(c.id)->>'passed')::boolean,false)
      or c.system_inputs is distinct from fp_private.evaluate_system_claim(c.id)->'inputs')) then raise exception 'Re-evaluate the current demo system-rule inputs'; end if;
end $$;

create or replace function fp_private.link_claim_evidence(_claim uuid,_document uuid,_note text) returns void language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; doc public.application_documents; uid uuid:=fp_private.actor();
begin
  select * into c from public.application_claims where id=_claim for update;
  if c.id is null then raise exception 'Claim unavailable' using errcode='42501'; end if;
  select * into a from public.applications where id=c.application_id for update;
  if a.id is null or not ((a.owner_id=uid and fp_private.has_role('institution') and (a.status in ('draft','deficiency_raised') or exists(select 1 from public.deficiencies where claim_id=_claim and status in ('open','escalated')))) or (a.assigned_officer=uid and a.status='under_scrutiny' and fp_private.has_role('scrutiny_officer',a.region))) then raise exception 'Evidence link not permitted' using errcode='42501'; end if;
  select * into doc from public.application_documents where id=_document;
  if doc.id is null or doc.application_id<>a.id or doc.scan_status<>'clean' or (doc.expires_on is not null and doc.expires_on<current_date) then raise exception 'A current clean document from this case is required'; end if;
  if not doc.doc_type=any(c.evidence_types_snapshot) then raise exception 'Evidence type does not match the claim'; end if;
  if length(coalesce(_note,''))>500 then raise exception 'Evidence note is too long'; end if;
  insert into public.claim_evidence(claim_id,document_id,linked_by,note) values(_claim,_document,uid,nullif(trim(coalesce(_note,'')),''))
    on conflict(claim_id,document_id) do update set linked_by=excluded.linked_by,linked_at=now(),note=excluded.note;
  perform fp_private.event(a.id,'claim_evidence_linked',a.status,a.status,_note,jsonb_build_object('claim_id',_claim,'document_id',_document));
end $$;

-- Preserve claim-only remediation without unlocking unrelated form fields.
create function fp_private.can_upload_document(app uuid,kind text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.applications a where a.id=app and a.owner_id=fp_private.actor() and fp_private.has_role('institution') and (
    (a.status in ('draft','deficiency_raised') and ((a.template_snapshot->'required_documents') ? kind or exists(select 1 from public.application_claims c where c.application_id=a.id and kind=any(c.evidence_types_snapshot))))
    or (a.status='under_scrutiny' and exists(select 1 from public.deficiencies d join public.application_claims c on c.id=d.claim_id where d.application_id=a.id and d.status in ('open','escalated') and kind=any(c.evidence_types_snapshot)))
  ));
$$;
create or replace function fp_private.reserve_document(_id uuid,_type text,_name text,_mime text,_size int) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.applications; doc uuid:=gen_random_uuid(); extension text;
begin
  select * into a from public.applications where id=_id for update;
  if not fp_private.can_upload_document(_id,_type) then raise exception 'Application is locked for this evidence type' using errcode='42501'; end if;
  if _name is null or length(_name) not between 1 and 180 or _name ~ '[[:cntrl:]/\\]' or _mime is null or _mime not in ('application/pdf','image/png','image/jpeg') or _size is null or _size not between 1 and 10485760 then raise exception 'Invalid document'; end if;
  if (select count(*) from public.application_documents where application_id=_id)>49 then raise exception 'Document limit reached'; end if;
  extension:=case _mime when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end;
  insert into public.application_documents(id,application_id,owner_id,doc_type,file_path,file_name,mime_type,size_bytes)
    values(doc,_id,fp_private.actor(),_type,auth.uid()::text||'/'||_id::text||'/'||doc::text||extension,_name,_mime,_size);
  perform fp_private.event(_id,'document_reserved',a.status,a.status,_type,jsonb_build_object('document_id',doc)); return doc;
end $$;
drop policy reserved_upload on storage.objects;
create policy reserved_upload on storage.objects for insert to authenticated with check(bucket_id='application-docs' and exists(
  select 1 from public.application_documents d where d.file_path=name and d.owner_id=fp_private.actor() and d.scan_status='pending' and fp_private.can_upload_document(d.application_id,d.doc_type)));

-- Guard evidence categories on every existing RPC path, not just the link endpoint.
alter function fp_private.resolve_deficiency(uuid,uuid,text) rename to resolve_deficiency_unchecked;
create function fp_private.resolve_deficiency(_deficiency uuid,_evidence uuid,_note text) returns void language plpgsql security definer set search_path='' as $$
declare d public.deficiencies; c public.application_claims; doc public.application_documents;
begin
  perform fp_private.actor();
  select * into d from public.deficiencies where id=_deficiency;
  select * into c from public.application_claims where id=d.claim_id;
  select * into doc from public.application_documents where id=_evidence;
  if doc.id is not null and c.id is not null and not doc.doc_type=any(c.evidence_types_snapshot) then raise exception 'Evidence type does not match the claim'; end if;
  perform fp_private.resolve_deficiency_unchecked(_deficiency,_evidence,_note);
end $$;
alter function fp_private.recheck_deficiency(uuid,text,text) rename to recheck_deficiency_unchecked;
create function fp_private.recheck_deficiency(_deficiency uuid,_result text,_note text) returns void language plpgsql security definer set search_path='' as $$
declare d public.deficiencies; c public.application_claims; evaluated jsonb;
begin
  perform fp_private.actor();
  select * into d from public.deficiencies where id=_deficiency;
  select * into c from public.application_claims where id=d.claim_id;
  if _result='accepted' and c.id is not null then
    if c.verification_method='system_check' then evaluated:=fp_private.evaluate_system_claim(c.id);
      if not coalesce((evaluated->>'passed')::boolean,false) then raise exception 'Demo system rule failed'; end if;
    elsif not fp_private.claim_evidence_valid(c.id) then raise exception 'Link current clean evidence of the required type before accepting'; end if;
  end if;
  perform fp_private.recheck_deficiency_unchecked(_deficiency,_result,_note);
  if _result='accepted' and evaluated is not null then update public.application_claims set system_result=evaluated,system_inputs=evaluated->'inputs' where id=c.id; end if;
end $$;

alter function fp_private.transition(uuid,text,text,jsonb,int,uuid) rename to transition_unchecked;
create function fp_private.transition(_id uuid,_action text,_reason text,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform fp_private.actor();
  perform 1 from public.applications where id=_id for update;
  if _action='raise_deficiency' and _payload->>'claim_id' is not null and not exists(
    select 1 from public.application_claims where id=(_payload->>'claim_id')::uuid and application_id=_id
  ) then raise exception 'Claim does not belong to this application' using errcode='42501'; end if;
  return fp_private.transition_unchecked(_id,_action,_reason,_payload,_expected_version,_request_id);
end $$;

-- Cross-institution duplicate detection keeps identifiers private.
update public.integrity_signals set detail=detail-'matched_document_id'-'matched_application_id' where signal_type='duplicate_document';
create or replace function fp_private.document_integrity(_document uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.application_documents;
begin
  select * into d from public.application_documents where id=_document;
  if d.id is null then return; end if;
  if d.expires_on is not null and d.expires_on<current_date then
    insert into public.integrity_signals(application_id,document_id,signal_type,severity,fingerprint,detail)
    values(d.application_id,d.id,'expired_document','warning','expires:'||d.expires_on::text,jsonb_build_object('expires_on',d.expires_on,'doc_type',d.doc_type)) on conflict(application_id,signal_type,fingerprint) do nothing;
  end if;
  if d.sha256 is not null and exists(select 1 from public.application_documents where sha256=d.sha256 and id<>d.id and application_id<>d.application_id) then
    insert into public.integrity_signals(application_id,document_id,signal_type,severity,fingerprint,detail)
    values(d.application_id,d.id,'duplicate_document','warning','sha256:'||d.sha256,jsonb_build_object('duplicate_detected',true,'doc_type',d.doc_type)) on conflict(application_id,signal_type,fingerprint) do nothing;
  end if;
end $$;
create or replace function fp_private.document_passport(_document uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.application_documents;
begin
  select * into d from public.application_documents where id=_document;
  if d.id is null or not fp_private.can_view(d.application_id) then raise exception 'Document unavailable' using errcode='42501'; end if;
  return jsonb_build_object('document',to_jsonb(d),'duplicates',coalesce((
    select jsonb_agg(jsonb_build_object('document_id',o.id,'application_id',o.application_id,'ref_no',a.ref_no,'doc_type',o.doc_type,'uploaded_at',o.uploaded_at))
    from public.application_documents o join public.applications a on a.id=o.application_id
    where d.sha256 is not null and o.sha256=d.sha256 and o.id<>d.id and o.application_id<>d.application_id and fp_private.can_view(o.application_id)
  ),'[]'::jsonb),'claims',coalesce((select jsonb_agg(to_jsonb(c)) from public.claim_evidence ce join public.application_claims c on c.id=ce.claim_id where ce.document_id=d.id and fp_private.can_view(c.application_id)),'[]'::jsonb),
  'signals',coalesce((select jsonb_agg(to_jsonb(s)) from public.integrity_signals s where s.document_id=d.id),'[]'::jsonb));
end $$;

-- Serialize assignment and revocation so concurrent operations cannot remove every admin.
alter function fp_private.assign_role(uuid,public.app_role,text,timestamptz,text) rename to assign_role_unchecked;
create function fp_private.assign_role(_user uuid,_role public.app_role,_region text,_expires timestamptz,_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('clauseway:admin-grants',0));
  if not fp_private.has_role('national_admin') then raise exception 'Administrator required' using errcode='42501'; end if;
  if _role='national_admin' and _expires is not null and exists(select 1 from public.user_roles where user_id=_user and role=_role and active and revoked_at is null and (expires_at is null or expires_at>now())) and not exists(
    select 1 from public.user_roles where user_id<>_user and role='national_admin' and active and revoked_at is null and (expires_at is null or expires_at>now())
  ) then raise exception 'Preserve another effective administrator before limiting the last administrator'; end if;
  perform fp_private.assign_role_unchecked(_user,_role,_region,_expires,_reason);
end $$;
create or replace function fp_private.revoke_role(_user uuid,_role public.app_role,_reason text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=fp_private.actor();
begin
  perform pg_advisory_xact_lock(hashtextextended('clauseway:admin-grants',0));
  if not fp_private.has_role('national_admin') then raise exception 'Administrator required' using errcode='42501'; end if;
  if coalesce(length(trim(_reason)),0) not between 10 and 1000 then raise exception 'A revocation reason of 10-1000 characters is required'; end if;
  if _role='national_admin' and not exists(select 1 from public.user_roles where user_id<>_user and role='national_admin' and active and revoked_at is null and (expires_at is null or expires_at>now())) then raise exception 'Cannot revoke the last effective administrator'; end if;
  update public.user_roles set active=false,revoked_at=now() where user_id=_user and role=_role and revoked_at is null;
  if not found then raise exception 'No live grant to revoke for this user and role' using errcode='42501'; end if;
  insert into public.config_audit(actor_id,target_user,role,action,reason,detail) values(uid,_user,_role,'revoke_role',trim(_reason),jsonb_build_object('user',_user,'role',_role,'reason',trim(_reason)));
end $$;
create or replace function fp_private.agent_registry() returns setof public.agent_registry language sql stable security definer set search_path='' as $$
  select * from public.agent_registry where fp_private.actor() is not null order by created_at;
$$;

-- Private definer code is reachable only through explicit, audited entry points.
revoke execute on all functions in schema fp_private from public,anon,authenticated;
grant execute on function fp_private.actor(),fp_private.has_role(public.app_role,text),fp_private.in_region(text),fp_private.can_view(uuid),fp_private.can_edit(uuid),fp_private.can_upload_document(uuid,text),
  fp_private.create_institution(text,text,text,text),fp_private.create_application(public.app_type,text),fp_private.save_draft(uuid,text,jsonb,int),fp_private.missing(uuid),fp_private.transition(uuid,text,text,jsonb,int,uuid),fp_private.checklist(uuid,text,boolean,text),fp_private.reserve_document(uuid,text,text,text,int),fp_private.mark_read(uuid),fp_private.fulfil(uuid,text),
  fp_private.link_claim_evidence(uuid,uuid,text),fp_private.unlink_claim_evidence(uuid,uuid),fp_private.verify_claim(uuid,public.claim_status,text),fp_private.raise_deficiency(uuid,text,text,timestamptz),fp_private.resolve_deficiency(uuid,uuid,text),fp_private.recheck_deficiency(uuid,text,text),fp_private.disposition_signal(uuid,public.signal_disposition,text),fp_private.document_passport(uuid),fp_private.verify_audit_chain(uuid),fp_private.demo_tamper_replay(uuid),fp_private.assign_role(uuid,public.app_role,text,timestamptz,text),fp_private.revoke_role(uuid,public.app_role,text),fp_private.agent_registry() to authenticated;
grant execute on function fp_private.complete_document(uuid,text,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
