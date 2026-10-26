import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();});

test('a seeded case names its holder, grant and missing assignment event',async({page})=>{
  await page.goto('/#case/demo-app-0');
  const disclosure=page.locator('.dossier-route-shell details.custody-explain');
  await expect(disclosure).toBeVisible();
  await expect(disclosure.locator('summary')).toContainText('Demo scrutiny holds this case');
  await disclosure.locator('summary').click();
  const panel=disclosure.locator('.due-explain-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Custody derivation');
  await expect(panel).toContainText('Current holder');
  await expect(panel).toContainText('Scrutiny officer · South');
  await expect(panel).toContainText('Active scrutiny officer grant for South.');
  await expect(panel).toContainText('Temporary South scrutiny coverage.');
  await expect(panel).toContainText('No assignment event is included in this history; the holder is recorded on the case.');
  await expect(panel).toContainText('Opening this explanation changes nothing.');
});

test('a live allocation becomes the recorded handoff for the case',async({page})=>{
  await page.goto('/#operations');
  await page.getByLabel('Operational application').selectOption('demo-app-4');
  await page.getByLabel('Operational reason',{exact:true}).fill('Allocated in a live demo to cover the South scrutiny queue.');
  await page.getByRole('button',{name:'Load eligible reviewers'}).click();
  await page.getByLabel('Eligible reviewer').selectOption('demo-scrutiny');
  await page.getByRole('button',{name:'Allocate scrutiny officer'}).click();
  await expect(page.getByText('Operational action recorded with its source and reason.')).toBeVisible();
  await page.goto('/#case/demo-app-4');
  const disclosure=page.locator('.dossier-route-shell details.custody-explain');
  await expect(disclosure.locator('summary')).toContainText('Demo scrutiny holds this case');
  await disclosure.locator('summary').click();
  const panel=disclosure.locator('.due-explain-panel');
  await expect(panel).toContainText('Allocated to this officer');
  await expect(panel).toContainText('by Demo national');
  await expect(panel).toContainText('Allocated in a live demo to cover the South scrutiny queue.');
  await expect(panel).toContainText('Active scrutiny officer grant for South.');
});
