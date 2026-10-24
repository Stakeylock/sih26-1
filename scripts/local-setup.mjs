import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {bindLocalStackToLoopback} from './loopback-docker.mjs';
import {restrictPublishedPorts} from './local-port-binding.mjs';
import {setTimeout as delay} from 'node:timers/promises';
const runtime=resolve('.runtime');mkdirSync(runtime,{recursive:true});
const container='supabase_db_clauseway-sih26-local';
function sql(query){try{return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','--no-psqlrc','--set','ON_ERROR_STOP=on','-At'],{input:query,encoding:'utf8',maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']}).trim();}catch(error){writeFileSync(resolve(runtime,'setup-error.private.log'),error.stderr??'Local database setup failed.');throw new Error('Local database setup failed; private diagnostics are in .runtime/setup-error.private.log.');}}
try{
  const inspected=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
  if(inspected.Config.Labels?.['com.supabase.cli.project']!=='clauseway-sih26-local')throw new Error('Refusing a database outside the isolated Clauseway local project.');
  await restrictPublishedPorts();
  let dbReady=false;for(let i=0;i<40;i++){try{dbReady=sql('select true;')==='t';if(dbReady)break;}catch{}await delay(250);}if(!dbReady)throw new Error('Local PostgreSQL is still starting.');
  if(sql(`select to_regclass('public.profiles') is not null;`)!=='t')sql(readFileSync('supabase/reference/baseline.sql','utf8'));
  sql(`create schema if not exists fp_bootstrap; revoke all on schema fp_bootstrap from public,anon,authenticated; create table if not exists fp_bootstrap.migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now());`);
  let applied=0;
  for(const name of readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort()){
    const source=readFileSync('supabase/migrations/'+name,'utf8');const hash=createHash('sha256').update(source).digest('hex');
    const previous=sql(`select sha256 from fp_bootstrap.migrations where name='${name}';`);
    if(previous){if(previous!==hash)throw new Error('An applied migration changed: '+name);continue;}
    const body=source.replace(/^\s*begin\s*;/i,'').replace(/commit\s*;\s*$/i,'');
    sql(`begin;${body}\ninsert into fp_bootstrap.migrations(name,sha256) values('${name}','${hash}');commit;`);applied++;
  }
  // This creates only explicit synthetic test identities, never personal accounts.
  const identities=execFileSync(process.execPath,['scripts/prepare-integration.mjs'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});sql("set log_statement='none';\n"+identities);
  let stdout;for(let i=0;i<20;i++){try{stdout=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir','local','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});break;}catch{await delay(500);}}if(!stdout)throw new Error('Local Supabase health checks are still starting. Retry local:setup.');
  const status=JSON.parse(stdout.slice(stdout.indexOf('{'),stdout.lastIndexOf('}')+1));
  const url=status.API_URL??status.api_url;const key=status.PUBLISHABLE_KEY??status.ANON_KEY??status.anon_key;
  if(!url||!key||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Invalid local Supabase configuration.');
  const allowedKey=key.startsWith('sb_publishable_')||(key.startsWith('eyJ')&&JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon');
  if(!allowedKey)throw new Error('Only a publishable/anon key may enter local frontend configuration.');
  writeFileSync('.env.connected.local',`VITE_APP_MODE=connected\nVITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\nAUTOMATION_STORE_PATH=.runtime/automation.sqlite\n`,{mode:0o600});
  await bindLocalStackToLoopback();
  let apiReady=false;for(let i=0;i<40;i++){try{apiReady=(await Promise.all(['/auth/v1/health','/rest/v1/','/storage/v1/status'].map(path=>fetch(url+path,{headers:{apikey:key},signal:AbortSignal.timeout(1000)})))).every(response=>response.ok);if(apiReady)break;}catch{}await delay(250);}if(!apiReady)throw new Error('Local authentication, data, or storage service is not ready.');
  console.log(JSON.stringify({localBackend:url,newMigrations:applied,syntheticAccounts:8,frontendConfig:'.env.connected.local',hostedConfiguration:'preserved',serviceKeysPrinted:false}));
}catch(error){console.error(error.message);process.exitCode=1;}
