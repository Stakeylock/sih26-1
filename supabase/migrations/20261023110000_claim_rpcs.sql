begin;
create type public.signal_type as enum ('duplicate_document','expired_document','name_mismatch','faculty_overlap','submission_velocity','access_anomaly');
create type public.signal_disposition as enum ('open','explained','confirmed','dismissed');

create table public.integrity_signals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  document_id uuid references public.application_documents(id) on delete cascade,
  signal_type public.signal_type not null,
  severity text not null check (severity in ('info','warning','critical')),
  fingerprint text not null,
  detail jsonb not null default '{}',
  disposition public.signal_disposition not null default 'open',
  disposition_reason text,
  disposed_by uuid,
  disposed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.integrity_signals(application_id,disposition);
alter table public.integrity_signals enable row level security;
revoke all on public.integrity_signals from anon,authenticated;
grant select on public.integrity_signals to authenticated;
grant all on public.integrity_signals to service_role;
create policy signals_read on public.integrity_signals for select to authenticated using(fp_private.can_view(application_id));

update public.workflow_templates
set definition=jsonb_set(definition,'{required_documents}','["Affidavit","Faculty List","Land Document","Building Plan","Fire Safety Certificate","Undertaking"]'::jsonb,true)
where app_type='extension_self_disclosure' and version=1 and status='published';

create function fp_private.integrity_gate(_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.application_claims where application_id=_id) then return; end if;
  if exists(select 1 from public.application_claims c join public.requirements r on r.id=c.requirement_id where c.application_id=_id and r.is_mandatory and c.status not in ('verified','not_applicable')) then raise exception 'Every mandatory claim must be verified or not applicable'; end if;
  if exists(select 1 from public.deficiencies where application_id=_id and status in ('open','escalated')) then raise exception 'Resolve or waive every open deficiency'; end if;
  if exists(select 1 from public.integrity_signals where application_id=_id and disposition='confirmed') then raise exception 'A confirmed integrity signal blocks this decision'; end if;
  if exists(select 1 from public.application_claims c where c.application_id=_id and c.status='verified' and c.verification_method<>'system_check' and not exists(select 1 from public.claim_evidence ce join public.application_documents d on d.id=ce.document_id where ce.claim_id=c.id and d.scan_status='clean' and (d.expires_on is null or d.expires_on>=current_date))) then raise exception 'Every verified claim needs current clean evidence'; end if;
end $$;

