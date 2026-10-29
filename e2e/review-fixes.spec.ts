import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();});
test('an explicit advisory action creates a real stored signal and audit event',async({page})=>{
 await page.goto('/#analysis');await page.getByRole('button',{name:'Risk & notice',exact:true}).click();
 await page.getByRole('button',{name:'Record advisory risk signal'}).click();
 await expect(page.getByText(/Signal recorded · risk_score/)).toBeVisible();
 await page.reload();
 await page.goto('/#audit');await expect(page.locator('main')).toContainText('Advisory risk score');
});
test('Due Work follows EVC rescheduling and removes the cancelled window after reload',async({page})=>{
 await page.getByLabel('Demo role').selectOption('evc_coordinator');await page.goto('/#visits/demo-app-2');
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Reschedule the visit',exact:true})});
 const start=new Date(Date.now()+14*86400000),end=new Date(start.getTime()+3600000);
 const local=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
 await form.getByLabel('New start',{exact:true}).fill(local(start));await form.getByLabel('New end',{exact:true}).fill(local(end));
 await form.getByLabel('Reason',{exact:true}).fill('Synthetic reschedule to check the current Due Work projection.');
 await form.getByRole('button',{name:'Reschedule visit',exact:true}).click();await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('rescheduled');
 await page.goto('/#due-work');await page.getByLabel('Search due work').fill('DEMO-2026-1003');await page.getByRole('combobox',{name:/^Deadline type/}).selectOption('Expert visit');
 const rows=page.getByRole('table').locator('tbody tr');await expect(rows).toHaveCount(1);await expect(rows).toContainText('schedule v2');
 const expected=await page.evaluate(stamp=>new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(stamp)),end.toISOString());await expect(rows).toContainText(expected);
 await page.reload();await page.getByLabel('Search due work').fill('DEMO-2026-1003');await page.getByRole('combobox',{name:/^Deadline type/}).selectOption('Expert visit');await expect(rows).toContainText(expected);
 await page.goto('/#visits/demo-app-2');const cancel=page.locator('form').filter({has:page.getByRole('heading',{name:'Cancel the visit',exact:true})});await cancel.getByLabel('Reason',{exact:true}).fill('Synthetic cancellation to remove the current due inspection window.');await cancel.getByRole('button',{name:'Cancel EVC visit',exact:true}).click();await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('cancelled');
 await page.goto('/#due-work');await page.getByLabel('Search due work').fill('DEMO-2026-1003');await expect(page.getByRole('table').getByText('Expert visit',{exact:true})).toHaveCount(0);
});
test('the shared reader cancels stale source work and blocks findings for an unrelated local image',async({page})=>{
 test.setTimeout(90000);await page.goto('/#document-review');
 await page.route('**/samples/demo-doc-demo-app-0-0.pdf',async route=>{await new Promise(r=>setTimeout(r,1000));await route.continue().catch(()=>{});});
 await page.getByRole('button',{name:'Read watermarked sample',exact:true}).click();
 await page.getByLabel('Source document',{exact:true}).selectOption('demo-doc-demo-app-0-1');
 await page.getByRole('button',{name:'Read watermarked sample',exact:true}).click();await expect(page.getByText('Source: fire_safety_certificate.pdf',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Document number',{exact:true})).toHaveValue('FIRE-DEMO-001');await expect(page.getByLabel('Expiry date',{exact:true})).toHaveValue('');await expect(page.getByText('Source: affidavit.pdf',{exact:true})).toHaveCount(0);
 const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1400;c.height=260;const x=c.getContext('2d')!;x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='48px Arial';x.fillText('Issuer: Unrelated synthetic example',30,80);x.fillText('Expiry date: 2028-10-29',30,180);return Array.from(new Uint8Array(await(await new Promise<Blob>(r=>c.toBlob(b=>r(b!)))).arrayBuffer()));});
 await page.getByLabel('Choose a local document to read').setInputFiles({name:'unrelated.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
 await expect(page.getByLabel('Expiry date',{exact:true})).toHaveValue('2028-10-29',{timeout:60000});await expect(page.getByText(/read bytes do not match/)).toBeVisible();await expect(page.getByRole('button',{name:'Record reviewer finding',exact:true})).toBeDisabled();
});
