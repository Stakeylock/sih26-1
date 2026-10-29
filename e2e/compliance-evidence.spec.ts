import {test,expect} from '@playwright/test';

test('user views obligations register and inspects obligations', async ({page}) => {
  await page.setViewportSize({width:1280,height:800});
  await page.goto('/#overview');
  await page.goto('/#obligations');
  await expect(page.getByRole('heading',{name:'Obligations & renewal register',level:1})).toBeVisible();
  await expect(page.getByLabel('Select case')).toBeVisible();
  await expect(page.getByText('Open & submitted obligations')).toBeVisible();
});
