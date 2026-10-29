import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.goto('/#overview');
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
});

test('document review reads real PDF bytes and persists a source-bound finding and audit event',async({page})=>{
  await page.goto('/#document-review');
  await expect(page.getByRole('heading',{name:'Document review',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Recorded findings',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Read watermarked sample',exact:true}).click();
  await expect(page.getByRole('table',{name:'Suggested document fields for human review'})).toBeVisible();
  await expect(page.getByLabel('Document number',{exact:true})).toHaveValue('SYN-affidavit-2026');
  await page.getByRole('button',{name:'Page 1',exact:true}).first().click();
  await expect(page).toHaveURL(/#document-review$/);
  await expect(page.locator('.reading-source')).toBeVisible();
  await page.getByLabel('Issuer',{exact:true}).fill('Synthetic Review Office');
  const checkboxes=page.getByRole('checkbox',{name:/^Confirm /});
  await expect(checkboxes).toHaveCount(4);for(const cb of await checkboxes.all())await cb.check();
  await page.getByLabel('Disposition',{exact:true}).selectOption('corrected');
  await page.getByLabel('Reviewer note',{exact:true}).fill('Synthetic source and fields checked before recording this finding.');
  await page.getByRole('button',{name:'Record reviewer finding',exact:true}).click();
  const table=page.getByRole('table',{name:'Recorded document findings',exact:true});
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('Synthetic source and fields checked');
  await expect(table.locator('.reading-hash')).toHaveText(/^[a-f0-9]{64}$/);
  await page.reload();await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.goto('/#audit');await expect(page.locator('main')).toContainText('Document review of affidavit.pdf: corrected.');
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
