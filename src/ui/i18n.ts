import {useEffect,useState} from 'react';
import {displayPreferences} from './DisplayPreferences';
import type {Role} from '../domain/model';
export type UiLang='en'|'hi';
export const roleLabelsHi:Record<Role,string>={institution:'संस्था',scrutiny_officer:'परीक्षण अधिकारी',evc_coordinator:'EVC समन्वयक',regional_officer:'क्षेत्रीय अधिकारी',national_admin:'राष्ट्रीय प्रशासक'};
export const uiLang=():UiLang=>displayPreferences().locale==='hi-IN'?'hi':'en';
export const makeT=(lang:UiLang)=>(en:string,hi:string):string=>lang==='hi'&&hi?hi:en;
export function useUiLang():UiLang{
  const [lang,setLang]=useState<UiLang>(uiLang);
  useEffect(()=>{
    const sync=()=>setLang(uiLang());
    window.addEventListener('workspace-display-change',sync);
    return()=>window.removeEventListener('workspace-display-change',sync);
  },[]);
  return lang;
}
