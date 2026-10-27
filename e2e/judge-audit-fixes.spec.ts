import AxeBuilder from '@axe-core/playwright';
import {expect,test,type Page} from '@playwright/test';

function channels(value:string){return value.match(/\d+/g)!.map(Number) as [number,number,number];}
function contrast(foreground:string,background:string){
  const [r1,g1,b1]=channels(foreground),[r2,g2,b2]=channels(background);
  const luminance=(r:number,g:number,b:number)=>{const channel=(value:number)=>{const v=value/255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};return .2126*channel(r)+.7152*channel(g)+.0722*channel(b);};
  const first=luminance(r1,g1,b1),second=luminance(r2,g2,b2);
  return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);
}
async function reset(page:Page){await page.goto('/#overview');await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.getByRole('heading',{level:1,name:'Approval operations',exact:true})).toBeVisible();}

test.beforeEach(async({page})=>{await reset(page);});

test('outline and secondary buttons keep readable light-theme hover surfaces',async({page})=>{
  await page.goto('/#compliance');
  await expect(page.getByRole('heading',{name:'Compliance monitoring',exact:true})).toBeVisible();
  const secondary=page.getByRole('button',{name:'Policy notices',exact:true});
  await secondary.hover();
  await page.waitForTimeout(250);
  const secondaryStyle=await secondary.evaluate(element=>{const style=getComputedStyle(element);return{background:style.backgroundColor,color:style.color};});
  expect(secondaryStyle.background).toBe('rgb(232, 239, 244)');
  expect(contrast(secondaryStyle.color,secondaryStyle.background)).toBeGreaterThanOrEqual(4.5);
  await page.goto('/#case/demo-app-0');
  const outline=page.getByRole('button',{name:'Verify record',exact:true});
  await expect(outline).toBeVisible();
  await outline.hover();
  await page.waitForTimeout(250);
  const outlineStyle=await outline.evaluate(element=>{const style=getComputedStyle(element);return{background:style.backgroundColor,color:style.color};});
  expect(outlineStyle.background).toBe('rgb(232, 239, 244)');
  expect(contrast(outlineStyle.color,outlineStyle.background)).toBeGreaterThanOrEqual(4.5);
});

test('deadline explanation stays inside narrow viewports',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#case/demo-app-0');
  const summary=page.locator('summary.due').first();
  await expect(summary).toBeVisible();
  await summary.click();
  const panel=page.locator('.dossier-header .due-explain-panel');
  await expect(panel).toBeVisible();
  let box=await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(390.5);
  expect(box!.y+box!.height).toBeLessThanOrEqual(844.5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.setViewportSize({width:320,height:700});
  await page.waitForTimeout(100);
  box=await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(320.5);
  expect(box!.y+box!.height).toBeLessThanOrEqual(700.5);
});

test('compliance obligations table is a focusable horizontal scroll region',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#compliance');
  await expect(page.getByRole('heading',{name:'Compliance monitoring',exact:true})).toBeVisible();
  const region=page.getByRole('region',{name:'Continuing obligations table'});
  await expect(region).toHaveAttribute('tabindex','0');
  const width=await region.evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth}));
  expect(width.scroll).toBeGreaterThan(width.client);
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  expect(await region.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
});

test('case action rail distinguishes the stage gate from claim corrections',async({page})=>{
  await page.getByRole('combobox',{name:'Demo role'}).selectOption('national_admin');
  await page.goto('/#case/demo-app-0');
  const rail=page.getByRole('complementary',{name:'Dossier actions'});
  await expect(rail).toBeVisible();
  await expect(rail).toContainText('No stage action at this gate');
  await expect(rail).not.toContainText('No actions available');
  await expect(rail).toContainText('Claim corrections remain available.');
  const corrections=rail.getByRole('button',{name:'Open claim corrections',exact:true});
  await expect(corrections).toBeVisible();
  await corrections.click();
  await expect(page.locator('#dossier-unresolved')).toBeVisible();
});

test('mobile workspace sidebar keeps its named complementary landmark',async({page})=>{
  await page.setViewportSize({width:900,height:800});
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('complementary',{name:'Workspace sidebar'})).toBeVisible();
});

test('route changes update the document title and focus the main region',async({page})=>{
  await expect(page).toHaveTitle('Overview | Clauseway');
  await page.evaluate(()=>{location.hash='compliance';});
  await expect(page).toHaveTitle('Compliance monitoring | Clauseway');
  await expect(page.getByRole('heading',{name:'Compliance monitoring',exact:true})).toBeVisible();
  await expect(page.locator('main#main-content')).toBeFocused();
  await page.evaluate(()=>{location.hash='case/demo-app-0';});
  await expect(page).toHaveTitle(/DEMO-\d{4}-\d+ - Application workspace \| Clauseway/);
  await expect(page.getByRole('complementary',{name:'Dossier actions'})).toBeVisible();
  await expect(page.locator('main#main-content')).toBeFocused();
});

test('case landmarks are unique and the deadline summary keeps its visible label',async({page})=>{
  await page.goto('/#case/demo-app-0');
  await expect(page.getByRole('complementary',{name:'Dossier actions'})).toBeVisible();
  const landmarks=await new AxeBuilder({page}).withRules(['landmark-unique']).analyze();
  expect(landmarks.violations).toEqual([]);
  const due=await new AxeBuilder({page}).withRules(['label-content-name-mismatch']).include('.dossier-header').analyze();
  expect(due.violations).toEqual([]);
});

test('route focus is applied after a dialog opened on the previous route closes',async({page})=>{
  await page.goto('/#case/demo-app-0');
  await expect(page.getByRole('complementary',{name:'Dossier actions'})).toBeVisible();
  const summary=page.getByRole('button',{name:'Correction summary',exact:true});
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.evaluate(()=>{location.hash='compliance';});
  await expect(page.getByRole('heading',{name:'Compliance monitoring',exact:true})).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('main#main-content')).toBeFocused();
});

test('unknown routes report the unavailable page state',async({page})=>{
  await page.goto('/#nonexistent-section');
  await expect(page.getByRole('heading',{name:'Page unavailable'})).toBeVisible();
  await expect(page).toHaveTitle('Page unavailable | Clauseway');
  await expect(page.locator('.breadcrumb strong')).toHaveText('Page unavailable');
});
