import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {writeFileSync} from 'node:fs';

test.beforeEach(async({page})=>{await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.getByRole('heading',{level:1,name:/Evidence changes/})).toBeVisible();});
test('the landing has one primary destination and a functional keyboard skip link',async({page})=>{
  await expect(page.getByRole('heading',{level:1})).toHaveCount(1);await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();await expect(page).toHaveURL('http://127.0.0.1:5174/');
  await page.getByRole('button',{name:'Open proof case',exact:true}).click();await expect(page.getByRole('heading',{name:'Cedar Technical Institute',exact:true})).toBeVisible();
});
test('motion pauses, resumes and stops after the evidence review without changing a case',async({page})=>{
  const originalData=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('flowpilot-isolated-demo-')));const writes:string[]=[];page.on('request',request=>{if(['POST','PUT','PATCH','DELETE'].includes(request.method()))writes.push(new URL(request.url()).pathname);});
  await page.clock.install();const figure=page.getByRole('figure',{name:'Illustrative evidence review'});await figure.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Replay illustration'}).click();await expect(figure).toHaveAttribute('data-step','evidence');
  await page.getByRole('button',{name:'Pause illustration',exact:true}).click();await page.clock.fastForward(15000);await expect(figure).toHaveAttribute('data-step','evidence');
  await page.getByRole('button',{name:'Play illustration',exact:true}).click();await page.clock.fastForward(4500);await expect(figure).toHaveAttribute('data-step','correction');await expect(figure).toContainText('Awaiting authorised review');
  await page.clock.fastForward(4500);await expect(figure).toHaveAttribute('data-step','recorded');await expect(figure).toContainText('Human review recorded');await expect(figure.getByText('Under review',{exact:true})).toBeVisible();
  await page.clock.fastForward(4500);await expect(figure).toHaveAttribute('data-playing','false');await expect(figure).toContainText('not a final approval');
  await page.getByRole('button',{name:'Replay illustration'}).click();await expect(figure).toHaveAttribute('data-step','evidence');await expect(figure).toHaveAttribute('data-playing','true');
  expect(await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('flowpilot-isolated-demo-')))).toEqual(originalData);expect(writes).toEqual([]);
});
test('manual steps use keyboard navigation and keep playback paused',async({page})=>{
  const figure=page.getByRole('figure',{name:'Illustrative evidence review'});await page.getByRole('tab',{name:'Correction',exact:true}).click();await expect(figure).toHaveAttribute('data-step','correction');await expect(figure).toHaveAttribute('data-playing','false');
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Recorded',exact:true})).toBeFocused();await expect(figure).toHaveAttribute('data-step','recorded');await page.keyboard.press('Home');await expect(page.getByRole('tab',{name:'Evidence',exact:true})).toBeFocused();
});
test('the illustration pauses while it is outside the viewport',async({page})=>{
  await page.setViewportSize({width:1450,height:500});await page.clock.install();const figure=page.getByRole('figure',{name:'Illustrative evidence review'});await figure.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Replay illustration'}).click();await expect(figure).toHaveAttribute('data-playing','true');
  await page.locator('footer').scrollIntoViewIfNeeded();await expect(figure).toHaveAttribute('data-playing','false');await page.clock.fastForward(12000);await expect(figure).toHaveAttribute('data-step','evidence');
  await figure.scrollIntoViewIfNeeded();await expect(figure).toHaveAttribute('data-playing','true');await page.clock.fastForward(4500);await expect(figure).toHaveAttribute('data-step','correction');
});
test('reduced motion keeps all review states available without automatic changes',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.clock.install();const figure=page.getByRole('figure',{name:'Illustrative evidence review'});await expect(figure).toHaveAttribute('data-reduced-motion','true');await expect(figure).toHaveAttribute('data-playing','false');await page.clock.fastForward(20000);await expect(figure).toHaveAttribute('data-step','evidence');
  await page.getByRole('tab',{name:'Recorded',exact:true}).click();await expect(figure).toHaveAttribute('data-step','recorded');expect(await page.locator('.journey-tab-indicator').evaluate(element=>getComputedStyle(element).transitionDuration)).toBe('0s');
});
for(const width of [390,768,1450])test(`landing layout and contrast are accessible at ${width}px in both themes`,async({page})=>{
  await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
  for(const theme of ['light','dark']){
    if(theme==='dark')await page.getByRole('button',{name:'Switch to dark theme'}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(await page.locator('.landing-copy h1').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
    await expect(page.getByRole('button',{name:'Open proof case',exact:true})).toBeVisible();
    const result=await new AxeBuilder({page}).analyze();expect(result.violations).toEqual([]);
    await page.screenshot({path:`../../work/flowpilot-landing-${width}-${theme}.png`,fullPage:true});
  }
});
test('landing tokens are measured and assets remain local',async({page})=>{
  await expect(page.getByRole('figure',{name:'Illustrative evidence review'})).toBeVisible();await page.evaluate(async()=>{await document.fonts.ready;});
  const measurements=await page.evaluate(()=>{
    const read=(selector:string)=>{const element=document.querySelector(selector)!;const style=getComputedStyle(element);const rect=element.getBoundingClientRect();return {font:style.fontFamily,fontSize:style.fontSize,lineHeight:style.lineHeight,height:Math.round(rect.height),radius:style.borderRadius,color:style.color,background:style.backgroundColor};};
    return {heading:read('.landing-copy h1'),primary:read('.landing-primary'),illustration:read('.landing-journey'),indicator:read('.journey-tab-indicator'),externalAssets:performance.getEntriesByType('resource').map(entry=>entry.name).filter(url=>url.startsWith('http')&&new URL(url).origin!==location.origin)};
  });
  expect(measurements.heading.fontSize).toBe('60px');expect(measurements.primary.height).toBe(48);expect(measurements.primary.radius).toBe('8px');expect(measurements.illustration.radius).toBe('15px');expect(measurements.externalAssets).toEqual([]);writeFileSync('docs/landing-measured-styles.json',JSON.stringify(measurements,null,2)+'\n');
  await page.getByRole('tab',{name:'Recorded',exact:true}).click();await page.screenshot({path:'../../work/flowpilot-landing-preview.png',fullPage:true,animations:'disabled'});
});
test('station entry boots the workspace under the chosen role',async({page})=>{
  await page.getByRole('button',{name:/Submit the record, answer corrections/}).click();
  const roleSelect=page.locator('select[aria-label="Demo role"]');
  await expect(roleSelect).toBeVisible();
  await expect(roleSelect).toHaveValue('institution');
});
test('module chips deep-link into their workspace surface',async({page})=>{
  await page.getByRole('button',{name:'Audit logs',exact:true}).click();
  await expect(page).toHaveURL(/#audit/);
  await expect(page.locator('header.topbar')).toBeVisible();
  await page.goto('/#visits');
  await expect(page.locator('header.topbar')).toBeVisible();
});
test('landing gives the evidence map a featured entry point',async({page})=>{
  const map=page.getByRole('button',{name:'Evidence map',exact:true});
  await expect(map).toHaveClass(/landing-module-feature/);
  await map.click();
  await expect(page).toHaveURL(/#analysis/);
  await expect(page.getByRole('button',{name:'Hide 3D evidence map'})).toBeVisible();
});
test('landing exposes the judge proof route',async({page})=>{
  await expect(page.getByRole('button',{name:'Run the judge proof',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Run the judge proof',exact:true}).click();
  await expect(page).toHaveURL(/#demo-lab/);
  await expect(page.getByRole('heading',{name:'Judge proof route',exact:true})).toBeVisible();
});
test('the landing dataset line states only what the demo seed contains',async({page})=>{
  await expect(page.getByRole('note')).toContainText('12 synthetic dossiers');
  await expect(page.getByRole('note')).toContainText('39 recorded events');
});
test('the landing headline follows the stored Hindi preference',async({page})=>{
  await page.evaluate(()=>localStorage.setItem('workspace-display-v1',JSON.stringify({scale:1,contrast:false,locale:'hi-IN'})));
  await page.reload();
   await expect(page.locator('h1')).toContainText('साक्ष्य बदलता है.');
});
