import {createClient} from '@supabase/supabase-js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');process.loadEnvFile('.env.integration.local');
const accounts=JSON.parse(process.env.FP_TEST_ACCOUNTS);const clients={};let checks=0;
const fixtureFile='.env.integration-fixtures.local';
function ok(value,message){assert.ok(value,message);checks++;}
function check(result){if(result.error)throw new Error(result.error.message);return result.data;}
async function snapshot(client,id){return check(await client.from('applications').select('*').eq('id',id).single());}
async function transition(client,id,action,reason='Synthetic integration test reason',payload={},requestId=randomUUID(),version){const a=await snapshot(client,id);return client.rpc('fp_transition',{_id:id,_action:action,_reason:reason,_payload:payload,_expected_version:version??a.version,_request_id:requestId});}
try{
  for(const [name,a] of Object.entries(accounts)){const client=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});check(await client.auth.signInWithPassword({email:a.email,password:a.password}));clients[name]=client;}
  if(process.argv[2]==='prepare'){
    for(const [name,region] of [['institution','South'],['other','West']]){const rows=check(await clients[name].from('institutions').select('id'));if(!rows.length)check(await clients[name].rpc('fp_create_institution',{_name:`Demo ${name} integration institute`,_ref:`DEMO-INTEGRATION-${name.toUpperCase()}`,_region:region,_state:'Synthetic state'}));}
    const id=check(await clients.institution.rpc('fp_create_application',{_type:'new_programme',_title:'Demo integration workflow'}));
    check(await clients.institution.rpc('fp_save_draft',{_id:id,_title:'Demo integration workflow',_form:{programme_name:'Synthetic robotics',level:'Undergraduate',intake:'60',lab_details:'Synthetic inventory for integration testing'},_version:1}));
    const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
    const docs=[];
    for(const type of ['Building Plan','Faculty List','Lab Equipment Inventory']){const docId=check(await clients.institution.rpc('fp_reserve_document',{_id:id,_type:type,_name:'synthetic-fixture.png',_mime:'image/png',_size:bytes.length}));const doc=check(await clients.institution.from('application_documents').select('*').eq('id',docId).single());check(await clients.institution.storage.from('application-docs').upload(doc.file_path,bytes,{contentType:'image/png',upsert:false}));ok(Boolean((await clients.institution.storage.from('application-docs').download(doc.file_path)).error),'Unscanned bytes must be inaccessible');docs.push({id:docId,path:doc.file_path,sha256:createHash('sha256').update(bytes).digest('hex')});}
    ok(Boolean((await transition(clients.institution,id,'submit')).error),'Pending scans block submission');
    ok(Boolean((await clients.institution.rpc('fp_complete_document',{_id:docs[0].id,_sha256:docs[0].sha256,_clean:true,_engine:'forged'})).error),'Client cannot release quarantine');
    writeFileSync(fixtureFile,'FP_INTEGRATION_FIXTURES='+JSON.stringify({id,docs})+'\n');
    console.log(JSON.stringify({phase:'prepare',passed:checks,accounts:Object.keys(clients).length,privateUploads:docs.length,scanner:'Fixture scan completion still required'}));
  }else{
    const fixture=JSON.parse(readFileSync(fixtureFile,'utf8').split('FP_INTEGRATION_FIXTURES=')[1]);const {id,docs}=fixture;
    ok(check(await clients.other.from('applications').select('id').eq('id',id)).length===0,'Cross-institution reads denied');
    ok(check(await clients.west.from('applications').select('id').eq('id',id)).length===0,'Cross-region reads denied');
    const key=randomUUID();const submitted=check(await transition(clients.institution,id,'submit','Synthetic test submission',{},key));
    check(await transition(clients.institution,id,'submit','Synthetic test submission',{},key,2));
    const raced=await Promise.all(['scrutiny','second'].map(name=>transition(clients[name],id,'start_scrutiny','Race test',{},randomUUID(),submitted.version)));
    ok(raced.filter(x=>!x.error).length===1,'Exactly one concurrent reviewer acquires the case');
    const owner=raced[0].error?'second':'scrutiny';const reviewer=clients[owner];
    check(await transition(reviewer,id,'raise_deficiency','Correct the synthetic inventory for this demonstration.'));
    check(await transition(clients.institution,id,'resubmit','Synthetic inventory corrected and ready for review.'));
    check(await transition(reviewer,id,'start_scrutiny'));
    const app=await snapshot(reviewer,id);for(const item of app.template_snapshot.checklist)check(await reviewer.rpc('fp_checklist',{_id:id,_item:item,_passed:true,_note:'Synthetic evidence verified for test.'}));
    check(await transition(reviewer,id,'pass_scrutiny','No expert visit needed for this synthetic test.',{evc:false}));
    ok(Boolean((await transition(clients.evc,id,'approve','Unauthorized demo approval',{evidence:docs[0].id})).error),'EVC role cannot decide');
    const decisionKey=randomUUID();const before=await snapshot(clients.regional,id);
    check(await transition(clients.regional,id,'approve','Synthetic evidence accepted for demonstration only.',{evidence:docs[0].id},decisionKey));
    check(await transition(clients.regional,id,'approve','Synthetic evidence accepted for demonstration only.',{evidence:docs[0].id},decisionKey,before.version));
    const events=check(await clients.institution.from('application_events').select('*').eq('application_id',id));
    ok(events.filter(e=>e.action==='approve').length===1,'Exactly one decision audit event');
    ok(check(await clients.institution.from('obligations').select('*').eq('application_id',id)).filter(o=>o.kind==='renewal').length===1,'Exactly one renewal obligation');
    const downloaded=check(await clients.institution.storage.from('application-docs').download(docs[0].path));ok(createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex')===docs[0].sha256,'Uploaded bytes match their SHA-256');
    ok(Boolean((await clients.other.storage.from('application-docs').download(docs[0].path)).error),'Cross-tenant private download denied');
    const anon=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
    ok(Boolean((await anon.storage.from('application-docs').download(docs[0].path)).error),'Anonymous private download denied');
    ok(Boolean((await clients.institution.from('profiles').update({email:'forged@example.test'}).eq('id',accounts.institution.id)).error),'Protected email update denied');
    ok(Boolean((await clients.institution.from('applications').update({status:'approved'}).eq('id',id)).error),'Direct status changes denied');
    const report={phase:'integration',passed:checks,actualSupabaseAuth:true,roles:Object.keys(clients).length,concurrency:'one winner',auditEvents:events.length,privateStorage:'upload and authorized download verified',malwareScan:'Trusted synthetic fixture only; production scanner NOT validated'};
    writeFileSync('docs/integration-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  }
}finally{await Promise.all(Object.values(clients).map(c=>c.auth.signOut({scope:'local'})));}
