import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';

mkdirSync('scratch-visual', {recursive:true});

const vite=await createServer({mode:'demo',configFile:'./vite.config.ts',server:{port:0,host:'127.0.0.1'}});
await vite.listen();
const port=vite.httpServer?.address()?.port;
const BASE=`http://127.0.0.1:${port}`;
console.log(`[Vite] ${BASE}`);

const screens=[
  {name:'welcome',hash:'#welcome'},
  {name:'overview',hash:'#overview'},
  {name:'applications',hash:'#applications'},
  {name:'case',hash:'#case/demo-app-0'},
  {name:'workflows',hash:'#workflows'},
  {name:'visits',hash:'#visits'},
  {name:'compliance',hash:'#compliance'},
  {name:'alerts',hash:'#alerts'},
  {name:'reports',hash:'#reports'},
  {name:'trust',hash:'#trust'},
  {name:'audit',hash:'#audit'},
  {name:'settings',hash:'#settings'},
  {name:'prototype',hash:'#prototype'},
  {name:'prototype-case',hash:'#prototype/case/demo-app-0'},
  {name:'receipt',hash:'#receipt/demo-app-5'},
];

const browser=await chromium.launch();
let failures=0;
const expect=(label,cond)=>{if(!cond)failures+=1;console.log(`[Assertion] ${label}: ${cond?'PASS':'FAIL'}`);};

try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(()=>{try{localStorage.setItem('flowpilot-theme','dark');}catch{}});
  const page=await context.newPage();
  for(const screen of screens){
    await page.goto(`${BASE}/${screen.hash}`,{waitUntil:'networkidle'});
    await page.waitForTimeout(350);
    expect(`${screen.name}: dark theme applied`,await page.evaluate(()=>document.documentElement.dataset.theme==='dark'));
    const h1=await page.locator('main h1').count();
    expect(`${screen.name}: route rendered`,screen.name==='welcome'?h1===1:h1===1);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
    expect(`${screen.name}: no horizontal overflow`,!overflow);
    await page.screenshot({path:`scratch-visual/dark-${screen.name}-1440.png`,fullPage:true});
    if(!['welcome','prototype','prototype-case','receipt'].includes(screen.name)){
      const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      const serious=results.violations.filter(v=>v.impact==='serious'||v.impact==='critical');
      expect(`${screen.name}: no serious axe violations`,serious.length===0);
      if(serious.length)console.log(serious.flatMap(v=>v.nodes.map(n=>`  ${v.id} ${n.target.join(' ')} :: ${(n.failureSummary??'').replace(/\n/g,' ')}`)).join('\n'));
    }
  }

  const mobile=await browser.newContext({viewport:{width:390,height:844}});
  await mobile.addInitScript(()=>{try{localStorage.setItem('flowpilot-theme','dark');}catch{}});
  const mobilePage=await mobile.newPage();
  for(const screen of [{name:'overview',hash:'#overview'},{name:'welcome',hash:'#welcome'}]){
    await mobilePage.goto(`${BASE}/${screen.hash}`,{waitUntil:'networkidle'});
    await mobilePage.waitForTimeout(300);
    const overflow=await mobilePage.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
    expect(`390 ${screen.name}: no horizontal overflow`,!overflow);
    await mobilePage.screenshot({path:`scratch-visual/dark-${screen.name}-390.png`,fullPage:true});
  }

  const persistence=await browser.newContext({viewport:{width:1440,height:900}});
  const preferencePage=await persistence.newPage();
  await preferencePage.goto(`${BASE}/#overview`,{waitUntil:'networkidle'});
  expect('default preference is light',await preferencePage.evaluate(()=>document.documentElement.dataset.theme==='light'));
  await preferencePage.getByRole('button',{name:'Switch to dark theme'}).click();
  expect('toggle switches to dark',await preferencePage.evaluate(()=>document.documentElement.dataset.theme==='dark'));
  await preferencePage.reload({waitUntil:'networkidle'});
  expect('dark preference survives reload',await preferencePage.evaluate(()=>document.documentElement.dataset.theme==='dark'));
  await preferencePage.getByRole('button',{name:'Switch to light theme'}).click();
  await preferencePage.reload({waitUntil:'networkidle'});
  expect('light preference survives reload',await preferencePage.evaluate(()=>document.documentElement.dataset.theme==='light'));

  await preferencePage.goto(`${BASE}/#welcome`,{waitUntil:'networkidle'});
  expect('welcome toggle present',await preferencePage.getByRole('button',{name:'Switch to dark theme'}).count()===1);
}finally{
  await browser.close();
  await vite.close();
}

console.log(failures===0?'=== DARK THEME CHECKS PASSED ===':`=== DARK THEME CHECKS FAILED: ${failures} ===`);
process.exit(failures===0?0:1);
