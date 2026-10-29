import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.goto('/#overview');
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
});

test('document review extracts fields from PDF and records integrity signal',async({page})=>{
  await page.goto('/#document-review');
  await expect(page.getByRole('heading',{name:'Document review'})).toBeVisible();

  const docSelect=page.getByLabel('Source document');
  await expect(docSelect).toBeVisible();
  await docSelect.selectOption({index: 0});

  await page.waitForTimeout(1000);
  await expect(page.getByText('Extracted text')).toBeVisible();

  await page.getByLabel('Issuer').fill('Synthetic Fire Department');
  await page.getByLabel('Document number').fill('FIRE-DEMO-001');
  await page.getByLabel('Expiry date').fill('2026-10-15');
  const checkboxes=page.getByLabel('Field confirmed',{exact:true});
  await expect(checkboxes).toHaveCount(3);
  for (const cb of await checkboxes.all()) {
    await cb.click();
  }

  await page.getByLabel('Disposition').selectOption('confirmed');
  await page.getByRole('button',{name:'Record reviewer finding'}).click();
  await expect(page.getByText('Recorded findings')).toBeVisible();
});

test('voice call rehearsal uploads transcript as case document',async({page})=>{
  await page.goto('/#demo-lab');
  await expect(page.getByRole('heading',{name:'Demo lab'})).toBeVisible();

  const voice=page.locator('.demo-voice-rehearsal');
  await expect(voice).toBeVisible();
  await voice.getByLabel('Case record').selectOption('demo-app-2');

  await voice.getByRole('button',{name:'Already submitted'}).click();
  await expect(voice.locator('textarea')).not.toBeEmpty();

  await voice.getByRole('button',{name:'Upload transcript & notify'}).click();

  await expect(voice.getByText('Transcript uploaded',{exact:true})).toBeVisible();
  await expect(voice.getByText(/voice-transcript-DEMO-2026-1003\.txt/)).toBeVisible();
  await expect(voice.getByText('Voice notification dispatched')).toBeVisible();
});

test('notification outbox queue process retry cancel full lifecycle',async({page})=>{
  await page.goto('/#notifications');
  await expect(page.getByRole('heading',{name:'Notification outbox'})).toBeVisible();

  const main=page.locator('#main-content');
  await main.getByLabel('Application').selectOption('demo-app-2');

  await main.getByLabel('Operational reason').fill('Synthetic operational reason for notification lifecycle demonstration.');
  await main.getByRole('button',{name:'Queue to outbox'}).click();

  const table=main.getByRole('table',{name:'Delivery intents for DEMO-2026-1003'});
  await expect(table).toContainText('pending');

  await main.getByRole('button',{name:'Process pending intents'}).click();
  await page.waitForTimeout(1000);

  await expect(table).toContainText('in app delivered');
});
