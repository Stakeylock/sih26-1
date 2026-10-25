import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {workerConfig,workerTick} from './tasks.mjs';
const file=process.env.FP_WORKER_ENV??'.env.server.local';if(existsSync(file))process.loadEnvFile(file);
const config=workerConfig(process.env),client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
let stopping=false,lastTick=null,state='starting';process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
const server=createServer((req,res)=>{if(req.url!=='/health'){res.writeHead(404).end();return;}const fresh=lastTick&&Date.now()-Date.parse(lastTick)<90000;res.writeHead(fresh&&state==='running'?200:503,{'content-type':'application/json'});res.end(JSON.stringify({state,lastTick,target:config.target}));});server.listen(Number(process.env.WORKER_HEALTH_PORT??8791),process.env.WORKER_HEALTH_HOST??'127.0.0.1');
while(!stopping){try{const detail=await workerTick(client,config);state=Object.values(detail.tasks).every(task=>task.state==='pass')?'running':'degraded';lastTick=new Date().toISOString();console.log(JSON.stringify({event:'worker_tick',at:lastTick,...detail}));}catch{state='degraded';console.error(JSON.stringify({event:'worker_tick_failed',at:new Date().toISOString()}));}if(!stopping)await delay(Math.max(1000,Number(process.env.WORKER_POLL_MS??5000)));}
server.close();
