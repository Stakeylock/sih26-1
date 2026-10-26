import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();});

test('an approved case keeps its continuing obligation visible',async({page})=>{
  await page.goto('/#case/demo-app-5');
  const contract=page.locator('section.movement-contract');
  await expect(contract.getByRole('heading',{name:'Decision recorded; condition open'})).toBeVisible();
  await expect(contract).toContainText('Continuing obligation remains open');
  await expect(contract).toContainText('Synthetic post-approval faculty condition');
  await expect(contract).toContainText(/Owner:\s*Institution/);
  await expect(contract).toContainText('Faculty List');
  await expect(contract).toContainText('Recorded continuing obligation');
  await expect(page.locator('.dossier-meta-line')).toContainText('Next authority: Institution');
  await expect(page.locator('.dossier-route-note')).toContainText('Current handoff: Outcome');
  await expect(page.locator('.dossier-route-note')).toContainText('Institution');
  await expect(page.locator('.readiness-status.pending')).toHaveText('Obligation open');
  await expect(page.locator('.dossier-viewing')).toContainText('A continuing obligation remains open.');
  await expect(page.locator('.dossier-action-card')).toContainText('A continuing obligation remains open.');
});

test('a closed case without an open condition stays closed',async({page})=>{
  await page.goto('/#case/demo-app-8');
  const contract=page.locator('section.movement-contract');
  await expect(contract.getByRole('heading',{name:'Dossier closed'})).toBeVisible();
  await expect(page.locator('.readiness-status.closed')).toHaveText('Record closed');
  await expect(contract).not.toContainText('Continuing obligation remains open');
});

test('the closed-case queue names the continuing owner and action',async({page})=>{
  await page.goto('/#overview');
  await page.locator('.scope-selector').getByRole('button',{name:'Closed',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Continuing conditions'})).toBeVisible();
  const card=page.locator('.dispatch-case').filter({hasText:'DEMO-2026-1006'});
  await expect(card).toContainText('Obligation open');
  await expect(card).toContainText('Institution');
  await expect(card).toContainText('Submit evidence for the continuing decision condition');
  await expect(card).toContainText(/Obligation due in \d+ day/);
  await expect(card.getByRole('button',{name:'Open DEMO-2026-1006'})).toBeVisible();
});
