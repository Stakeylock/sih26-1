begin;
alter function public.fp_case_reviews() set schema fp_private;
alter function fp_private.fp_case_reviews() rename to case_reviews;
create function public.fp_case_reviews() returns jsonb language sql security invoker set search_path='' as $$select fp_private.case_reviews()$$;
revoke all on function fp_private.case_reviews(),public.fp_case_reviews() from public,anon,authenticated;
grant execute on function fp_private.case_reviews(),public.fp_case_reviews() to authenticated;
notify pgrst,'reload schema';commit;
