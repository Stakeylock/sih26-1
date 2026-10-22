import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { Repository,Advisory } from '../domain/model';
import { institutionSchema, titleSchema, validateFile } from '../domain/validation';

function config() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) throw new Error('Connected workspace is not configured. Set the project URL and publishable key in .env.local.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error('HTTPS is required.');
  if (key.startsWith('sb_secret_')) throw new Error('A secret key must never be used in the browser.');
  if (key.startsWith('eyJ')) {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {role?: string};
    if (payload.role !== 'anon') throw new Error('Only a publishable or legacy anonymous key is permitted.');
  } else if (!key.startsWith('sb_publishable_')) throw new Error('Invalid publishable key.');
  return {url, key};
}
export function createSupabaseRepository(): Repository {
  const {url, key} = config();
  const client = createClient<Database>(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  function check(error: {message: string; code?: string} | null) {
    if (error) throw new Error(error.code === '40001' ? 'This case changed in another session. Reload and try again.' : error.message);
  }
  return {
    mode: 'connected',
    async identity() {
      const {data: {session}} = await client.auth.getSession();
      if (!session) return null;
      const {data: {user}, error} = await client.auth.getUser(); check(error);
      if (!user) return null;
      const [profile, roles] = await Promise.all([client.from('profiles').select('*').eq('id', user.id).single(), client.from('user_roles').select('*').eq('user_id',user.id).eq('active',true)]);
      check(profile.error); check(roles.error);
      return {id: user.id, email: user.email ?? '', name: profile.data?.full_name || 'Workspace member', roles: roles.data ?? []};
    },
    subscribeAuth(callback) { const {data: {subscription}} = client.auth.onAuthStateChange(() => { queueMicrotask(callback); }); return () => subscription.unsubscribe(); },
    async signIn(email, password) { const {error} = await client.auth.signInWithPassword({email,password}); check(error); },
    async signOut() { const {error} = await client.auth.signOut({scope: 'local'}); check(error); },
    async workspace() {
      const [applications,institutions,templates,documents,events,checklist,visits,obligations,notifications] = await Promise.all([
        client.from('applications').select('*').order('created_at',{ascending:false}).limit(200),
        client.from('institutions').select('*').limit(200), client.from('workflow_templates').select('*').limit(50),
        client.from('application_documents').select('*').order('uploaded_at',{ascending:false}).limit(1000),
        client.from('application_events').select('*').order('created_at',{ascending:false}).limit(500),
        client.from('checklist_items').select('*').limit(1000),client.from('evc_visits').select('*').limit(200),
        client.from('obligations').select('*').limit(500),client.from('notifications').select('*').order('created_at',{ascending:false}).limit(100),
      ]);
      for (const result of [applications,institutions,templates,documents,events,checklist,visits,obligations,notifications]) check(result.error);
      return {applications:applications.data??[],institutions:institutions.data??[],templates:templates.data??[],documents:documents.data??[],events:events.data??[],checklist:checklist.data??[],visits:visits.data??[],obligations:obligations.data??[],notifications:notifications.data??[]};
    },
    async createInstitution(input) { const v=institutionSchema.parse(input); const {error}=await client.rpc('fp_create_institution',{_name:v.name,_ref:v.aicte_ref,_region:v.region,_state:v.state}); check(error); },
    async createApplication(type,title) { const {data,error}=await client.rpc('fp_create_application',{_type:type,_title:titleSchema.parse(title)}); check(error); if (!data) throw new Error('No application was created.'); return data; },
    async saveDraft(application,title,form) { const {error}=await client.rpc('fp_save_draft',{_id:application.id,_title:titleSchema.parse(title),_form:form,_version:application.version}); check(error); },
    async transition({application,action,reason,payload,requestId}) { const {error}=await client.rpc('fp_transition',{_id:application.id,_action:action,_reason:reason,_payload:payload,_expected_version:application.version,_request_id:requestId}); check(error); },
    async checklist(application,item,passed,note) { const {error}=await client.rpc('fp_checklist',{_id:application.id,_item:item,_passed:passed,_note:note}); check(error); },
    async upload(application,type,file) {
      validateFile(file);
      const {data:id,error}=await client.rpc('fp_reserve_document',{_id:application.id,_type:type,_name:file.name,_mime:file.type,_size:file.size}); check(error);
      if (!id) throw new Error('Document reservation failed.');
      const {data:doc,error:readError}=await client.from('application_documents').select('*').eq('id',id).single(); check(readError);
      if (!doc) throw new Error('Document reservation is unavailable.');
      const {error:uploadError}=await client.storage.from('application-docs').upload(doc.file_path,file,{upsert:false,contentType:file.type,cacheControl:'0'}); check(uploadError);
      // A trusted scanner must inspect the uploaded bytes before setting clean.
      // No client-side "scan passed" assertion can release a quarantined file.
    },
    async download(doc) {
      if (doc.scan_status !== 'clean') throw new Error('This document is quarantined until its scan is complete.');
      const {data,error}=await client.storage.from('application-docs').download(doc.file_path); check(error);
      if (!data) throw new Error('Document download failed.');
      const objectUrl=URL.createObjectURL(data); const anchor=document.createElement('a'); anchor.href=objectUrl; anchor.download=doc.file_name; anchor.click(); setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    },
    async markRead(id) { const {error}=await client.rpc('fp_mark_read',{_id:id}); check(error); },
    async fulfil(id,reason) { const {error}=await client.rpc('fp_fulfil',{_id:id,_reason:reason}); check(error); },
    async advisory(application) {const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Sign in again to request an advisory.');const response=await fetch('/api/advisories',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({caseId:application.id})});if(!response.ok)throw new Error('Advisory service unavailable. Start the local automation service and retry.');return response.json() as Promise<Advisory>;},
  };
}
