import {createServer} from 'node:http';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {analyzeCase} from './graph.mjs';
import {AutomationStore} from './store.mjs';
const json=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
function equal(a,b){if(!a||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function createAutomationServer(config){
  if(!config.allowDemo&&(!config.url||!config.key))throw new Error('Supabase project URL and publishable key required');
  if(config.token&&config.token.length<32)throw new Error('Use a random automation token of at least 32 characters');
  const store=config.store??new AutomationStore(config.storePath??'.runtime/automation.sqlite');
  const limit=new Map();let delivering=false;
  async function deliver(){if(delivering||!config.webhook||!config.token)return;delivering=true;try{for(const job of store.pending()){store.attempt(job.id);try{const response=await fetch(config.webhook,{method:'POST',headers:{'Content-Type':'application/json','X-Clauseway-Automation':config.token},body:job.event,signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)store.retry(job.id);}catch{store.retry(job.id);}}}finally{delivering=false;}}
  async function actor(req){const header=req.headers.authorization;if(!header?.startsWith('Bearer '))throw Object.assign(new Error('Authentication required'),{status:401});const token=header.slice(7);const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});const {data:{user},error}=await client.auth.getUser(token);if(error||!user||user.is_anonymous)throw Object.assign(new Error('Invalid session'),{status:401});return {client,id:user.id};}
  async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)throw Object.assign(new Error('Request too large'),{status:413});}try{return JSON.parse(raw);}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}}
  const server=createServer(async(req,res)=>{try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(req.method==='GET'&&path==='/api/automation/health')return json(res,200,{langgraph:'available',n8n:config.webhook&&config.token?'configured':'disabled',mode:config.url&&config.key?(config.allowDemo?'authenticated-and-isolated-demo':'authenticated'):'demo-only',projectOrigin:config.url?new URL(config.url).origin:null});
    if(req.method==='POST'&&path==='/api/advisories/demo'&&config.allowDemo){const input=await body(req);if(!String(input.application?.id).startsWith('demo-'))return json(res,400,{error:'Synthetic cases only'});const report=await analyzeCase(input);const id=randomUUID();const cached=store.get('isolated-demo',input.application.id,input.application.version);if(cached)return json(res,200,{...JSON.parse(cached.report),automation:{id:cached.id,state:cached.state}});const event={id,schema:1,kind:'demo.case.advisory',demo:true,reference:input.application.ref_no,requires_attention:report.warnings.length>0,due_at:null,created_at:new Date().toISOString()};const queued=store.enqueue({id,actor:'isolated-demo',caseId:input.application.id,version:input.application.version,report,event});void deliver();return json(res,200,{...report,automation:{id:queued.id,state:config.webhook?'queued':'disabled'}});}
    if(path.startsWith('/internal/')){
      if(!equal(req.headers['X-Clauseway-Automation'],config.token))return json(res,401,{error:'Unauthorized automation callback'});
      if(req.method==='GET'&&path==='/internal/due')return json(res,200,{items:store.due()});
      if(req.method==='POST'&&['/internal/followups','/internal/reminders'].includes(path)){const value=z.object({id:z.string().uuid()}).strict().parse(await body(req));return json(res,200,path==='/internal/followups'?store.acknowledge(value.id):store.remind(value.id));}
      return json(res,404,{error:'Unknown automation route'});
    }
    if(req.method==='POST'&&path==='/api/advisories'){
      const current=await actor(req);const {caseId}=z.object({caseId:z.string().uuid()}).strict().parse(await body(req));
      const {data:application,error}=await current.client.from('applications').select('*').eq('id',caseId).single();
      if(error||!application)return json(res,404,{error:'Case unavailable'});
      const cached=store.get(current.id,caseId,application.version);if(cached)return json(res,200,{...JSON.parse(cached.report),automation:{id:cached.id,state:cached.state}});
      const now=Date.now();const requests=(limit.get(current.id)??[]).filter(t=>t>now-60000);if(requests.length>=5)return json(res,429,{error:'Please wait before requesting another advisory.'});limit.set(current.id,[...requests,now]);
      const {data:documents,error:docsError}=await current.client.from('application_documents').select('doc_type,scan_status').eq('application_id',caseId);if(docsError)throw new Error('Evidence metadata unavailable');
      const report=await analyzeCase({application,documents});const id=randomUUID();
      const event={id,schema:1,kind:'demo.case.advisory',demo:true,reference:application.ref_no,requires_attention:report.warnings.length>0,due_at:application.sla_due_at,created_at:new Date().toISOString()};
      const queued=store.enqueue({id,actor:current.id,caseId,version:application.version,report,event});void deliver();return json(res,200,{...report,automation:{id:queued.id,state:config.webhook?'queued':'disabled'}});
    }
    if(req.method==='GET'&&path.startsWith('/api/automation/jobs/')){const current=await actor(req);const id=z.string().uuid().parse(path.split('/').at(-1));const {data,error}=await current.client.from('applications').select('id').eq('id',id).single();if(error||!data)return json(res,404,{error:'Case unavailable'});return json(res,200,{items:store.list(current.id,id)});}
    json(res,404,{error:'Route not found'});
  }catch(e){const validation=e instanceof z.ZodError;json(res,validation?400:e.status??500,{error:validation?'Invalid request payload':e.status?e.message:'The advisory service could not complete this request.'});}});
  const timer=setInterval(()=>{void deliver();if(limit.size>1000)limit.clear();},10000);timer.unref();server.on('close',()=>{clearInterval(timer);store.close();});return {server,store,deliver};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const url=process.env.VITE_SUPABASE_URL;const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;const webhook=process.env.N8N_WEBHOOK_URL;const allowDemo=process.env.AUTOMATION_ALLOW_DEMO==='true'||process.env.VITE_APP_MODE==='demo';
  if(webhook){const parsed=new URL(webhook);if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('Use HTTPS for remote n8n webhooks');}
  const {server}=createAutomationServer({url,key,webhook,token:process.env.N8N_AUTOMATION_TOKEN,storePath:process.env.AUTOMATION_STORE_PATH,allowDemo});server.listen(Number(process.env.AUTOMATION_PORT??8787),'127.0.0.1',()=>console.log('Clauseway advisory and automation service listening on 127.0.0.1:8787'));
}
