import {test,expect} from '@playwright/test';

test('national admin reviews and activates a regulatory change',async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto('/#overview');
  await page.goto('/#regulatory-changes');
  await expect(page.getByRole('heading',{name:'Regulatory change impact'})).toBeVisible();
  await expect(page.getByLabel('Change')).toBeVisible();

  await page.getByLabel('Change').selectOption('SANCTIONED_INTAKE · v1 · Draft');
  await expect(page.getByLabel('New statement')).toBeVisible();
  await page.getByLabel('New statement').fill('Sanctioned intake may vary by up to 10% from the previous approval.');
  await page.getByLabel('Change summary').fill('Allow a small intake variance to accommodate marginal demand.');
  await page.getByRole('button',{name:'Record version'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('Regulatory change version recorded.');

  await page.getByLabel('Review explanation').fill('Reviewed against the 2027-28 academic cycle requirements. The variance is bounded and reasonable.');
  await page.getByRole('button',{name:'Record source review'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('Source review recorded.');

  await page.getByRole('button',{name:'Preview impact · v2'}).click();
  await expect(page.getByText('Impact analysis · version 2')).toBeVisible();

  await page.getByLabel('Activation rationale').fill('Authorized after review: the intake variance change is bounded and documented.');
  await page.getByRole('button',{name:'Activate change'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('Regulatory change activated and applied to the registry.');
});
