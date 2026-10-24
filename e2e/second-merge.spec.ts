import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.getByRole('heading',{name:'Approval operations',exact:true})).toBeVisible();});
test('active dossier metric excludes closed cases and follows the selected role',async({page})=>{
  const count=page.getByRole('region',{name:'Active Dossiers',exact:true}).locator('.hero-metric-value');
  await expect(count).toHaveText('07');
  await page.getByRole('combobox',{name:'Demo role'}).selectOption('institution');
  await expect(count).toHaveText('02');
});
test('landing illustration advances and stops for reduced motion',async({page})=>{
  await page.clock.install();await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
  const illustration=page.getByRole('figure',{name:'Illustrative evidence review'});await illustration.scrollIntoViewIfNeeded();
  await expect(illustration).toHaveAttribute('data-step','evidence');await page.clock.fastForward(4500);await expect(illustration).toHaveAttribute('data-step','correction');
  await page.emulateMedia({reducedMotion:'reduce'});await expect(illustration).toHaveAttribute('data-playing','false');await page.clock.fastForward(12000);await expect(illustration).toHaveAttribute('data-step','correction');
  await expect(page.getByText('Automatic motion is off. Choose any step above.',{exact:true})).toBeVisible();
});
