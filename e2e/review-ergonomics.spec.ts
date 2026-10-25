import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();});
async function openCaseAsScrutiny(page:Page,ref:string){
  await page.getByRole('combobox',{name:'Demo role'}).selectOption('scrutiny_officer');
  await page.getByRole('navigation',{name:'Section navigation'}).getByRole('button',{name:'Approvals',exact:true}).click();
  await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByRole('textbox',{name:'Search applications'}).fill(ref);
  await page.getByRole('button',{name:ref,exact:true}).click();
}
test('officers start the deficiency from an editable claim-grounded template',async({page})=>{
  await openCaseAsScrutiny(page,'DEMO-2026-1001');
  await page.locator('.claim-row').filter({hasText:'Faculty count and cadre ratio'}).getByRole('button',{name:'Raise deficiency',exact:true}).click();
  const raise=page.getByRole('dialog');
  await raise.getByLabel('Drafting template (optional)').selectOption({label:'Linked evidence has lapsed'});
  await expect(raise.getByLabel('Observation')).not.toHaveValue(/^None/);
  const observation=await raise.getByLabel('Observation').inputValue();
  expect(observation).toContain('Faculty List');
  expect(observation.trim().length).toBeGreaterThanOrEqual(10);
  await raise.getByLabel('Observation').fill('The linked faculty list is older than the scrutiny window.');
  await raise.getByLabel('Remedy requested').fill('Provide a current faculty list signed by the registrar.');
  await raise.getByRole('button',{name:'Raise deficiency'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('Deficiency raised');
});
test('dossier evidence carries the recorded APH norm and honest expiry tiers',async({page})=>{
  await openCaseAsScrutiny(page,'DEMO-2026-1001');
  await page.getByRole('tab',{name:'Evidence'}).click();
  await expect(page.locator('.nav-norm',{hasText:'APH faculty'}).first()).toBeVisible();
  await page.locator('.document-expired').getByRole('button',{name:/View document record/}).click();
  const passport=page.getByRole('dialog');
  await expect(passport.getByText('Recorded norm')).toBeVisible();
  await expect(passport.locator('.passport-tags')).toContainText('Expired');
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(result.violations.filter(item=>['serious','critical'].includes(item.impact??''))).toEqual([]);
});
test('landing carries the policy-into-process line without inventing a capability',async({page})=>{
  await page.goto('/#welcome');
  await expect(page.getByText('Policy into process.',{exact:true})).toBeVisible();
});
