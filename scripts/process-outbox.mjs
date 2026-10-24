import {createClient} from '@supabase/supabase-js';
import {existsSync} from 'node:fs';
import {sendLocalMail} from './local-mail-transport.mjs';
const file=process.env.FP_WORKER_ENV??'.env.server.local';if(existsSync(file))process.loadEnvFile(file);
const url=process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('A local stack and server-only worker credential are required.');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),{data,error}=await client.rpc('fp_outbox_claim',{_limit:25});if(error)throw new Error('Local outbox claim failed; check migrations and worker configuration.');
const outcomes={};for(const row of data??[]){let outcome='in_app_delivered',detail='Committed in-app notification.';
 if(row.channel==='smtp_local')try{await sendLocalMail({host:process.env.FP_SMTP_HOST??'127.0.0.1',port:Number(process.env.FP_SMTP_PORT??1025),id:row.id,recipientId:row.recipient_id,title:row.title,body:row.body});outcome='smtp_accepted';detail='Local test sink accepted the message; mailbox delivery is not implied.';}catch(error){outcome=error.ambiguous?'ambiguous':'retry_wait';detail=error.ambiguous?'Connection lost after message transfer; reconcile before retry.':'Local sink unavailable or rejected the envelope; retry is bounded.';}
 const finished=await client.rpc('fp_outbox_finish',{_id:row.id,_token:row.lease_token,_outcome:outcome,_detail:detail});if(finished.error)throw new Error('Local worker outcome could not be committed; reconcile the lease before retry.');outcomes[finished.data]=(outcomes[finished.data]??0)+1;
}console.log(JSON.stringify({environment:'local_demo',outcomes}));
