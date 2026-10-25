import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async({page})=>{await page.goto('/#demo-lab');await page.evaluate(()=>localStorage.clear());await page.reload();});
async function openDemoCalendar(page:import('@playwright/test').Page){
  await page.goto('/#demo-lab');
  await expect(page.getByRole('heading',{name:'Demo calendar',exact:true})).toBeVisible();
}
test('demo calendar derives consequences for a shifted horizon and records SYSTEM notes in affected cases',async({page})=>{
  await openDemoCalendar(page);
  await page.getByRole('button',{name:'+30 days',exact:true}).click();
  await expect(page.locator('.demo-lab-clock-report')).toContainText('Overdue marks');
  await expect(page.locator('.demo-lab-clock-counters')).toContainText('Reminders');
  await expect(page.locator('.demo-lab-clock')).toContainText('+30 calendar days');
  await page.goto('/#audit');
  await expect(page.locator('.audit-row').filter({hasText:'demo calendar advanced'}).first()).toBeVisible();
  await expect(page.locator('.audit-row').filter({hasText:'demo calendar advanced'}).first()).toContainText('system');
});
test('compliance rows derive urgency from the shifted review clock and stay honest after reset',async({page})=>{
  await openDemoCalendar(page);
  await page.getByRole('button',{name:'+30 days',exact:true}).click();
  await expect(page.locator('.demo-lab-clock-report')).toContainText('Overdue marks');
  await page.goto('/#compliance');
  const table=page.getByRole('table',{name:'Continuing obligations'});
  await expect(table).toContainText('working day');
  await expect(table).toContainText('Overdue');
  await openDemoCalendar(page);
  await expect(page.locator('.demo-lab-clock')).toContainText('+30 calendar days');
  await page.getByRole('button',{name:'Reset calendar'}).click();
  await expect(page.locator('.demo-lab-clock')).toContainText('Real onward time');
  await expect(page.locator('.demo-lab-clock')).not.toContainText('+30 calendar days');
});
test('shifted calendar state survives reload and the demo lab stays axe-clean',async({page})=>{
  await openDemoCalendar(page);
  await page.getByRole('button',{name:'+7 days',exact:true}).click();
  await expect(page.locator('.demo-lab-clock')).toContainText('+7 calendar days');
  await page.reload();
  await openDemoCalendar(page);
  await expect(page.locator('.demo-lab-clock')).toContainText('+7 calendar days');
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(result.violations.filter(item=>['serious','critical'].includes(item.impact??''))).toEqual([]);
});
