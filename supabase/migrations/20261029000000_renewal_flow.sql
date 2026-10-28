begin;

-- Allow the submitted renewal state introduced by fp_renewal_submit.
alter table public.obligations drop constraint if exists obligations_status_check;
alter table public.obligations add constraint obligations_status_check check(status in('open','fulfilled','escalated','submitted'));

-- Never create a second document_expiry follow-up for a document that already
-- has an open renewal. Fulfilled renewals do not suppress a fresh expiry.
create function fp_private.suppress_renewal_expiry_duplicate() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.kind='document_expiry' and new.document_id is not null then
    if exists(select 1 from public.obligations r where r.application_id=new.application_id and r.kind='renewal' and r.document_id=new.document_id and r.status in('open','escalated','submitted')) then
      return null;
    end if;
  end if;
  return new;
end $$;
create trigger suppress_renewal_expiry_duplicate before insert on public.obligations for each row execute function fp_private.suppress_renewal_expiry_duplicate();

-- Owner-institution renewal submission for an expired required document.
create function fp_private.fp_renewal_submit(_expired uuid,_document uuid,_note text,_expected_version int,_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=fp_private.actor();a public.applications;expired public.application_documents;document public.application_documents;o public.obligations;receipt fp_private.governance_receipts;body jsonb:=jsonb_build_object('kind','renewal_submit','id',null,'payload',jsonb_build_object('expired',_expired,'document',_document,'note',_note,'version',_expected_version),'version',_expected_version);result jsonb:='{}';
begin
  if _request_id is null then raise exception 'Request ID required';end if;
  if coalesce(length(trim(_note)),0) not between 10 and 1000 then raise exception 'Describe the replacement in 10 to 1,000 characters.';end if;
  select * into expired from public.application_documents where id=_expired for update;
  if expired.id is null then raise exception 'Expired document unavailable';end if;
  select * into a from public.applications where id=expired.application_id for update;
  if a.id is null then raise exception 'Case unavailable';end if;
  if a.owner_id<>uid or not fp_private.has_role('institution') then raise exception 'The owning institution must submit its renewal.' using errcode='42501';end if;
  if a.status<>'approved' then raise exception 'Only the owning institution can renew an approved case.' using errcode='42501';end if;
  if not(a.template_snapshot->'required_documents' ? expired.doc_type) then raise exception 'Choose an expired, clean required document.';end if;
  if expired.expires_on is null or expired.expires_on>=(now() at time zone 'Asia/Kolkata')::date then raise exception 'Choose an expired, clean required document.';end if;
  if expired.scan_status<>'clean' or expired.sha256 is null then raise exception 'Choose an expired, clean required document.';end if;
  select * into receipt from fp_private.governance_receipts where request_id=_request_id;
  if found then if receipt.actor_id<>uid or receipt.input<>body then raise exception 'Request ID already used';end if;return receipt.result;end if;
  if _expected_version is distinct from a.version then raise exception 'Record changed; reload before acting' using errcode='40001';end if;
  select * into document from public.application_documents where id=_document for update;
  if document.id is null then raise exception 'Replacement document unavailable';end if;
  if document.id=_expired then raise exception 'Replacement must differ from the expired document.';end if;
  if document.application_id<>a.id or document.subject_institution_id<>a.institution_id then raise exception 'Replacement must belong to this case and institution.';end if;
  if document.doc_type<>expired.doc_type then raise exception 'Replacement must be the same document type.';end if;
  if document.scan_status<>'clean' or document.sha256 is null then raise exception 'Replacement must be a clean, scanned document.';end if;
  if document.expires_on is not null and document.expires_on<(now() at time zone 'Asia/Kolkata')::date then raise exception 'Replacement must not be expired.';end if;
  if document.supersedes_document_id is not null and document.supersedes_document_id<>_expired then raise exception 'Replacement already supersedes another document.';end if;
  update public.obligations
  set document_id=_expired,document_expiry_on=expired.expires_on,due_date=expired.expires_on,deadline_source='document_validity',required_evidence=array[expired.doc_type],status='submitted',deadline_revision=deadline_revision+1
  where application_id=a.id and kind='renewal' and status in('open','escalated')
  returning * into o;
  if not found then
    select * into o from public.obligations where application_id=a.id and kind='renewal';
    if o.id is not null then raise exception 'A renewal has already been submitted for this case.';end if;
    insert into public.obligations(institution_id,application_id,document_id,document_expiry_on,kind,title,due_date,region,required_evidence,deadline_source,status,deadline_revision)
    values(a.institution_id,a.id,_expired,expired.expires_on,'renewal','Renewal required - '||expired.doc_type,expired.expires_on,a.region,array[expired.doc_type],'document_validity','submitted',1) returning * into o;
  end if;
  update public.application_documents set supersedes_document_id=_expired where id=_document;
  update public.applications set version=a.version+1,updated_at=now() where id=a.id;
  result:=jsonb_build_object('application_id',a.id,'obligation_id',o.id,'document_id',_document,'version',a.version+1);
  perform fp_private.event(a.id,'renewal_submitted',a.status,a.status,_note,jsonb_build_object('obligation_id',o.id,'document_id',_document,'replaces_document_id',_expired,'note',_note,'sha256',document.sha256));
  insert into fp_private.governance_receipts values(_request_id,uid,a.id,body,result);
  return result;
end $$;

-- Approved-case renewal upload branch, mirroring the demo gate without relaxing unrelated uploads.
create or replace function fp_private.can_upload_document(app uuid,kind text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.applications a where a.id=app and a.owner_id=fp_private.actor() and fp_private.has_role('institution') and (
  (a.status in('draft','deficiency_raised') and ((a.template_snapshot->'required_documents') ? kind or exists(select 1 from public.application_claims c where c.application_id=a.id and kind=any(c.evidence_types_snapshot))))
  or(a.status='under_scrutiny' and exists(select 1 from public.deficiencies d join public.application_claims c on c.id=d.claim_id where d.application_id=a.id and d.status in('open','escalated') and kind=any(c.evidence_types_snapshot)))
  or exists(select 1 from public.obligations o where o.application_id=a.id and o.status<>'fulfilled' and kind=any(o.required_evidence))
  or(a.status='approved' and exists(select 1 from public.application_documents d where d.application_id=a.id and d.doc_type=kind and d.scan_status='clean' and d.sha256 is not null and d.expires_on<(now() at time zone 'Asia/Kolkata')::date))));
$$;

create function public.fp_renewal_submit(_expired uuid,_document uuid,_note text,_expected_version int,_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select fp_private.fp_renewal_submit(_expired,_document,_note,_expected_version,_request_id)$$;
revoke all on function fp_private.fp_renewal_submit(uuid,uuid,text,int,uuid) from public,anon,authenticated;
revoke all on function public.fp_renewal_submit(uuid,uuid,text,int,uuid) from public,anon,authenticated;
grant execute on function fp_private.fp_renewal_submit(uuid,uuid,text,int,uuid),public.fp_renewal_submit(uuid,uuid,text,int,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
