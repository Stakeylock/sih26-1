import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();});

test('a deadline opens its recorded target, calendar rule and source',async({page})=>{
  await page.goto('/#case/demo-app-0');
  const disclosure=page.locator('.dossier-header details.due-explain');
  await expect(disclosure).toBeVisible();
  await disclosure.locator('summary').click();
  const panel=disclosure.locator('.due-explain-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Deadline derivation');
  await expect(panel).toContainText('Recorded target');
  await expect(panel).toContainText('Saturday and Sunday are excluded');
  await expect(panel).toContainText('no holiday dates');
  await expect(panel).toContainText('Recorded target on the case workflow; no adopted deadline notice applies.');
  await expect(panel).toContainText('Opening this explanation changes nothing.');
});

test('a queued delivery renders the stored notification and sends nothing',async({page})=>{
  await page.goto('/#operations');
  await expect(page.getByRole('heading',{name:'Case operations',exact:true})).toBeVisible();
  await page.getByLabel('Operational reason',{exact:true}).fill('Synthetic source-bound preview for a deliberate operations demonstration.');
  await page.getByRole('button',{name:'Queue source-bound update'}).click();
  const table=page.getByRole('table',{name:'Recorded delivery lifecycle for selected case'});
  const row=table.locator('tbody tr').first();
  await expect(row).toContainText('pending');
  await row.locator('summary').click();
  await expect(row.locator('.delivery-render')).toBeVisible();
  await expect(row).toContainText('Demo case update');
  await expect(row).toContainText('DEMO-2026-1001');
  await expect(row).toContainText('Synthetic case DEMO-2026-1001 is');
  await expect(row).toContainText('Opening this preview sends nothing.');
  await expect(row).toContainText('Recipient record');
});

test('the planner suggests an eligible panel and applies it only when chosen',async({page})=>{
  await page.getByLabel('Demo role').selectOption('evc_coordinator');
  await page.goto('/#visits/demo-app-2');
  await expect(page.getByLabel('Inspection application')).toHaveValue('demo-app-2');
  const suggestion=page.getByRole('complementary',{name:'Recommended panel'});
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toContainText('Suggested only');
  await expect(suggestion).toContainText('Demo expert A');
  await expect(suggestion).toContainText('Demo expert B');
  await expect(suggestion).toContainText('Demo expert C');
  const first=page.getByRole('checkbox',{name:/Demo expert A/});
  await expect(first).not.toBeChecked();
  await suggestion.getByRole('button',{name:'Use recommended panel'}).click();
  await expect(first).toBeChecked();
  await expect(page.getByRole('checkbox',{name:/Demo expert B/})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:/Demo expert C/})).toBeChecked();
  await page.getByLabel('Planning reason',{exact:true}).fill('Recorded declarations and the suggested panel checked for this visit.');
  await page.getByRole('button',{name:'Revise and reserve panel'}).click();
  await expect(page.getByRole('complementary',{name:'Reserved inspection panel'})).toContainText('tentative');
});
