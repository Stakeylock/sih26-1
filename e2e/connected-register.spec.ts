import {test,expect} from '@playwright/test';
import {localClients,localSql,check} from '../scripts/local-test-support.mjs';
test('connected register pages and opens a case outside the initial workspace window',async({page})=>{
 const {clients,accounts}=await localClients(),user=check(await clients.institution.auth.getUser()).user;
 const prefix='DEMO-PAGING-'+Date.now()+'-',title='Synthetic pagination regression '+Date.now();
 localSql(`insert into public.applications(ref_no,title,institution_id,owner_id,app_type,status,region,template_id,template_version,template_snapshot) select '${prefix}'||n,'${title}',a.institution_id,a.owner_id,a.app_type,'draft',a.region,a.template_id,a.template_version,a.template_snapshot from (select * from public.applications where owner_id='${user.id}' order by created_at desc limit 1)a cross join generate_series(1,130)n;`);
 try{
  const initial=check(await clients.institution.rpc('fp_application_page',{_scope:'all',_query:'',_region:null,_status:null,_cursor:null,_limit:100})),fixtures=check(await clients.institution.rpc('fp_application_page',{_scope:'all',_query:prefix,_region:null,_status:null,_cursor:null,_limit:100}));
  const outside=fixtures.items.find(row=>!initial.items.some(item=>item.id===row.id));expect(outside).toBeTruthy();
  await page.goto('/#applications');await page.getByRole('textbox',{name:'Email address'}).fill(accounts.institution.email);await page.getByLabel('Password',{exact:true}).fill(accounts.institution.password);await page.getByRole('button',{name:'Sign in securely'}).click();
  await expect(page.getByRole('heading',{name:'Applications',exact:true})).toBeVisible();await page.getByRole('button',{name:/^All /}).click();await page.getByRole('textbox',{name:'Search applications'}).fill(prefix);await expect(page.locator('.applications-table tbody tr')).toHaveCount(25);const first=await page.locator('.applications-table tbody tr').first().innerText();await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.locator('.applications-table tbody tr')).toHaveCount(25);expect(await page.locator('.applications-table tbody tr').first().innerText()).not.toBe(first);
  await page.getByRole('textbox',{name:'Search applications'}).fill(outside.ref_no);await expect(page.locator('.applications-table tbody tr')).toHaveCount(1);await page.getByRole('button',{name:outside.ref_no,exact:true}).click();await expect(page.getByText(title,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Application unavailable',exact:true})).toHaveCount(0);
 }finally{localSql(`delete from public.applications a where a.ref_no like '${prefix}%' and a.owner_id='${user.id}' and a.is_demo and not exists(select 1 from public.application_events e where e.application_id=a.id);`);}
});
