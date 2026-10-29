import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();});

test('coordinator proposes and staffs an EVC visit from recorded availability',async({page})=>{
  await page.getByLabel('Demo role').selectOption('evc_coordinator');
  await page.goto('/#visits/demo-app-12');
  await expect(page.getByRole('heading',{name:'EVC scheduling',exact:true})).toBeVisible();
  await expect(page.getByText('No EVC visit recorded')).toBeVisible();
  await page.getByLabel('Purpose',{exact:true}).fill('Synthetic EVC visit purpose recorded for the demonstration case.');
  await page.getByRole('button',{name:'Schedule EVC visit'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('EVC visit scheduled.');
  await expect(page.getByText('Schedule version 1')).toBeVisible();
  await expect(page.getByText('All three required seats can be filled from recorded availability.')).toBeVisible();
  await page.getByRole('combobox',{name:'Academician',exact:true}).selectOption('demo-evc-member-1');
  await page.getByRole('combobox',{name:'Expert',exact:true}).selectOption('demo-evc-member-2');
  await page.getByRole('combobox',{name:'Architect - planning',exact:true}).selectOption('demo-evc-member-3');
  await page.getByRole('button',{name:'Assign members'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('EVC members assigned.');
  const members=page.locator('table').first();
  await expect(members).toContainText('Ravi Sharma');
  await expect(members).toContainText('Priya Nair');
  await expect(members).toContainText('Suresh Kumar');
  await expect(members.getByText('Invited',{exact:true})).toHaveCount(3);
  await expect(page.getByRole('button',{name:'Confirm EVC visit'})).toHaveCount(0);
});

test('member acceptance unlocks confirmation, and reschedule then cancellation follow the case state',async({page})=>{
  await page.getByLabel('Demo role').selectOption('evc_coordinator');
  await page.goto('/#visits/demo-app-2');
  await expect(page.getByRole('heading',{name:'Confirm the visit'})).toHaveCount(0);
  await page.getByLabel('Demo role').selectOption('evc_member');
  await page.goto('/#visits/demo-app-2');
  await expect(page.getByRole('heading',{name:'Your response'})).toBeVisible();
  await page.getByRole('button',{name:'Record response'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('EVC response recorded.');
  await expect(page.locator('table').first().getByText('Accepted',{exact:true})).toHaveCount(3);
  await page.getByLabel('Demo role').selectOption('evc_coordinator');
  await page.goto('/#visits/demo-app-2');
  await expect(page.getByRole('heading',{name:'Confirm the visit'})).toBeVisible();
  await page.getByRole('button',{name:'Confirm EVC visit'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('EVC visit confirmed.');
  await expect(page.getByLabel('Recorded visit').locator('option:checked')).toContainText('Confirmed');
  const reschedule=page.locator('form').filter({hasText:'Reschedule the visit'});
  await reschedule.getByLabel('Reason',{exact:true}).fill('Synthetic reason recorded for rescheduling the confirmed EVC visit window.');
  await reschedule.getByRole('button',{name:'Reschedule visit'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('EVC visit rescheduled.');
  await expect(page.getByText('Schedule history (1)')).toBeVisible();
  await expect(page.getByText('Schedule version 2')).toBeVisible();
  await expect(page.locator('table').first().getByText('Invited',{exact:true})).toHaveCount(3);
  const cancel=page.locator('form').filter({hasText:'Cancel the visit'});
  await cancel.getByLabel('Reason',{exact:true}).fill('Synthetic reason recorded for cancelling the rescheduled demonstration visit.');
  await cancel.getByRole('button',{name:'Cancel EVC visit'}).click();
  await expect(page.getByRole('status',{name:'Workspace notification'})).toContainText('EVC visit cancelled.');
  await expect(page.getByLabel('Recorded visit').locator('option:checked')).toContainText('Cancelled');
  await expect(page.getByRole('combobox',{name:'Case',exact:true}).locator('option:checked')).toContainText('Visit pending');
});