create function fp_private.raise_deficiency(_claim uuid,_observation text,_remedy text,_due timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; d uuid;
begin
  select * into c from public.application_claims where id=_claim for update;
  if c.id is null then raise exception 'Claim unavailable' using errcode='42501'; end if;
  select * into a from public.applications where id=c.application_id for update;
  if a.id is null or a.owner_id=fp_private.actor() or a.status<>'under_scrutiny' or a.assigned_officer is distinct from fp_private.actor() or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501'; end if;
  if coalesce(length(trim(_observation)),0) not between 10 and 2000 or coalesce(length(trim(_remedy)),0) not between 10 and 2000 or _due is null or _due<=now() or _due>now()+interval '90 days' then raise exception 'Observation, remedy, and a due date within 90 days are required'; end if;
  if exists(select 1 from public.deficiencies where claim_id=_claim and status in ('open','escalated')) then raise exception 'A deficiency is already open for this claim'; end if;
  insert into public.deficiencies(application_id,claim_id,clause,observation,remedy,due_at,raised_by)
    values(a.id,_claim,c.clause_snapshot,trim(_observation),trim(_remedy),_due,fp_private.actor()) returning id into d;
  update public.application_claims set status='deficient',verified_by=null,verified_at=null,verification_note=null,updated_at=now() where id=_claim;
  perform fp_private.event(a.id,'deficiency_raised',a.status,a.status,trim(_observation),jsonb_build_object('claim_id',_claim,'deficiency_id',d,'due_at',_due));
  return d;
end $$;

create function fp_private.link_claim_evidence(_claim uuid,_document uuid,_note text) returns void language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; doc public.application_documents; uid uuid:=fp_private.actor();
begin
  select * into c from public.application_claims where id=_claim for update;
  if c.id is null then raise exception 'Claim unavailable' using errcode='42501'; end if;
  select * into a from public.applications where id=c.application_id for update;
  if a.id is null or not ((a.owner_id=uid and fp_private.has_role('institution') and (a.status in ('draft','deficiency_raised') or exists(select 1 from public.deficiencies where claim_id=_claim and status in ('open','escalated')))) or (a.assigned_officer=uid and a.status='under_scrutiny' and fp_private.has_role('scrutiny_officer',a.region))) then raise exception 'Evidence link not permitted' using errcode='42501'; end if;
  select * into doc from public.application_documents where id=_document;
  if doc.id is null or doc.application_id<>a.id or doc.scan_status<>'clean' then raise exception 'A clean document from this case is required'; end if;
  if length(coalesce(_note,''))>500 then raise exception 'Evidence note is too long'; end if;
  insert into public.claim_evidence(claim_id,document_id,linked_by,note) values(_claim,_document,uid,nullif(trim(coalesce(_note,'')),''))
    on conflict(claim_id,document_id) do update set linked_by=excluded.linked_by,linked_at=now(),note=excluded.note;
  perform fp_private.event(a.id,'claim_evidence_linked',a.status,a.status,_note,jsonb_build_object('claim_id',_claim,'document_id',_document));
end $$;

create function fp_private.unlink_claim_evidence(_claim uuid,_document uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; uid uuid:=fp_private.actor();
begin
  select * into c from public.application_claims where id=_claim for update;
  if c.id is null then raise exception 'Claim unavailable' using errcode='42501'; end if;
  select * into a from public.applications where id=c.application_id for update;
  if a.id is null or not ((a.owner_id=uid and fp_private.has_role('institution') and (a.status in ('draft','deficiency_raised') or exists(select 1 from public.deficiencies where claim_id=_claim and status in ('open','escalated')))) or (a.assigned_officer=uid and a.status='under_scrutiny' and fp_private.has_role('scrutiny_officer',a.region))) then raise exception 'Evidence unlink not permitted' using errcode='42501'; end if;
  delete from public.claim_evidence where claim_id=_claim and document_id=_document;
  if not found then raise exception 'Evidence link not found'; end if;
  perform fp_private.event(a.id,'claim_evidence_unlinked',a.status,a.status,null,jsonb_build_object('claim_id',_claim,'document_id',_document));
end $$;

create function fp_private.verify_claim(_claim uuid,_result public.claim_status,_note text) returns void language plpgsql security definer set search_path='' as $$
declare c public.application_claims; a public.applications; uid uuid:=fp_private.actor();
begin
  select * into c from public.application_claims where id=_claim for update;
  if c.id is null then raise exception 'Claim unavailable' using errcode='42501'; end if;
  select * into a from public.applications where id=c.application_id for update;
  if a.id is null or a.owner_id=uid or a.status<>'under_scrutiny' or a.assigned_officer is distinct from uid or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501'; end if;
  if _result not in ('verified','not_applicable') then raise exception 'Choose verified or not applicable'; end if;
  if length(coalesce(_note,''))>1000 then raise exception 'Verification note is too long'; end if;
  if _result='not_applicable' and coalesce(length(trim(_note)),0)<10 then raise exception 'Explain why the claim is not applicable (10 characters minimum)'; end if;
  if _result='verified' and c.verification_method<>'system_check' and not exists(select 1 from public.claim_evidence ce join public.application_documents d on d.id=ce.document_id where ce.claim_id=_claim and d.scan_status='clean' and (d.expires_on is null or d.expires_on>=current_date)) then raise exception 'Link current clean evidence before verifying'; end if;
  update public.application_claims set status=_result,verified_by=uid,verified_at=now(),verification_note=nullif(trim(coalesce(_note,'')),''),updated_at=now() where id=_claim;
  perform fp_private.event(a.id,'claim_verified',a.status,a.status,_note,jsonb_build_object('claim_id',_claim,'result',_result,'method',c.verification_method));
end $$;

create function fp_private.resolve_deficiency(_deficiency uuid,_evidence uuid,_note text) returns void language plpgsql security definer set search_path='' as $$
declare d public.deficiencies; a public.applications; doc public.application_documents; uid uuid:=fp_private.actor();
begin
  select * into d from public.deficiencies where id=_deficiency for update;
  if d.id is null then raise exception 'Deficiency unavailable' using errcode='42501'; end if;
  select * into a from public.applications where id=d.application_id for update;
  if a.id is null or a.owner_id<>uid or not fp_private.has_role('institution') or d.status not in ('open','escalated') then raise exception 'Institution owner required for an open deficiency' using errcode='42501'; end if;
  select * into doc from public.application_documents where id=_evidence;
  if doc.id is null or doc.application_id<>a.id or doc.scan_status<>'clean' or (doc.expires_on is not null and doc.expires_on<current_date) then raise exception 'A current clean document from this case is required'; end if;
  if coalesce(length(trim(_note)),0) not between 10 and 2000 then raise exception 'Explain the resolution (10 characters minimum)'; end if;
  update public.deficiencies set status='resolved',resolved_by=uid,resolved_at=now(),resolution_note=trim(_note),evidence_id=_evidence where id=_deficiency;
  update public.application_claims set status='unverified',verified_by=null,verified_at=null,verification_note=null,updated_at=now() where id=d.claim_id;
  insert into public.claim_evidence(claim_id,document_id,linked_by,note) values(d.claim_id,_evidence,uid,trim(_note))
    on conflict(claim_id,document_id) do update set linked_by=excluded.linked_by,linked_at=now(),note=excluded.note;
  perform fp_private.event(a.id,'deficiency_resolved',a.status,a.status,_note,jsonb_build_object('deficiency_id',_deficiency,'claim_id',d.claim_id,'evidence_id',_evidence));
end $$;

create function fp_private.recheck_deficiency(_deficiency uuid,_result text,_note text) returns void language plpgsql security definer set search_path='' as $$
declare d public.deficiencies; c public.application_claims; a public.applications; uid uuid:=fp_private.actor();
begin
  select * into d from public.deficiencies where id=_deficiency for update;
  if d.id is null then raise exception 'Deficiency unavailable' using errcode='42501'; end if;
  select * into c from public.application_claims where id=d.claim_id for update;
  select * into a from public.applications where id=d.application_id for update;
  if a.id is null or a.owner_id=uid or a.assigned_officer is distinct from uid or a.status not in ('under_scrutiny','deficiency_raised') or not fp_private.has_role('scrutiny_officer',a.region) then raise exception 'Assigned scrutiny officer required' using errcode='42501'; end if;
  if d.status<>'resolved' or _result not in ('accepted','reopened') or coalesce(length(trim(_note)),0) not between 10 and 2000 then raise exception 'A resolved deficiency and a re-check note are required'; end if;
  if _result='accepted' then
    if c.verification_method<>'system_check' and not exists(select 1 from public.claim_evidence ce join public.application_documents doc on doc.id=ce.document_id where ce.claim_id=c.id and doc.scan_status='clean' and (doc.expires_on is null or doc.expires_on>=current_date)) then raise exception 'Link current clean evidence before accepting'; end if;
    update public.deficiencies set rechecked_by=uid,rechecked_at=now(),recheck_note=trim(_note) where id=_deficiency;
    update public.application_claims set status='verified',verified_by=uid,verified_at=now(),verification_note=trim(_note),updated_at=now() where id=d.claim_id;
  else
    update public.deficiencies set status='open',rechecked_by=uid,rechecked_at=now(),recheck_note=trim(_note) where id=_deficiency;
    update public.application_claims set status='deficient',verified_by=null,verified_at=null,verification_note=null,updated_at=now() where id=d.claim_id;
  end if;
  perform fp_private.event(a.id,'deficiency_rechecked',a.status,a.status,_note,jsonb_build_object('deficiency_id',_deficiency,'claim_id',d.claim_id,'result',_result));
end $$;

create function fp_private.disposition_signal(_signal uuid,_disposition public.signal_disposition,_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.integrity_signals; a public.applications; uid uuid:=fp_private.actor();
begin
  select * into s from public.integrity_signals where id=_signal for update;
  if s.id is null then raise exception 'Signal unavailable' using errcode='42501'; end if;
  select * into a from public.applications where id=s.application_id;
  if a.id is null or a.owner_id=uid or not (fp_private.has_role('scrutiny_officer',a.region) or fp_private.has_role('regional_officer',a.region) or fp_private.has_role('national_admin')) then raise exception 'Signal jurisdiction required' using errcode='42501'; end if;
  if _disposition not in ('explained','confirmed','dismissed') or coalesce(length(trim(_reason)),0) not between 10 and 1000 then raise exception 'A disposition and reason are required'; end if;
  update public.integrity_signals set disposition=_disposition,disposition_reason=trim(_reason),disposed_by=uid,disposed_at=now() where id=_signal;
  perform fp_private.event(a.id,'signal_disposition',a.status,a.status,_reason,jsonb_build_object('signal_id',_signal,'signal_type',s.signal_type,'disposition',_disposition));
end $$;

create or replace function fp_private.transition(_id uuid,_action text,_reason text,_payload jsonb,_expected_version int,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.applications; uid uuid:=fp_private.actor(); nxt public.app_status; want_evc boolean; ts timestamptz; r fp_private.transition_receipts;
  body jsonb; result jsonb; role_for_action public.app_role;
begin
  if _request_id is null or _expected_version is null or _payload is null or jsonb_typeof(_payload)<>'object' or pg_column_size(_payload)>10000 or length(coalesce(_reason,''))>5000 then raise exception 'Invalid transition input'; end if;
  select * into a from public.applications where id=_id for update;
  if a.id is null or not fp_private.can_view(_id) then raise exception 'Application unavailable' using errcode='42501'; end if;
  _reason:=nullif(trim(coalesce(_reason,'')),'');
  body:=jsonb_build_object('action',_action,'reason',_reason,'payload',_payload,'version',_expected_version);
  select * into r from fp_private.transition_receipts where request_id=_request_id;
  if r.request_id is not null then
    if r.actor_id<>uid or r.application_id<>_id or r.input<>body then raise exception 'Idempotency key already used for different input'; end if;
    return r.result;
  end if;
  if a.version<>_expected_version then raise exception 'Case changed; reload before acting' using errcode='40001'; end if;
  if _action in ('submit','resubmit') then
    if not fp_private.can_edit(_id) or (_action='submit' and a.status<>'draft') or (_action='resubmit' and a.status<>'deficiency_raised') then raise exception 'Illegal institution transition'; end if;
    if jsonb_array_length(fp_private.missing(_id))>0 then raise exception 'Complete all required fields and clean documents'; end if;
    if _action='resubmit' and coalesce(length(_reason),0)<10 then raise exception 'Explain the deficiency response (10 characters minimum)'; end if;
    if _action='resubmit' and exists(select 1 from public.deficiencies where application_id=_id and status in ('open','escalated')) then raise exception 'Resolve or waive every deficiency before resubmitting'; end if;
    nxt:=case _action when 'submit' then 'submitted'::public.app_status else 'resubmitted'::public.app_status end;
    update public.applications set submitted_at=coalesce(submitted_at,now()) where id=_id;
  else
    if a.owner_id=uid then raise exception 'You cannot review your own application' using errcode='42501'; end if;
    if _action in ('start_scrutiny','raise_deficiency','pass_scrutiny') then
      role_for_action:='scrutiny_officer';
      if not fp_private.has_role(role_for_action,a.region) then raise exception 'Scrutiny jurisdiction required' using errcode='42501'; end if;
      if _action='start_scrutiny' then
        if a.status not in ('submitted','resubmitted') then raise exception 'Illegal scrutiny transition'; end if;
        nxt:='under_scrutiny'; update public.applications set assigned_officer=uid where id=_id;
      else
        if a.status<>'under_scrutiny' or a.assigned_officer is distinct from uid then raise exception 'Only the assigned scrutiny officer may act'; end if;
        if _action='raise_deficiency' then
          if exists(select 1 from public.application_claims where application_id=_id) then
            if _payload->>'claim_id' is null then raise exception 'Select a claim for the deficiency'; end if;
            perform fp_private.raise_deficiency((_payload->>'claim_id')::uuid,_reason,coalesce(_payload->>'remedy',_reason),coalesce((_payload->>'due_at')::timestamptz,now()+interval '30 days'));
          else
            if coalesce(length(_reason),0)<10 then raise exception 'A specific deficiency reason is required'; end if;
          end if;
          nxt:='deficiency_raised';
        else
          if exists(select 1 from public.application_claims where application_id=_id) then
            perform fp_private.integrity_gate(_id);
          else
            if exists(select 1 from jsonb_array_elements_text(a.template_snapshot->'checklist') required where not exists(select 1 from public.checklist_items c where c.application_id=_id and c.item=required and c.passed is true)) then raise exception 'Complete every required checklist item'; end if;
          end if;
          want_evc:=case a.template_snapshot->>'evc_mode' when 'required' then true when 'conditional' then coalesce((_payload->>'evc')::boolean,false) else false end;
          if a.template_snapshot->>'evc_mode'='none' and coalesce((_payload->>'evc')::boolean,false) then raise exception 'This route has no EVC'; end if;
          if a.template_snapshot->>'evc_mode'='conditional' and coalesce(length(_reason),0)<10 then raise exception 'Explain whether an EVC is needed'; end if;
          nxt:=case when want_evc then 'evc_pending'::public.app_status else 'pending_decision'::public.app_status end;
          update public.applications set evc_required=want_evc where id=_id;
        end if;
      end if;
    elsif _action in ('schedule_evc','submit_evc_report') then
      role_for_action:='evc_coordinator';
      if not fp_private.has_role(role_for_action,a.region) then raise exception 'EVC jurisdiction required' using errcode='42501'; end if;
      if _action='schedule_evc' then
        if a.status<>'evc_pending' then raise exception 'Illegal visit transition'; end if;
        ts:=(_payload->>'scheduled_for')::timestamptz;
        if ts is null or ts<=now() or ts>now()+interval '180 days' then raise exception 'Schedule within the next 180 days'; end if;
        insert into public.evc_visits(application_id,coordinator_id,scheduled_for) values(_id,uid,ts); nxt:='evc_scheduled';
      else
        if a.status<>'evc_scheduled' or coalesce(length(_reason),0)<20 or (_payload->>'recommendation') is null or (_payload->>'recommendation') not in ('recommend','not_recommend','conditional') then raise exception 'Visit report and recommendation required'; end if;
        update public.evc_visits set report=_reason,recommendation=_payload->>'recommendation',completed_at=now()
        where application_id=_id and coordinator_id=uid and completed_at is null and scheduled_for<=now();
        if not found then raise exception 'Only the assigned coordinator may report after the scheduled visit'; end if; nxt:='pending_decision';
      end if;
    elsif _action in ('approve','reject') then
      role_for_action:='regional_officer';
      if not (fp_private.has_role('regional_officer',a.region) or fp_private.has_role('national_admin')) then raise exception 'Decision jurisdiction required' using errcode='42501'; end if;
      if a.status<>'pending_decision' or coalesce(length(_reason),0)<10 then raise exception 'Pending decision and a reason are required'; end if;
      perform fp_private.integrity_gate(_id);
      if jsonb_array_length(fp_private.missing(_id))>0 or not exists(select 1 from public.application_documents where id::text=_payload->>'evidence' and application_id=_id and scan_status='clean') then raise exception 'Reference a clean document from this case'; end if;
      if a.evc_required and not exists(select 1 from public.evc_visits where application_id=_id and completed_at is not null) then raise exception 'EVC report required'; end if;
      nxt:=case _action when 'approve' then 'approved'::public.app_status else 'rejected'::public.app_status end;
      update public.applications set decision_reason=_reason,decision_evidence=_payload->>'evidence',decided_by=uid,decided_at=now() where id=_id;
      if _action='approve' then
        insert into public.obligations(institution_id,application_id,kind,title,due_date,region)
        values(a.institution_id,_id,'renewal','Demo annual renewal: '||a.title,current_date+365,a.region);
        insert into public.obligations(institution_id,application_id,kind,title,due_date,region)
        select a.institution_id,_id,'undertaking',u,current_date+90,a.region from jsonb_array_elements_text(a.template_snapshot->'undertakings') u;
      end if;
    else raise exception 'Unknown transition'; end if;
  end if;
  update public.applications set status=nxt,version=version+1,updated_at=now(),stage_entered_at=now(),
    sla_due_at=case when nxt in ('approved','rejected') then null else now()+make_interval(days=>case when nxt='deficiency_raised' then 30 when nxt in ('evc_pending','evc_scheduled') then 21 else 15 end) end where id=_id;
  perform fp_private.event(_id,_action,a.status,nxt,_reason,_payload||jsonb_build_object('request_id',_request_id,'demo',true,'authorization_role',role_for_action));
  insert into public.notifications(user_id,title,body) values(a.owner_id,'Demo case '||a.ref_no||': '||replace(nxt::text,'_',' '),coalesce(left(_reason,200),'Workflow updated'));
  result:=jsonb_build_object('id',_id,'status',nxt,'version',a.version+1);
  insert into fp_private.transition_receipts(request_id,actor_id,application_id,input,result) values(_request_id,uid,_id,body,result);
  return result;
end $$;

create function public.fp_link_claim_evidence(_claim uuid,_document uuid,_note text) returns void language sql security invoker set search_path='' as $$ select fp_private.link_claim_evidence(_claim,_document,_note) $$;
create function public.fp_unlink_claim_evidence(_claim uuid,_document uuid) returns void language sql security invoker set search_path='' as $$ select fp_private.unlink_claim_evidence(_claim,_document) $$;
create function public.fp_verify_claim(_claim uuid,_result public.claim_status,_note text) returns void language sql security invoker set search_path='' as $$ select fp_private.verify_claim(_claim,_result,_note) $$;
create function public.fp_raise_deficiency(_claim uuid,_observation text,_remedy text,_due timestamptz) returns uuid language sql security invoker set search_path='' as $$ select fp_private.raise_deficiency(_claim,_observation,_remedy,_due) $$;
create function public.fp_resolve_deficiency(_deficiency uuid,_evidence uuid,_note text) returns void language sql security invoker set search_path='' as $$ select fp_private.resolve_deficiency(_deficiency,_evidence,_note) $$;
create function public.fp_recheck_deficiency(_deficiency uuid,_result text,_note text) returns void language sql security invoker set search_path='' as $$ select fp_private.recheck_deficiency(_deficiency,_result,_note) $$;
create function public.fp_disposition_signal(_signal uuid,_disposition public.signal_disposition,_reason text) returns void language sql security invoker set search_path='' as $$ select fp_private.disposition_signal(_signal,_disposition,_reason) $$;

revoke all on function fp_private.raise_deficiency(uuid,text,text,timestamptz),fp_private.link_claim_evidence(uuid,uuid,text),fp_private.unlink_claim_evidence(uuid,uuid),fp_private.verify_claim(uuid,public.claim_status,text),fp_private.resolve_deficiency(uuid,uuid,text),fp_private.recheck_deficiency(uuid,text,text),fp_private.disposition_signal(uuid,public.signal_disposition,text),fp_private.integrity_gate(uuid) from public,anon,authenticated;
grant execute on function fp_private.raise_deficiency(uuid,text,text,timestamptz),fp_private.link_claim_evidence(uuid,uuid,text),fp_private.unlink_claim_evidence(uuid,uuid),fp_private.verify_claim(uuid,public.claim_status,text),fp_private.resolve_deficiency(uuid,uuid,text),fp_private.recheck_deficiency(uuid,text,text),fp_private.disposition_signal(uuid,public.signal_disposition,text) to authenticated;
grant execute on function public.fp_link_claim_evidence(uuid,uuid,text),public.fp_unlink_claim_evidence(uuid,uuid),public.fp_verify_claim(uuid,public.claim_status,text),public.fp_raise_deficiency(uuid,text,text,timestamptz),public.fp_resolve_deficiency(uuid,uuid,text),public.fp_recheck_deficiency(uuid,text,text),public.fp_disposition_signal(uuid,public.signal_disposition,text) to authenticated;
notify pgrst,'reload schema';
commit;
