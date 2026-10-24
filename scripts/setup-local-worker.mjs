import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const output=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir','local','--output','json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}),status=JSON.parse(output.slice(output.indexOf('{'),output.lastIndexOf('}')+1)),url=status.API_URL??status.api_url,key=status.SERVICE_ROLE_KEY??status.service_role_key;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname)||!key||!key.startsWith('eyJ')||JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='service_role')throw new Error('Verified local server-only worker configuration unavailable.');
writeFileSync('.env.server.local',`SUPABASE_URL=${url}\nSUPABASE_SERVICE_ROLE_KEY=${key}\nFP_SMTP_HOST=127.0.0.1\nFP_SMTP_PORT=1025\n`,{mode:0o600});console.log(JSON.stringify({workerEnvironment:'.env.server.local',target:'loopback only',credentialPrinted:false}));
