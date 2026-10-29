import {test,expect} from '@playwright/test';

test('evc coordinator captures and submits site inspection evidence on a mobile viewport',async({page,context})=>{
  await context.setGeolocation({latitude:28.6139,longitude:77.2090,accuracy:6});
  await context.grantPermissions(['geolocation']);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#visits');
  await expect(page.getByRole('button',{name:'Capture & submit evidence'})).toBeVisible({timeout:30000});

  await page.locator('button:has-text("Record current location")').click();
  await expect(page.getByText(/28\.61390, 77\.20900/)).toBeVisible();

  await page.getByLabel('Site observations / findings').fill('Fire exits blocked, extinguisher pressure low.');
  await page.getByLabel('Voice memo (transcribed)').fill('Voice memo: exits blocked, extinguisher needs service.');

  await page.getByRole('button',{name:'Capture & submit evidence'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('Inspection evidence submitted');

  await expect(page.getByText('Fire exits blocked, extinguisher pressure low.')).toBeVisible();
  await expect(page.getByText(/Voice memo: exits blocked, extinguisher needs service./)).toBeVisible();
});
