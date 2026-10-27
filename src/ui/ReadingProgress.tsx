import {useEffect,useState} from 'react';
import './reading-progress.css';

function progress(){
  const root=document.documentElement;
  const remaining=Math.max(1,root.scrollHeight-root.clientHeight);
  return Math.min(100,Math.max(0,(window.scrollY/remaining)*100));
}

export function ReadingProgress(){
  const [value,setValue]=useState(0);
  useEffect(()=>{
    let frame=0;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setValue(progress()));};
    update();
    window.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',update);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[]);
  return <div className="reading-progress" aria-hidden="true"><span style={{transform:`scaleX(${value/100})`}}/></div>;
}
