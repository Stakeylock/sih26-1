import {expect,test} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.getByRole('heading',{level:1,name:'Approval operations',exact:true})).toBeVisible();});

function openA11yMenu(page:import('@playwright/test').Page){return page.locator('header.topbar .a11y-pop>summary').click();}

test('increasing text size to 120% keeps the workspace free of horizontal page scroll and leaves topbar actions reachable',async({page})=>{
  await openA11yMenu(page);
  await page.getByRole('button',{name:'120%',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('style',/--text-scale:\s*1\.2/);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('header.topbar button[aria-label="Refresh workspace"]')).toBeVisible();
  await expect(page.locator('header.topbar .a11y-pop>summary')).toBeVisible();
});

test('high contrast changes the document state and persists across reload',async({page})=>{
  await openA11yMenu(page);
  await page.getByRole('button',{name:'On',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast','high');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast','high');
  await openA11yMenu(page);
  await expect(page.getByRole('button',{name:'On',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('choosing Hindi updates the document language and section chrome, and persists across reload',async({page})=>{
  await openA11yMenu(page);
  await page.getByRole('button',{name:'हिन्दी',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','hi-IN');
  await expect(page.getByRole('button',{name:'अनुमोदन',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','hi-IN');
  await expect(page.getByRole('button',{name:'कार्यक्षेत्र',exact:true})).toHaveAttribute('aria-current','true');
  await openA11yMenu(page);
  await expect(page.getByRole('button',{name:'हिन्दी',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('the topbar popover and the settings panel stay in sync through the shared preference store',async({page})=>{
  await openA11yMenu(page);
  await page.getByRole('button',{name:'120%',exact:true}).click();
  await page.locator('div.mainnav .icon-button[aria-label="Settings"]').click();
  await expect(page.getByLabel('Text size')).toHaveValue('1.2');
});

test('data tables name their columns with explicit header scope',async({page})=>{
  const scoped=async(table:import('@playwright/test').Locator)=>{
    const headers=table.locator('thead th');
    await expect(headers.first()).toBeVisible();
    for(const header of await headers.all())await expect(header).toHaveAttribute('scope','col');
  };
  await page.goto('/#applications');
  await scoped(page.getByRole('table',{name:'Visible application register'}));
  await page.goto('/#case/demo-app-0');
  await page.getByRole('tab',{name:'Scope',exact:true}).click();
  await scoped(page.getByRole('table',{name:'Previous and requested course intake'}));
  await page.goto('/#overview');
  await scoped(page.getByRole('table',{name:'Cases by region'}));
  await page.goto('/#operations');
  await scoped(page.getByRole('table',{name:'Recorded delivery lifecycle for selected case'}));
  await scoped(page.getByRole('table',{name:'Working days since submission, counted from recorded dates only'}));
  await page.goto('/#workflows');
  await scoped(page.getByRole('table',{name:'Route coverage and gating roles'}));
});
