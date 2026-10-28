// @vitest-environment happy-dom
import {beforeEach,describe,expect,it} from 'vitest';
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {makeT,uiLang,useUiLang,roleLabelsHi} from '../src/ui/i18n';

(globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true;
const key='workspace-display-v1';

function Probe({en,hi}:{en:string;hi:string}){
  return <span>{makeT(useUiLang())(en,hi)}</span>;
}

describe('i18n helper',()=>{
  let root:Root;let container:HTMLDivElement;
  beforeEach(()=>{
    localStorage.removeItem(key);
    container=document.createElement('div');
    document.body.append(container);
    root=createRoot(container);
  });
  it('makeT keeps the English copy when the surface is English',()=>{
    expect(makeT('en')('Case operations','केस संचालन')).toBe('Case operations');
  });
  it('makeT uses the Hindi copy when the surface is Hindi',()=>{
    expect(makeT('hi')('Case operations','केस संचालन')).toBe('केस संचालन');
  });
  it('makeT falls back to English when a Hindi copy is missing',()=>{
    expect(makeT('hi')('SIH26262 · DEMONSTRATION','')).toBe('SIH26262 · DEMONSTRATION');
  });
  it('uiLang defaults to English without stored preferences',()=>{
    expect(uiLang()).toBe('en');
  });
  it('uiLang reads Hindi from the stored display preferences',()=>{
    localStorage.setItem(key,JSON.stringify({locale:'hi-IN'}));
    expect(uiLang()).toBe('hi');
  });
  it('roleLabelsHi covers every role key',()=>{
    expect(Object.keys(roleLabelsHi)).toEqual(['institution','scrutiny_officer','evc_coordinator','evc_member','regional_officer','national_admin']);
  });
  it('useUiLang renders English initially and switches Hindi when the event fires',async()=>{
    act(()=>{root.render(createElement(Probe,{en:'Case operations',hi:'केस संचालन'}));});
    expect(container.textContent).toBe('Case operations');
    localStorage.setItem(key,JSON.stringify({locale:'hi-IN'}));
    await act(async()=>{window.dispatchEvent(new Event('workspace-display-change'));});
    expect(container.textContent).toBe('केस संचालन');
    localStorage.setItem(key,JSON.stringify({locale:'en-IN'}));
    await act(async()=>{window.dispatchEvent(new Event('workspace-display-change'));});
    expect(container.textContent).toBe('Case operations');
  });
});
