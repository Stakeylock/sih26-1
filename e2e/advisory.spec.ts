import {test,expect} from '@playwright/test';
test('advisory evaluation leaves the case unchanged until an explicit human action',async({page})=>{
 await page.goto('/#analysis');const source=page.locator('.analysis-source code');await expect(source).toBeVisible();const before=await source.innerText();
 await page.getByRole('button',{name:'Risk & notice',exact:true}).click();await expect(page.getByRole('heading',{name:'Breach-risk advisory',exact:true})).toBeVisible();await expect(page.getByText(/reviewer aid, not an official decision/)).toBeVisible();
 await page.locator('summary',{hasText:'Model card and limitations'}).click();await expect(page.getByText(/not trained on real applications and is not validated for operational use/)).toBeVisible();
 await page.getByRole('button',{name:'Capture current case',exact:true}).click();await expect(source).toHaveText(before);
});

