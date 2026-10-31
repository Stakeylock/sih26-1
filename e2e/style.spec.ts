import {test,expect} from '@playwright/test';
test('keyboard command palette and reduced motion',async({page})=>{
  await page.goto('/#overview');await expect(page.getByRole('heading',{name:'Approval operations',exact:true})).toBeVisible();
  await expect(page.locator('.nav-item').first()).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('combobox',{name:'Search pages and applications'}).fill('Audit logs');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Decision receipts',exact:true})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.nav-item').first().evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
});
