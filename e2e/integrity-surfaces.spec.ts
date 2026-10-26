import {test,expect} from '@playwright/test';

test('the landing proves the audit chains verify in this browser',async({page})=>{
  await page.goto('/');
  const strip=page.locator('.landing-integrity');
  await expect(strip).toHaveClass(/ok/);
  await expect(strip.getByRole('status')).toContainText('demo chains verified in this browser');
  await expect(strip.getByRole('status')).toContainText('hash links recomputed');
  await strip.getByRole('button',{name:'Re-check audit chains'}).click();
  await expect(strip.getByRole('status')).toContainText('demo chains verified in this browser');
});

test('the overview verifies priority chains and the full visible scope',async({page})=>{
  await page.goto('/#overview');
  await expect(page.getByRole('heading',{level:1,name:'Approval operations',exact:true})).toBeVisible();
  const card=page.getByRole('region',{name:'Chain verification'});
  await expect(card.getByRole('status')).toHaveText(/^\d+\/\d+$/);
  await expect(card).toContainText('priority cases');
  await card.getByRole('button',{name:/Verify all \d+/}).click();
  await expect(card.getByRole('status')).toHaveText(/^\d+\/\d+$/);
  await expect(card).toContainText('visible scope');
  await card.getByRole('button',{name:'Trust Center'}).click();
  await expect(page.getByRole('heading',{name:'Trust Center',exact:true})).toBeVisible();
});
