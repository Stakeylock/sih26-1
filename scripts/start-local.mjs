import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {mkdirSync,openSync,closeSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {ensureLocalNetwork,localNetwork} from './loopback-docker.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const runtime=resolve('.runtime');mkdirSync(runtime,{recursive:true});
function runNode(args,name){const output=openSync(resolve(runtime,name+'.private.log'),'a');const result=spawnSync(process.execPath,args,{cwd:root,stdio:['ignore',output,output],windowsHide:true});closeSync(output);if(result.status!==0)throw new Error(`${name} failed. See .runtime/${name}.private.log.`);}
async function healthy(url,expected){try{const response=await fetch(url,{signal:AbortSignal.timeout(1500)});return response.ok&&(await response.text()).includes(expected);}catch{return false;}}
async function start(name,args,url,expected,extraEnv={}){if(await healthy(url,expected))return;const out=openSync(resolve(runtime,name+'.log'),'a'),err=openSync(resolve(runtime,name+'-error.log'),'a');const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,detached:true,env:{...process.env,...extraEnv},stdio:['ignore',out,err]});child.unref();closeSync(out);closeSync(err);for(let i=0;i<40;i++){if(await healthy(url,expected))return;await delay(250);}throw new Error(`${name} did not become ready. Check .runtime/${name}-error.log; no unrelated process was stopped.`);}
try{
  execFileSync('docker',['info','--format','{{.ServerVersion}}'],{stdio:'ignore'});
  ensureLocalNetwork();
  runNode(['node_modules/supabase/dist/supabase.js','start','--workdir','local','--network-id',localNetwork,'--exclude','realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'],'supabase-start');
  runNode(['scripts/local-setup.mjs'],'local-setup');
  if(existsSync('.env.automation.local')){const config=readFileSync('.env.automation.local','utf8');if(/^N8N_WEBHOOK_URL=.+/m.test(config))throw new Error('n8n must remain disabled until its dependency gate is cleared.');}
  const envArgs=['--env-file=.env.connected.local',...(existsSync('.env.automation.local')?['--env-file=.env.automation.local']:[])];
  await start('backend',[...envArgs,'automation/server.mjs'],'http://127.0.0.1:8787/api/automation/health','127.0.0.1:55321',{AUTOMATION_ALLOW_DEMO:'true'});
  await start('frontend-connected',['node_modules/vite/bin/vite.js','--mode','connected','--host','127.0.0.1','--port','5173'],'http://127.0.0.1:5173/','FlowPilot');
  await start('frontend-demo',['node_modules/vite/bin/vite.js','--mode','demo','--host','127.0.0.1','--port','5174'],'http://127.0.0.1:5174/','FlowPilot');
  const status={connectedFrontend:'http://127.0.0.1:5173/#overview',demoFrontend:'http://127.0.0.1:5174/',backend:'http://127.0.0.1:8787/api/automation/health',supabase:'http://127.0.0.1:55321',scope:'loopback only',n8n:'disabled'};
  writeFileSync(resolve(runtime,'status.json'),JSON.stringify(status,null,2)+'\n');console.log(JSON.stringify(status,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
