import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();});
test('reads actual PDF fields and prepares a review without saving it',async({page})=>{
 await page.getByRole('combobox',{name:'Demo role'}).selectOption('scrutiny_officer');await expect(page.getByText('Kavya Rao',{exact:true}).first()).toBeVisible();await page.goto('/#case/demo-app-0');await page.getByRole('tab',{name:'Evidence',exact:true}).click();
 await page.getByRole('button',{name:'Open document reader',exact:true}).click();await page.getByRole('button',{name:'Read watermarked sample'}).click();await expect(page.getByText(/Source: affidavit.pdf/)).toBeVisible({timeout:30000});await expect(page.getByRole('table',{name:'Suggested document fields for human review'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Record validity review'})).toBeHidden();const use=page.getByRole('button',{name:'Use document reference in review'});await expect(use).toHaveCount(1);{await use.first().click();await expect(page.getByLabel('Document reference',{exact:true})).not.toHaveValue('');await expect(page.getByRole('button',{name:'Record validity review'})).toBeVisible();}
});
test('runs real OCR on an image and rejects a disguised non-image',async({page})=>{
 test.setTimeout(90000);await page.goto('/#case/demo-app-0');await page.getByRole('tab',{name:'Evidence',exact:true}).click();await page.getByRole('button',{name:'Open document reader',exact:true}).click();
 const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1500;c.height=400;const x=c.getContext('2d')!;x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='48px Arial';x.fillText('Issuer: Synthetic Review Office',30,80);x.fillText('Expiry date: 2027-10-29',30,180);return Array.from(new Uint8Array(await (await new Promise<Blob>(resolve=>c.toBlob(b=>resolve(b!)))).arrayBuffer()));});
 await page.getByLabel('Choose a local document to read').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(bytes)});await expect(page.getByRole('table',{name:'Suggested document fields for human review'})).toContainText('2027-10-29',{timeout:70000});await expect(page.getByText(/OCR reading confidence/).first()).toBeVisible();
 await page.getByLabel('Choose a local document to read').setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('not a real image')});await expect(page.getByRole('alert')).toContainText('file bytes');
});
test('filters due work and opens a linked case',async({page})=>{await page.goto('/#due-work');await page.getByLabel('Search due work').fill('DEMO-2026-1001');await expect(page.getByRole('table')).toContainText('DEMO-2026-1001');await page.getByRole('link',{name:'Open case'}).first().click();await expect(page.getByRole('heading',{name:'Cedar Technical Institute',exact:true})).toBeVisible();});

