begin;
create unique index if not exists integrity_signals_fingerprint_idx
  on public.integrity_signals(application_id,signal_type,fingerprint);

alter table public.application_documents add column if not exists issuer text;
alter table public.application_documents add column if not exists document_number text;

create or replace function fp_private.document_integrity(_document uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.application_documents; other public.application_documents;
begin
  select * into d from public.application_documents where id=_document;
  if d.id is null then return; end if;

  if d.expires_on is not null and d.expires_on<current_date then
    insert into public.integrity_signals(application_id,document_id,signal_type,severity,fingerprint,detail)
    values(d.application_id,d.id,'expired_document','warning','expires:'||d.expires_on::text,
      jsonb_build_object('expires_on',d.expires_on,'doc_type',d.doc_type,'issuer',d.issuer,'document_number',d.document_number))
    on conflict(application_id,signal_type,fingerprint) do nothing;
  end if;

  if d.sha256 is not null then
    select * into other from public.application_documents o
    where o.sha256=d.sha256 and o.id<>d.id and o.application_id<>d.application_id
    order by o.uploaded_at limit 1;
    if other.id is not null then
      insert into public.integrity_signals(application_id,document_id,signal_type,severity,fingerprint,detail)
      values(d.application_id,d.id,'duplicate_document','warning','sha256:'||d.sha256,
        jsonb_build_object('matched_document_id',other.id,'matched_application_id',other.application_id,'doc_type',d.doc_type))
      on conflict(application_id,signal_type,fingerprint) do nothing;
    end if;
  end if;
end $$;

create or replace function fp_private.on_document_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform fp_private.document_integrity(new.id);
  return new;
end $$;

drop trigger if exists document_integrity on public.application_documents;
create trigger document_integrity after insert or update of sha256,expires_on,scan_status
  on public.application_documents for each row execute function fp_private.on_document_integrity();

create or replace function fp_private.document_passport(_document uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.application_documents;
begin
  select * into d from public.application_documents where id=_document;
  if d.id is null or not fp_private.can_view(d.application_id) then
    raise exception 'Document unavailable' using errcode='42501';
  end if;
  return jsonb_build_object(
    'document',jsonb_build_object(
      'id',d.id,'application_id',d.application_id,'doc_type',d.doc_type,'file_name',d.file_name,
      'mime_type',d.mime_type,'size_bytes',d.size_bytes,'scan_status',d.scan_status,'sha256',d.sha256,
      'issuer',d.issuer,'document_number',d.document_number,'expires_on',d.expires_on,'uploaded_at',d.uploaded_at),
    'duplicates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'document_id',o.id,'application_id',o.application_id,'ref_no',a.ref_no,
        'doc_type',o.doc_type,'uploaded_at',o.uploaded_at))
      from public.application_documents o join public.applications a on a.id=o.application_id
      where d.sha256 is not null and o.sha256=d.sha256 and o.id<>d.id and o.application_id<>d.application_id
    ),'[]'::jsonb),
    'claims',coalesce((
      select jsonb_agg(jsonb_build_object(
        'claim_id',c.id,'clause',c.clause_snapshot,'statement',c.statement_snapshot,
        'status',c.status,'verification_method',c.verification_method))
      from public.claim_evidence ce join public.application_claims c on c.id=ce.claim_id
      where ce.document_id=d.id
    ),'[]'::jsonb),
    'signals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'signal_type',s.signal_type,'severity',s.severity,'disposition',s.disposition,
        'disposition_reason',s.disposition_reason,'detail',s.detail,'created_at',s.created_at) order by s.created_at)
      from public.integrity_signals s where s.document_id=d.id
    ),'[]'::jsonb)
  );
end $$;

create or replace function public.fp_document_passport(_document uuid) returns jsonb
language sql security invoker set search_path='' as $$ select fp_private.document_passport(_document) $$;
revoke all on function public.fp_document_passport(uuid) from public,anon;
grant execute on function public.fp_document_passport(uuid) to authenticated;

do $$ declare r record; begin
  for r in select id from public.application_documents loop
    perform fp_private.document_integrity(r.id);
  end loop;
end $$;
commit;
