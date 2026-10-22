import {randomBytes,randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const file='.env.integration.local';
let accounts;
if(existsSync(file))accounts=JSON.parse(readFileSync(file,'utf8').split('FP_TEST_ACCOUNTS=')[1]);
else{accounts=Object.fromEntries(['institution','other','scrutiny','second','west','evc','regional','admin'].map(name=>[name,{id:randomUUID(),email:`fp-integration-${name}@flowpilot.example.test`,password:randomBytes(28).toString('base64url')} ]));writeFileSync(file,'FP_TEST_ACCOUNTS='+JSON.stringify(accounts)+'\n',{mode:0o600});}
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
let sql='begin;\n';
for(const [name,a] of Object.entries(accounts)){
  sql+=`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change,email_change_token_new) values(${q(a.id)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${q(a.email)},extensions.crypt(${q(a.password)},extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}',${q(JSON.stringify({full_name:`Demo ${name}`,role:'national_admin'}))}::jsonb,'','','','') on conflict(id) do nothing;\n`;
  sql+=`insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) select gen_random_uuid(),${q(a.id)},${q(a.id)},${q(JSON.stringify({sub:a.id,email:a.email,email_verified:true}))}::jsonb,'email',now(),now(),now() where not exists(select 1 from auth.identities where user_id=${q(a.id)} and provider='email');\n`;
  if(!['institution','other'].includes(name)){
    const role={scrutiny:'scrutiny_officer',second:'scrutiny_officer',west:'scrutiny_officer',evc:'evc_coordinator',regional:'regional_officer',admin:'national_admin'}[name];
    sql+=`delete from public.user_roles where user_id=${q(a.id)} and role='institution'; insert into public.user_roles(user_id,role,region) values(${q(a.id)},${q(role)},${name==='admin'?'null':q(name==='west'?'West':'South')}) on conflict(user_id,role) do nothing;\n`;
  }
}
sql+='commit;';process.stdout.write(sql);
