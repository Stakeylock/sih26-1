import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async({page})=>{await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.getByRole('heading',{level:1,name:'Approval operations',exact:true})).toBeVisible();});
test('overview uses calculated metrics, search opens a case, all views render',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.getByText('Synthetic cases only.',{exact:false}).first()).toBeVisible();
  await expect(page.getByRole('heading',{name:'Approval operations',exact:true})).toBeVisible();
  await page.screenshot({path:'../test-results/clauseway-overview.png',fullPage:true});
  const dispatchBoard=page.locator('section.dispatch-board');
  await expect(dispatchBoard).toBeVisible();
  await expect(dispatchBoard.getByRole('button',{name:'Open DEMO-2026-1005',exact:true})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Approval routes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Approval route registry',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Bottleneck heatmap',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open Scrutiny stage',exact:true})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByRole('textbox',{name:'Search applications'}).fill('DEMO-2026-1001');
  await page.getByRole('button',{name:'DEMO-2026-1001',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Evidence index'})).toBeVisible();
  await page.screenshot({path:'../test-results/clauseway-case.png',fullPage:true});
  for(const [name,heading] of [['Approval routes','Approval route registry'],['Verification visits','Verification agenda'],['Compliance','Compliance obligations'],['Alerts & escalations','Escalation queue'],['Reports','Where are cases waiting?'],['Audit logs','Receipt register'],['Settings','Workspace & identity']] as const) {await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await expect(page.locator('main h1')).toHaveCount(1);await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();}
  expect(errors).toEqual([]);
});
test('institution creates and saves a synthetic draft; unsafe upload is rejected',async({page})=>{
  await page.getByRole('combobox',{name:'Demo role'}).selectOption('institution');
  await page.getByRole('button',{name:'New application',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Application title'}).fill('Demo robotics programme request');
  await page.getByRole('button',{name:'Continue to institution details'}).click();
  await page.getByRole('button',{name:'Save draft & continue to evidence'}).click();
  await expect(page.getByText('Demo robotics programme request',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Evidence index',exact:true})).toBeVisible();
  await expect(page.getByText(/blocker.*before this dossier can advance/, {exact:false})).toBeVisible();
  await page.getByRole('textbox',{name:'Programme name',exact:true}).fill('Demo robotics');
  await page.getByRole('textbox',{name:'Level',exact:true}).fill('Undergraduate');
  await page.getByRole('textbox',{name:'Proposed intake',exact:true}).fill('60');
  await page.getByRole('textbox',{name:'Laboratory infrastructure',exact:true}).fill('Synthetic laboratory inventory');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await expect(page.getByRole('button',{name:'Submit application',exact:true})).toBeDisabled();
  await page.getByLabel('Upload Building Plan').setInputFiles({name:'active.html',mimeType:'text/html',buffer:Buffer.from('<script>alert(1)</script>')});
  await expect(page.getByRole('alert')).toContainText('PDF, PNG, or JPEG');
});
test('scrutiny verifies a checklist and records a reasoned deficiency',async({page})=>{
  await page.getByRole('combobox',{name:'Demo role'}).selectOption('scrutiny_officer');
  await page.getByRole('button',{name:'DEMO-2026-1001',exact:true}).click();
  await page.getByRole('button',{name:'Verify Affidavit notarised'}).click();
  await expect(page.getByRole('status')).toContainText('Checklist updated');
  await page.getByRole('button',{name:'Return for deficiency',exact:true}).click();
  await page.getByRole('textbox',{name:'Reason',exact:true}).fill('Please update the synthetic fire certificate for this demonstration.');
  await page.getByRole('button',{name:'Confirm return for deficiency'}).click();
  await expect(page.getByText('Clarification required',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('mobile navigation and Applications screen have no serious automated accessibility violations',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Applications',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Applications',exact:true})).toBeVisible();
  await page.screenshot({path:'../test-results/clauseway-mobile.png',fullPage:true,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
});
test('shell owns one contextual header and an expandable demo disclosure',async({page})=>{
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.locator('.page-heading')).toHaveCount(0);
  await expect(page.locator('main .demo-banner')).toHaveCount(0);
  const disclosure=page.locator('header.topbar details.demo-disclosure');
  await expect(disclosure).toBeVisible();
  await expect(disclosure.getByText(/synthetic cases only/i)).toBeVisible();
  await disclosure.locator('summary').click();
  await expect(disclosure.getByText(/No real AICTE data or regulatory decisions are used here/i)).toBeVisible();
  await expect(page.getByText('Start with the dossier closest to a missed handoff.',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Where visible cases are waiting now.',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Cases closest to their next deadline.',{exact:true})).toBeVisible();
  await expect(page.getByText('Current workload across approval stages.',{exact:true})).toBeVisible();
});
test('dossier is the page header and keeps authority and return path',async({page})=>{
  await page.getByRole('navigation').getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByRole('textbox',{name:'Search applications'}).fill('DEMO-2026-1002');
  await page.getByRole('button',{name:'DEMO-2026-1002',exact:true}).click();
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.getByRole('heading',{level:1,name:/Meridian College of Engineering/})).toBeVisible();
  await expect(page.getByText('Next authority:',{exact:false})).toContainText('Institution');
  await expect(page.getByText('Return in route:',{exact:false})).toBeVisible();
  await expect(page.getByText('Synthetic record',{exact:true})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByRole('textbox',{name:'Search applications'}).fill('DEMO-2026-1001');
  await page.getByRole('button',{name:'DEMO-2026-1001',exact:true}).click();
  await expect(page.getByText('Next authority:',{exact:false})).toContainText('Scrutiny officer');
  await expect(page.locator('.dossier-route-note')).toContainText('Current handoff: Scrutiny · Scrutiny officer');
});
test('supporting desks keep task-specific composition',async({page})=>{
  await page.getByRole('navigation').getByRole('button',{name:'Verification visits',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Verification agenda',exact:true})).toBeVisible();
  await expect(page.locator('.agenda-day').first()).toBeVisible();
  await expect(page.getByText('Coordinator record · demo-evc',{exact:true})).toBeVisible();
  await expect(page.getByText(/local timezone/i)).toBeVisible();
  await expect(page.getByRole('button',{name:'Open dossier',exact:true}).first()).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Compliance',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Obligation register',exact:true})).toBeVisible();
  await expect(page.getByText('What must happen before this obligation can be closed?',{exact:true})).toBeVisible();
  for(const label of ['Required evidence','Evidence present','Authorized verification','Permitted next action'])await expect(page.getByText(label,{exact:true}).first()).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Alerts & escalations',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Escalation desk',exact:true})).toBeVisible();
  await expect(page.getByText('1 escalation requires review · 1 informational update.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Open case|Review case/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Mark read',exact:true}).first()).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Reports',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Operations report',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Closed cases/}).click();
  await expect(page.getByRole('button',{name:/Closed cases/})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('heading',{name:'Closed outcomes',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/All applications/}).click();
  await expect(page.getByRole('button',{name:/All applications/})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('navigation').getByRole('button',{name:'Audit logs',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Decision receipts',exact:true})).toBeVisible();
  const firstReceipt=page.locator('details.audit-row').first();
  await expect(firstReceipt).toBeVisible();
  await expect(firstReceipt.locator('.receipt-stamp')).toHaveCount(0);
  await firstReceipt.locator('summary').click();
  await expect(firstReceipt).toContainText('ACTOR');
  await expect(firstReceipt).toContainText('Synthetic demonstration event');
});
test('every desktop route has no serious automated accessibility violations',async({page})=>{
  for(const name of ['Overview','Applications','Approval routes','Verification visits','Compliance','Alerts & escalations','Reports','Audit logs','Settings']){
    await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
    await expect(page.locator('main h1')).toHaveCount(1);
    const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(results.violations.filter(v=>v.impact==='serious'||v.impact==='critical'),name).toEqual([]);
  }
});
test('design-rationale copy is absent from every route',async({page})=>{
  const banned=['Start with the dossier closest to a missed handoff.','Where visible cases are waiting now.','decorative chart','queue stays legible','before asking for a chart','application mix, not'];
  for(const name of ['Overview','Applications','Approval routes','Verification visits','Compliance','Alerts & escalations','Reports','Audit logs','Settings']){
    await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
    for(const phrase of banned)await expect(page.locator('main')).not.toContainText(phrase);
  }
});
test('mobile overview orders header, priority, route, and register',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await expect(page.getByRole('heading',{level:1,name:'Approval operations',exact:true})).toBeVisible();
  const ordered=await page.evaluate(()=>{
    const selectors=['.dispatch-header','.dispatch-action-column','.dispatch-handoff-column','.case-register'];
    const nodes=selectors.map(selector=>document.querySelector(selector));
    return nodes.every(Boolean)&&nodes.every((node,index)=>index===0||Boolean(nodes[index-1]!.compareDocumentPosition(node!)&Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(ordered).toBe(true);
  await expect(page.locator('.dispatch-action-column').getByRole('button',{name:'Open DEMO-2026-1005',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
