import {test,expect} from '@playwright/test';

test('workspace reading progress follows the real scroll position',async({page})=>{
  await page.goto('/#analysis');
  const bar=page.locator('.reading-progress span');
  await expect(bar).toHaveCSS('transform',/matrix\(0, 0, 0, 1, 0, 0\)/);
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await expect.poll(()=>page.locator('.reading-progress span').evaluate(element=>getComputedStyle(element).transform)).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('reading progress does not introduce motion under reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/#analysis');
  await expect(page.locator('.reading-progress span')).toHaveCSS('transition-property','none');
});
