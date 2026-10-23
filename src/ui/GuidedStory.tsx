import {useEffect} from 'react';
import {ArrowRight,X} from 'lucide-react';
import {roleLabels,type Role} from '../domain/model';

type TourStep={role:Role;route:string;roleLabel:string;routeLabel:string;title:string;body:string};
export const tourSteps:TourStep[]=[
  {role:'national_admin',route:'overview',roleLabel:roleLabels.national_admin,routeLabel:'Dispatch board',title:'Start where the deadline is closest.',body:'The priority queue ranks active dossiers by deadline risk. The first row is the case that needs a human next.'},
  {role:'institution',route:'case/demo-app-0',roleLabel:roleLabels.institution,routeLabel:'Dossier / DEMO-2026-1001',title:'The institution sees the same record the reviewer sees.',body:'No status-code guessing. The dossier names the current station, the next authority, and the evidence already on file.'},
  {role:'scrutiny_officer',route:'case/demo-app-0',roleLabel:roleLabels.scrutiny_officer,routeLabel:'Dossier / DEMO-2026-1001',title:'Scrutiny owns the next move.',body:'Evidence readiness is separate from reviewer completion. Clean documents do not equal approval; the checklist still has to be recorded.'},
  {role:'evc_coordinator',route:'case/demo-app-2',roleLabel:roleLabels.evc_coordinator,routeLabel:'Dossier / DEMO-2026-1003',title:'A visit is a scheduled handoff.',body:'The expert visit is a named stage with a coordinator, a date, and a report. It is not an email thread with no owner.'},
  {role:'regional_officer',route:'case/demo-app-3',roleLabel:roleLabels.regional_officer,routeLabel:'Dossier / DEMO-2026-1004',title:'A decision needs a reason and a receipt.',body:'The decision desk cites clean evidence and records the rationale. The route cannot be silently rerouted around a missing check.'},
  {role:'national_admin',route:'audit',roleLabel:roleLabels.national_admin,routeLabel:'Audit logs',title:'The record outlives the meeting.',body:'Actor, role, reason, time, and workflow version are append-only. This is the trust layer a regulator can inspect.'},
  {role:'national_admin',route:'receipt/demo-app-5',roleLabel:roleLabels.national_admin,routeLabel:'Decision receipt / DEMO-2026-1006',title:'Open the receipt.',body:'A decision rendered as one verifiable record. Print it, share it, or trace it back to the dossier that produced it.'}
];

export function GuidedStory({step,onNext,onExit}:{step:number;onNext:()=>void;onExit:()=>void}){
  const current=tourSteps[step]??tourSteps[0];
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==='Escape')onExit();};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[onExit]);
  return <aside className="guided-story" aria-label="Guided demonstration story">
    <div className="guided-story-head"><span>GUIDED STORY / {String(step+1).padStart(2,'0')} OF {String(tourSteps.length).padStart(2,'0')}</span><button className="icon-button" aria-label="Exit guided story" onClick={onExit}><X size={16}/></button></div>
    <div className="guided-progress" aria-hidden="true"><span style={{width:`${((step+1)/tourSteps.length)*100}%`}}/></div>
    <div className="guided-story-context"><span>{current.roleLabel}</span><span>{current.routeLabel}</span></div>
    <h2 aria-live="polite">{current.title}</h2>
    <p>{current.body}</p>
    <div className="guided-dots" aria-hidden="true">{tourSteps.map((item,index)=><span className={index===step?'active':index<step?'done':''} key={item.title}/>)}</div>
    <div className="guided-story-actions"><button className="button" onClick={onNext}>{step===tourSteps.length-1?'Finish story':'Next handoff'}<ArrowRight size={15}/></button><button className="text-button" onClick={onExit}>Exit tour</button></div>
  </aside>;
}
