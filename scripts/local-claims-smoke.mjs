import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
process.loadEnvFile('.env.connected.local');process.loadEnvFile('.env.integration.local');
if(!['127.0.0.1','localhost'].includes(new URL(process.env.VITE_SUPABASE_URL).hostname))throw new Error('This test is restricted to the local stack.');
const accounts=JSON.parse(process.env.FP_TEST_ACCOUNTS);const clients={};let checks=0;
const ok=(condition,message)=>{assert.ok(condition,message);checks++;};
const check=result=>{if(result.error)throw new Error(result.error.message);return result.data;};
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
async function review(client,name,args){
  const child=check(await client.from(args._deficiency?'deficiencies':'application_claims').select('application_id').eq('id',args._deficiency??args._claim).single());
  const app=check(await client.from('applications').select('version').eq('id',child.application_id).single());
  return client.rpc(name,{...args,_expected_version:app.version,_request_id:randomUUID()});
}
async function upload(app,type){const client=clients.institution;const id=check(await client.rpc('fp_reserve_document',{_id:app,_type:type,_name:'known-synthetic-fixture.png',_mime:'image/png',_size:bytes.length}));const doc=check(await client.from('application_documents').select('*').eq('id',id).single());check(await client.storage.from('application-docs').upload(doc.file_path,bytes,{contentType:'image/png',upsert:false}));ok(Boolean((await client.storage.from('application-docs').download(doc.file_path)).error),'New upload remains quarantined');const hash=createHash('sha256').update(bytes).digest('hex');execFileSync('docker',['exec','-i','supabase_db_clauseway-sih26-local','psql','-U','postgres','-d','postgres','--set','ON_ERROR_STOP=on','-At'],{input:`select fp_private.complete_document('${id}','${hash}',true,'known-png-fixture-not-antivirus');`,stdio:['pipe','pipe','pipe']});return {...doc,scan_status:'clean'};}
async function act(client,app,action,payload={}){if(action==='approve'&&!payload.approval)payload={...payload,approval:{approval_type:'Synthetic test approval',academic_year_start:2026,academic_year_end:2026,valid_from:'2026-07-01',valid_to:'2027-06-30',items:[],conditions:[]}};const row=check(await client.from('applications').select('version').eq('id',app).single());return check(await client.rpc('fp_transition',{_id:app,_action:action,_reason:'Synthetic local workflow verification only.',_payload:payload,_expected_version:row.version,_request_id:randomUUID()}));}
try{
  for(const name of ['institution','scrutiny','regional']){const client=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});check(await client.auth.signInWithPassword(accounts[name]));clients[name]=client;}
  const app=check(await clients.institution.rpc('fp_create_application',{_type:'extension_self_disclosure',_title:'Demo local claim remediation workflow'}));
  check(await clients.institution.rpc('fp_save_draft',{_id:app,_title:'Demo local claim remediation workflow',_form:{academic_year:'2026-27',intake:'120',faculty_count:'40',declaration:'Synthetic local fixture for review only'},_version:1}));
  const claims=check(await clients.institution.from('application_claims').select('*').eq('application_id',app));ok(claims.length===9,'Nine claims were snapshotted');
  const docs={};for(const type of ['Affidavit','Faculty List','Land Document','Building Plan','Fire Safety Certificate','Undertaking'])docs[type]=await upload(app,type);
  for(const claim of claims)if(claim.verification_method!=='system_check')check(await review(clients.institution,'fp_link_claim_evidence',{_claim:claim.id,_document:docs[claim.evidence_types_snapshot[0]].id,_note:'Synthetic evidence linked by category.'}));
  await act(clients.institution,app,'submit');await act(clients.scrutiny,app,'start_scrutiny');
  for(const doc of check(await clients.scrutiny.from('application_documents').select('id').eq('application_id',app))){const current=check(await clients.scrutiny.from('applications').select('version').eq('id',app).single());check(await clients.scrutiny.rpc('fp_governance_command',{_kind:'document_validity',_id:doc.id,_payload:{validity_mode:'no_stated_expiry',issue_date:null,expires_on:null,issuer:'Synthetic fixture issuer',document_number:'DEMO-SMOKE',supersedes_document_id:null,note:'Reviewed the scanned synthetic fixture with no stated expiry.'},_expected_version:current.version,_request_id:randomUUID()}));}
  const fire=claims.find(c=>c.evidence_types_snapshot.includes('Fire Safety Certificate'));const system=claims.find(c=>c.verification_method==='system_check');
  ok(Boolean((await review(clients.scrutiny,'fp_link_claim_evidence',{_claim:fire.id,_document:docs['Faculty List'].id,_note:'Wrong category'})).error),'Wrong evidence category is rejected through the real API');
  const deficiency=check(await review(clients.scrutiny,'fp_raise_deficiency',{_claim:fire.id,_observation:'Please replace the synthetic fire certificate.',_remedy:'Provide a corrected synthetic fire certificate.',_due:new Date(Date.now()+86400000).toISOString()}));
  const replacement=await upload(app,'Fire Safety Certificate');
  ok(Boolean((await clients.institution.rpc('fp_reserve_document',{_id:app,_type:'Faculty List',_name:'unrelated.png',_mime:'image/png',_size:bytes.length})).error),'Unrelated uploads remain locked');
  const replacementCase=check(await clients.scrutiny.from('applications').select('version').eq('id',app).single());check(await clients.scrutiny.rpc('fp_governance_command',{_kind:'document_validity',_id:replacement.id,_payload:{validity_mode:'no_stated_expiry',issue_date:null,expires_on:null,issuer:'Synthetic replacement issuer',document_number:'DEMO-SMOKE-REPLACEMENT',supersedes_document_id:docs['Fire Safety Certificate'].id,note:'Reviewed the newly uploaded synthetic replacement evidence.'},_expected_version:replacementCase.version,_request_id:randomUUID()}));
  check(await review(clients.institution,'fp_resolve_deficiency',{_deficiency:deficiency,_evidence:replacement.id,_note:'A corrected synthetic certificate has been attached.'}));
  check(await review(clients.scrutiny,'fp_recheck_deficiency',{_deficiency:deficiency,_result:'accepted',_note:'Replacement fixture checked for this demonstration.'}));
  ok(check(await clients.scrutiny.from('application_claims').select('status').eq('id',fire.id).single()).status==='verified','Fresh-file deficiency remediation works end to end');
  for(const claim of claims.filter(c=>c.id!==fire.id))check(await review(clients.scrutiny,'fp_verify_claim',{_claim:claim.id,_result:'verified',_note:'Synthetic local evidence and demo rule checked.'}));
  const evaluated=check(await clients.scrutiny.from('application_claims').select('system_result').eq('id',system.id).single());ok(evaluated.system_result.passed&&evaluated.system_result.ratio===3,'Server persisted the actual evaluated demo ratio');
  await act(clients.scrutiny,app,'pass_scrutiny');await act(clients.regional,app,'approve',{evidence:docs.Affidavit.id});
  const audit=check(await clients.institution.rpc('fp_verify_audit_chain',{_application:app}));ok(audit.intact,'The real PostgreSQL audit chain verifies after remediation and a demo decision');
  const report={passed:checks,scope:'local Supabase only',claims:9,freshPrivateUploads:7,remediation:'upload → quarantine → trusted fixture completion → resolve → recheck → decision',auditIntact:true,scanner:'Known fixture completion only; antivirus integration is still required for real files.'};
  writeFileSync('docs/local-claims-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await Promise.all(Object.values(clients).map(client=>client.auth.signOut({scope:'local'})));}
