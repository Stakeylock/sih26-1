// Trusted, local-only in-app outbox processor. Never import this into browser code.
import {createClient} from '@supabase/supabase-js';
import {existsSync} from 'node:fs';
const envFile=process.env.FP_DEADLINE_ENV??'.env.server.local';
if(existsSync(envFile))process.loadEnvFile(envFile);
const url=process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Set the local Supabase URL and server-only service role credential in the worker environment.');
if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('This processor is restricted to the local demonstration stack.');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await client.rpc('fp_process_deadline_reminders',{_limit:50});
if(error)throw new Error('Local reminder processing failed. Check the database migrations and server credential.');
console.log(JSON.stringify({processed:data,channel:'in_app',environment:'local_demo'}));
