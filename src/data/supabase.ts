import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type {CaseHistory,HistoryPage} from '../domain/review';
import type { AuditVerification } from '../domain/integrity';
import type { Repository,Advisory } from '../domain/model';
import type { DispatchNotificationResult } from '../domain/notification';
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
  return {url,key};
}
export function createSupabaseRepository(): Repository {
  const {url, key} = config();
  const client = createClient<Database>(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  function check(error: {message: string; code?: string} | null) {
    if (error) throw new Error(error.code === '40001' ? 'This case changed in another session. Reload and try again.' : error.message);
  }
  async function command(kind:string,id:string|null,payload:Record<string,unknown>,version:number|null,requestId:string){const result=await client.rpc('fp_governance_command',{_kind:kind,_id:id,_payload:payload,_expected_version:version,_request_id:requestId});check(result.error);}
  const unavailable=async()=>{throw new Error("This demonstration EVC panel action is unavailable in connected mode. Use the supported inspection planner.");};
  return {
    getEVCVisits:unavailable,getEVCAvailability:unavailable,scheduleEVC:unavailable,assignEVCMembers:unavailable,respondToEVC:unavailable,confirmEVC:unavailable,cancelEVC:unavailable,rescheduleEVC:unavailable,recordEVCUnavailability:unavailable,
    async applicationPage(q){const {data,error}=await client.rpc('fp_application_page',{_scope:q.scope,_query:q.query,_region:q.region,_status:q.status,_cursor:q.cursor,_limit:q.limit});check(error);if(!data)throw new Error('Register unavailable.');return data;},
    async caseBundle(id){const {data,error}=await client.rpc('fp_case_bundle',{_id:id});check(error);if(!data)throw new Error('Case unavailable.');return data;},
    async workerJobs(id){const {data,error}=await client.rpc('fp_worker_jobs',{_application:id});check(error);if(!data)throw new Error('Worker records unavailable.');return data;},
    async retryJob(kind,id,version,note,key=crypto.randomUUID()){const {error}=await client.rpc('fp_job_retry',{_kind:kind,_id:id,_expected:version,_note:note,_request:key});check(error);},
    async operationsCommand(kind,id,payload,expected,key=crypto.randomUUID()){const {data,error}=await client.rpc('fp_operations_command',{_kind:kind,_id:id,_payload:payload,_expected:expected,_request:key});check(error);return data??{};},
    async caseCandidates(id){const {data,error}=await client.rpc('fp_case_candidates',{_id:id});check(error);return data??[];},
    async readiness(){const {data,error}=await client.rpc('fp_operational_readiness',{});check(error);if(!data)throw new Error('Readiness check unavailable.');return data;},
    async policyCommand(kind,id,payload,expected,key=crypto.randomUUID()){const {data,error}=await client.rpc('fp_policy_command',{_kind:kind,_id:id,_payload:payload,_expected:expected,_request:key});check(error);return data??{};},
    async saveScope(app,year,items,id=crypto.randomUUID()){await command('scope_save',app.id,{academic_year_start:year,items},app.version,id);},
    async reviewScope(app,note,id=crypto.randomUUID()){await command('scope_review',app.id,{note},app.version,id);},
    async reviewDocumentValidity(app,doc,input,id=crypto.randomUUID()){await command('document_validity',doc.id,{...input},app.version,id);},
    async createNotice(input,id=crypto.randomUUID()){await command('notice_create',null,{...input},null,id);},
    async reviewNotice(notice,note,id=crypto.randomUUID()){await command('notice_review',notice.id,{note},notice.revision,id);},
    async previewNotice(notice){const {data,error}=await client.rpc('fp_notice_preview',{_id:notice.id});check(error);if(!data)throw new Error('Notice preview unavailable.');return data;},
    async adoptNotice(notice,impact,note,id=crypto.randomUUID()){await command('notice_adopt',notice.id,{note,impact_hash:impact.impact_hash},notice.revision,id);},
    async fulfilWithEvidence(app,obligation,evidence,note,id=crypto.randomUUID()){await command('obligation_fulfil',obligation.id,{evidence_ids:evidence,note},app.version,id);},
    async submitRenewal(app,expired,input,id=crypto.randomUUID()){const note=input.note.trim();if(note.length<10||note.length>1000)throw new Error('Describe the replacement in 10 to 1,000 characters.');if(Boolean(input.file)===Boolean(input.documentId))throw new Error('Choose one replacement file or one clean uploaded document.');const {data,error}=await client.rpc('fp_renewal_submit',{_expired:expired.id,_document:input.documentId??null,_note:note,_expected_version:app.version,_request_id:id});check(error);if(!data)throw new Error('Renewal submission returned no result.');},
    async captureAnalysis(app,id=crypto.randomUUID()){const {data,error}=await client.rpc('fp_capture_analysis',{_application:app.id,_expected_version:app.version,_request_id:id});check(error);if(!data)throw new Error('Analysis capture unavailable.');return data;},
    async saveScenario(snapshot,parameters,id=crypto.randomUUID()){const {data,error}=await client.rpc('fp_save_analysis',{_snapshot:snapshot.id,_parameters:{...parameters},_request_id:id});check(error);if(!data)throw new Error('Scenario save unavailable.');return data;},
    async inspectionCommand(kind,id,payload,version,requestId=crypto.randomUUID()){const {data,error}=await client.rpc('fp_inspection_command',{_kind:kind,_id:id,_payload:payload,_expected_version:version,_request_id:requestId});check(error);return data??{};},
    mode: 'connected',
    async identity() {
      const {data: {session}} = await client.auth.getSession();
      if (!session) return null;
      const {data: {user}, error} = await client.auth.getUser(); check(error);
      if (!user) return null;
      const [profile, roles] = await Promise.all([client.from('profiles').select('*').eq('id', user.id).single(), client.from('user_roles').select('*').eq('user_id',user.id).eq('active',true)]);
      check(profile.error); check(roles.error);
      return {id: user.id, email: user.email ?? '', name: profile.data?.full_name || 'Workspace member', roles: (roles.data ?? []).filter(role=>!role.revoked_at&&(!role.expires_at||Date.parse(role.expires_at)>Date.now()))};
    },
    subscribeAuth(callback) { const {data: {subscription}} = client.auth.onAuthStateChange(() => { queueMicrotask(callback); }); return () => subscription.unsubscribe(); },
    async signIn(email, password) { const {error} = await client.auth.signInWithPassword({email,password}); check(error); },
    async signOut() { const {error} = await client.auth.signOut({scope: 'local'}); check(error); },
    async workspace() {
      const first=await client.rpc('fp_application_page',{_scope:'all',_query:'',_region:null,_status:null,_cursor:null,_limit:100});check(first.error);if(!first.data)throw new Error('Workspace page unavailable.');
      const caseIds=first.data.items.map(app=>app.id),institutionIds=[...new Set(first.data.items.map(app=>app.institution_id))];
      const [windowDocuments,windowClaims]=await Promise.all([client.from('application_documents').select('*').in('application_id',caseIds).order('uploaded_at',{ascending:false}).limit(1000),client.from('application_claims').select('*').in('application_id',caseIds).limit(2000)]);check(windowDocuments.error);check(windowClaims.error);const claimIds=windowClaims.data?.map(row=>row.id)??[];

      const [applications,institutions,templates,documents,events,checklist,visits,obligations,notifications,requirements,claims,claimEvidence,deficiencies,signals,grants,agents,scopeRequests,approvals,approvalScope,notices,deadlines,reminders,analysisSnapshots,analysisScenarios,experts,availability,conflicts,reservations,caseReviews,deliveries,workerHealth,deliveryAttempts] = await Promise.all([
        Promise.resolve({data:first.data.items,error:null}),
        client.from('institutions').select('*').in('id',institutionIds).limit(200), client.from('workflow_templates').select('*').limit(50),
        Promise.resolve(windowDocuments),
        client.from('application_events').select('*').in('application_id',caseIds).order('created_at',{ascending:false}).limit(500),
        client.from('checklist_items').select('*').in('application_id',caseIds).limit(1000),client.from('evc_visits').select('*').in('application_id',caseIds).limit(200),
        client.from('obligations').select('*').in('application_id',caseIds).limit(500),client.from('notifications').select('*').order('created_at',{ascending:false}).limit(100),
        client.from('requirements').select('*').limit(2000),Promise.resolve(windowClaims),
        client.from('claim_evidence').select('*').in('claim_id',claimIds).limit(4000),client.from('deficiencies').select('*').in('application_id',caseIds).limit(2000),
        client.from('integrity_signals').select('*').in('application_id',caseIds).limit(2000),
        client.from('user_roles').select('*').limit(2000),
        client.from('agent_registry').select('*').limit(200),
        client.from('application_scope_items').select('*').in('application_id',caseIds).limit(4000),client.from('approval_records').select('*').limit(1000),client.from('approval_scope_items').select('*').limit(4000),client.from('policy_notices').select('*').limit(500),client.from('applied_deadlines').select('*').in('application_id',caseIds).order('created_at',{ascending:false}).limit(2000),client.from('deadline_reminder_intents').select('*').in('application_id',caseIds).limit(2000),client.from('analysis_snapshots').select('*').in('application_id',caseIds).order('captured_at',{ascending:false}).limit(100),client.from('analysis_scenarios').select('*').in('application_id',caseIds).order('created_at',{ascending:false}).limit(200),client.from('inspection_experts').select('*').limit(500),client.from('expert_availability').select('*').limit(2000),client.from('expert_conflicts').select('*').limit(1000),client.from('expert_reservations').select('*').in('application_id',caseIds).limit(2000),
        client.rpc('fp_case_reviews',{}),client.from('delivery_outbox').select('*').in('application_id',caseIds).order('created_at',{ascending:false}).limit(500),client.from('worker_health').select('*'),client.from('delivery_attempts').select('*').order('happened_at',{ascending:false}).limit(1000),
      ]);
      for (const result of [applications,institutions,templates,documents,events,checklist,visits,obligations,notifications,requirements,claims,claimEvidence,deficiencies,signals,grants,agents,scopeRequests,approvals,approvalScope,notices,deadlines,reminders,analysisSnapshots,analysisScenarios,experts,availability,conflicts,reservations,caseReviews,deliveries,workerHealth,deliveryAttempts]) check(result.error);
      return {evc_visits:[],evc_members:[],evc_unavailability:[],evc_schedule_history:[],read_window:{loaded_cases:first.data.items.length,total_cases:first.data.counts.all,as_of:first.data.as_of},delivery_attempts:deliveryAttempts.data??[],case_reviews:caseReviews.data??[],delivery_outbox:deliveries.data??[],worker_health:workerHealth.data??[],inspection_experts:experts.data??[],expert_availability:availability.data??[],expert_conflicts:conflicts.data??[],expert_reservations:reservations.data??[],analysis_snapshots:analysisSnapshots.data??[],analysis_scenarios:analysisScenarios.data??[],scope_requests:scopeRequests.data??[],approvals:approvals.data??[],approval_scope:approvalScope.data??[],notices:notices.data??[],deadlines:deadlines.data??[],reminder_intents:reminders.data??[],applications:applications.data??[],institutions:institutions.data??[],templates:templates.data??[],documents:documents.data??[],events:events.data??[],checklist:checklist.data??[],visits:visits.data??[],obligations:obligations.data??[],notifications:notifications.data??[],requirements:requirements.data??[],claims:claims.data??[],claim_evidence:claimEvidence.data??[],deficiencies:deficiencies.data??[],integrity_signals:signals.data??[],access_assignments:grants.data??[],agents:agents.data??[]};
    },
    async createInstitution(input) { const v=institutionSchema.parse(input); const {error}=await client.rpc('fp_create_institution',{_name:v.name,_ref:v.aicte_ref,_region:v.region,_state:v.state}); check(error); },
    async createApplication(type,title,initialForm={}) { const {data,error}=await client.rpc('fp_create_application_draft',{_type:type,_title:titleSchema.parse(title),_form:initialForm}); check(error); if (!data) throw new Error('No application was created.'); return data; },
    async saveDraft(application,title,form) { const {error}=await client.rpc('fp_save_draft',{_id:application.id,_title:titleSchema.parse(title),_form:form,_version:application.version}); check(error); },
    async transition({application,action,reason,payload,requestId}) { const {error}=await client.rpc('fp_transition',{_id:application.id,_action:action,_reason:reason,_payload:payload,_expected_version:application.version,_request_id:requestId}); check(error); },
    async checklist(application,item,passed,note) { const {error}=await client.rpc('fp_checklist',{_id:application.id,_item:item,_passed:passed,_note:note}); check(error); },
    async verifyClaim(application,claim,result,note,requestId=crypto.randomUUID()) { const {error}=await client.rpc('fp_verify_claim',{_claim:claim.id,_result:result,_note:note||null,_expected_version:application.version,_request_id:requestId}); check(error); },
    async linkClaimEvidence(application,claim,document,note,requestId=crypto.randomUUID()) { const {error}=await client.rpc('fp_link_claim_evidence',{_claim:claim.id,_document:document.id,_note:note||null,_expected_version:application.version,_request_id:requestId}); check(error); },
    async raiseClaimDeficiency(application,claim,observation,remedy,dueAt,requestId=crypto.randomUUID()) { const {error}=await client.rpc('fp_raise_deficiency',{_claim:claim.id,_observation:observation,_remedy:remedy,_due:dueAt,_expected_version:application.version,_request_id:requestId}); check(error); },
    async resolveClaimDeficiency(application,deficiency,evidence,note,requestId=crypto.randomUUID()) { const {error}=await client.rpc('fp_resolve_deficiency',{_deficiency:deficiency.id,_evidence:evidence.id,_note:note,_expected_version:application.version,_request_id:requestId}); check(error); },
    async recheckClaimDeficiency(application,deficiency,result,note,requestId=crypto.randomUUID()) { const {error}=await client.rpc('fp_recheck_deficiency',{_deficiency:deficiency.id,_result:result,_note:note,_expected_version:application.version,_request_id:requestId}); check(error); },
    async history(application):Promise<CaseHistory> {
      const events:CaseHistory['events']=[];let after=0;let through:number|null=null;let head:string|null=null;
      for(let page=0;page<20;page++){
        const response=await client.rpc('fp_case_history',{_application:application.id,_after:after,_through:through,_limit:100});check(response.error);
        const data=response.data as HistoryPage|null;
        if(!data)throw new Error('History page unavailable.');
        if(through!==null&&(data.through!==through||data.head_hash!==head))throw new Error('History checkpoint changed. Reload the case.');
        through=data.through;head=data.head_hash;
        for(const event of data.events){if(event.application_id!==application.id||event.sequence!==after+1)throw new Error('History sequence is incomplete.');events.push(event);after=event.sequence;}
        if(data.complete)return {events,through,head_hash:head,complete:after===through};
        if(data.next_after!==after||!data.events.length)throw new Error('History did not advance.');
      }
      return {events,through:through??after,head_hash:head,complete:false,message:'This case exceeds the current history-read limit.'};
    },
    async verifyAudit(application) {
      const {data,error}=await client.rpc('fp_verify_audit_chain',{_application:application.id});
      check(error);
      if(!data) throw new Error('Audit verification returned no result.');
      return data as AuditVerification;
    },
    async tamperReplay(application) {
      const {data,error}=await client.rpc('fp_demo_tamper_replay',{_application:application.id});
      check(error);
      if(!data) throw new Error('Tamper replay returned no result.');
      return data as AuditVerification;
    },
    async upload(application,type,file) {
      validateFile(file);
      const {data:id,error}=await client.rpc('fp_reserve_document',{_id:application.id,_type:type,_name:file.name,_mime:file.type,_size:file.size}); check(error);
      if (!id) throw new Error('Document reservation failed.');
      const {data:doc,error:readError}=await client.from('application_documents').select('*').eq('id',id).single(); check(readError);
      if (!doc) throw new Error('Document reservation is unavailable.');
      const {error:uploadError}=await client.storage.from('application-docs').upload(doc.file_path,file,{upsert:false,contentType:file.type,cacheControl:'0'}); check(uploadError);
      const queued=await client.rpc('fp_enqueue_scan',{_document:id});check(queued.error);
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
    async dispositionSignal(signalId,disposition,reason) { const {error}=await client.rpc('fp_disposition_signal',{_signal:signalId,_disposition:disposition,_reason:reason}); check(error); },
    async dispatchNotification(params) { const {data,error}=await (client.rpc as any)('fp_dispatch_notification',{_user:params.toUserId,_channel:params.channel?.[0]??'in_app',_kind:params.kind,_subject:params.subject,_body:params.body,_application:params.applicationId}); check(error); return data as unknown as DispatchNotificationResult; },
    async advisory(application) {const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Sign in again to request an advisory.');const response=await fetch('/api/advisories',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({caseId:application.id})});if(!response.ok)throw new Error('Advisory service unavailable. Start the local automation service and retry.');return response.json() as Promise<Advisory>;},
  };
}
