import {test,expect} from '@playwright/test';

test('route coverage table lists recorded stages, roles and the SHC appeal branch',async({page})=>{
  await page.goto('/#workflows');
  const table=page.getByRole('table',{name:'Route coverage and gating roles'});
  await expect(table).toBeVisible();
  const rows=table.locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(table.locator('thead th')).toHaveCount(3);
  await expect(table.getByRole('row',{name:/Scrutiny/})).toContainText('Scrutiny officer');
  await expect(table.getByRole('row',{name:/Expert Visit Committee/})).toContainText('EVC coordinator');
  await expect(table.getByRole('row',{name:/Regional decision/})).toContainText('Regional officer');
  await expect(table.getByText('15', {exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Self-disclosure extension'}).click();
  await expect(rows).toHaveCount(3);
  await expect(table.getByRole('row',{name:/Expert Visit Committee/})).toHaveCount(0);
  await expect(table.getByRole('row',{name:/Disclosure verification/})).toContainText('Scrutiny officer');
  const branch=page.getByText('SHC appeal — demo routes only',{exact:false});
  await expect(branch).toBeVisible();
  await expect(branch).toContainText('connected routes do not offer this action yet');
});
