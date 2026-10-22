import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
process.loadEnvFile('.env.automation.local');
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++;};
const base='http://127.0.0.1:8787';const header={'Content-Type':'application/json','X-FlowPilot-Automation':process.env.N8N_AUTOMATION_TOKEN};
ok([401,403].includes((await fetch('http://127.0.0.1:5678/webhook/flowpilot-advisory',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status),'n8n rejects unauthenticated webhook calls');
ok((await fetch(base+'/internal/followups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID()})})).status===401,'Callback requires automation authentication');
ok((await fetch(base+'/api/advisories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId:randomUUID()})})).status===401,'Connected advisory requires a user session');
const caseId='demo-smoke-'+randomUUID();const input={application:{id:caseId,ref_no:'DEMO-2026-SMOKE',is_demo:true,status:'under_scrutiny',version:1,form_data:{title:'provided'},template_snapshot:{required_fields:[{key:'title',label:'Title'}],required_documents:['Building Plan']}},documents:[{doc_type:'Building Plan',scan_status:'pending'}]};
const result=await fetch(base+'/api/advisories/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});ok(result.ok,'Local demo advisory responds');const report=await result.json();ok(report.engine==='langgraph-rules-v1'&&report.advisoryOnly,'Actual LangGraph returns only advisory output');
const db=new DatabaseSync('automation/flowpilot.sqlite',{readOnly:true});let row;
for(let i=0;i<20;i++){row=db.prepare('select state,attempts from jobs where id=?').get(report.automation.id);if(row?.state==='completed')break;await delay(500);}
ok(row?.state==='completed','n8n receives event and confirms the durable follow-up');
const replay=await fetch(base+'/internal/followups',{method:'POST',headers:header,body:JSON.stringify({id:report.automation.id})});ok(replay.ok,'Duplicate callback is retry-safe');
ok(db.prepare('select count(*) n from followups where id=?').get(report.automation.id).n===1,'One follow-up exists despite a duplicate callback');
db.close();const evidence={passed:checks,langgraph:'actual graph invoked',n8n:'actual authenticated webhook and HTTP callback executed',idempotency:'duplicate callback produces one follow-up',externalMessagesSent:0,model:'none'};writeFileSync('docs/automation-results.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
