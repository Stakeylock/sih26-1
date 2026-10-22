import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
test('measured visual tokens, keyboard command palette, and reduced motion',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:'Operations overview',exact:true})).toBeVisible();
  const assertions=JSON.parse(readFileSync('docs/style checks','utf8')) as {selector:string;prop:string;expected:string}[];
  const styles:Record<string,Record<string,string>>={};
  for(const a of assertions){const value=await page.locator(a.selector).first().evaluate((element,prop)=>getComputedStyle(element).getPropertyValue(prop.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())),a.prop);styles[a.selector]={...styles[a.selector],[a.prop]:value};expect(value,`${a.selector} ${a.prop}`).toBe(a.expected);}
  writeFileSync('docs/measured styles',JSON.stringify(styles,null,2));
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('combobox',{name:'Search pages and applications'}).fill('Audit logs');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Audit logs',exact:true})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.nav-item').first().evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
});
