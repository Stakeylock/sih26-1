import {Moon,Sun} from 'lucide-react';
import {useCallback,useEffect,useState} from 'react';

export type Theme='light'|'dark';
const storageKey='flowpilot-theme';

function initialTheme():Theme{
  const applied=document.documentElement.dataset.theme;
  if(applied==='light'||applied==='dark')return applied;
  try{const stored=localStorage.getItem(storageKey);if(stored==='light'||stored==='dark')return stored;}catch{}
  return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}

export function useTheme(){
  const [theme,setTheme]=useState<Theme>(initialTheme);
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem(storageKey,theme);}catch{}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0d141b':'#17232f');
  },[theme]);
  const toggleTheme=useCallback(()=>setTheme(current=>current==='dark'?'light':'dark'),[]);
  return {theme,toggleTheme};
}

export function ThemeToggle({theme,toggleTheme,className=''}:{theme:Theme;toggleTheme:()=>void;className?:string}){
  const dark=theme==='dark';
  return <button type="button" className={`icon-button theme-toggle ${className}`.trim()} title={dark?'Switch to light theme':'Switch to dark theme'} aria-label={dark?'Switch to light theme':'Switch to dark theme'} onClick={toggleTheme}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button>;
}
