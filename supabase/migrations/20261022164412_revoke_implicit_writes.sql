begin;
-- Managed projects may auto-grant table writes at CREATE TABLE time.
-- RPC-only mutation needs explicit revocation as well as the absence of RLS policies.
revoke insert,update,delete,truncate,references,trigger on
  public.applications,public.user_roles,public.workflow_templates,public.config_audit,
  public.application_events,public.checklist_items,public.evc_visits,public.obligations
  from authenticated,anon;
revoke all on all sequences in schema public from authenticated,anon;
notify pgrst,'reload schema';
commit;
