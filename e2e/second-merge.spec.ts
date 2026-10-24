import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.getByRole('heading',{name:'Approval operations',exact:true})).toBeVisible();});
test('active dossier metric excludes closed cases and follows the selected role',async({page})=>{
  const count=page.getByRole('region',{name:'Active Dossiers',exact:true}).locator('.hero-metric-value');
  await expect(count).toHaveText('07');
  await page.getByRole('combobox',{name:'Demo role'}).selectOption('institution');
  await expect(count).toHaveText('02');
});
test('landing illustration advances and stops at a static state for reduced motion',async({page})=>{
  await page.clock.install();await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
  const receipt=page.locator('.welcome-receipt-card');await expect(receipt).toHaveAttribute('data-phase','initial');
  await page.clock.fastForward(3300);await expect(page.locator('.welcome-evidence-card')).toHaveClass(/shown/);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(receipt).toHaveAttribute('data-phase','final');
  await page.clock.fastForward(12000);await expect(receipt).toHaveAttribute('data-phase','final');
  await expect(page.getByText("Illustrative sequence, not this record's current state.",{exact:true})).toBeVisible();
});
