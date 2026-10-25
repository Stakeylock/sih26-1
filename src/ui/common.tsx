import {neutralCopy} from '../domain/presentation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Clock3, FileText, X } from 'lucide-react';
import { routeStageIndex, routeStages, statusLabels, type Application, type AuditEvent, type Status } from '../domain/model';
import { workingDaysUntil } from '../domain/clock';
import { workspaceHolidays } from '../domain/calendar';
export function Brand({onClick}:{onClick?:()=>void}={}){
  const content=<><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6 4.5h8.5L19 9v10.5H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M14.5 4.5V9H19" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 13h7M9 16h4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></span>Clauseway<span className="brand-period">.</span></>;
  return onClick?<button className="brand brand-button" type="button" aria-label="Clauseway home" onClick={onClick}>{content}</button>:<div className="brand">{content}</div>;
}
export function Badge({status}:{status:Status}) {return <span className={`badge ${status}`} role="status" aria-label={`Status: ${statusLabels[status]}`}>{statusLabels[status]}</span>;}
export function Due({app}:{app:Application}){const days=workingDaysUntil(app.sla_due_at,undefined,workspaceHolidays());const text=days===null?'No active deadline':days<0?`${-days}d overdue`:days===0?'Due today':`${days}d remaining`;const aria=days===null?'No active deadline':days<0?`Deadline: ${-days} working days overdue`:days===0?'Deadline: due today':`Deadline: ${days} working days remaining`;return <span className={days!==null&&days<=3?'due urgent':'due'} aria-label={aria}><Clock3 size={13} aria-hidden="true"/>{text}</span>;}
export function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty"><FileText size={29}/><h3>{title}</h3><div>{children}</div></div>;}
export function Panel({title,subtitle,action,children,className=''}:{title:string;subtitle?:string;action?:ReactNode;children:ReactNode;className?:string}){return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>;}
export function SectionLink({target,route,children,className,onMissingTarget}:{target:string;route:string;children:ReactNode;className?:string;onMissingTarget?:(target:string)=>void}){
  return <a href={route} className={className} aria-label={typeof children==='string'?children:undefined} onClick={event=>{
    event.preventDefault();
    const section=document.getElementById(target);
    if(!section){onMissingTarget?.(target);return;}
    section.tabIndex=-1;
    section.scrollIntoView({block:'start'});
    section.focus({preventScroll:true});
  }}>{children}</a>;
}
export function ViewHeader({title,summary,count,label}:{title:string;summary:string;count?:string;label?:string}){return <section className="support-header"><div><h1>{title}</h1><p>{summary}</p></div>{count!==undefined&&<div className="support-header-count"><strong>{count}</strong><span>{label}</span></div>}</section>;}
export function Timeline({events}:{events:AuditEvent[]}){return events.length?<ol className="timeline">{events.slice().sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).map(e=><li key={e.id}><span className="timeline-dot"/><div className="spread"><strong>{e.action.replaceAll('_',' ')}</strong><time>{new Date(e.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</time></div><p>{neutralCopy(e.reason)||`${e.from_status?statusLabels[e.from_status]+' → ':''}${e.to_status?statusLabels[e.to_status]:'Audit event'}`}</p><small>{e.actor_role?.replaceAll('_',' ')||'system'} · {new Date(e.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</small></li>)}</ol>:<Empty title="No events yet">Case actions will appear here.</Empty>;}
export function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close();},[]);return <dialog ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-labelledby="dialog-title"><div className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19}/></button></div>{children}</dialog>;}
export function WorkflowRail({app}:{app:Application}){const current=routeStageIndex(app.status);return <ol className="workflow-rail">{routeStages.map((stage,i)=><li key={stage.key} className={i<current?'done':i===current?'current':''}><span className="rail-dot">{i<current?<Check size={14}/>:String(i+1).padStart(2,'0')}</span><div><strong>{neutralCopy(stage.label)}</strong><small>{stage.key==='expert_visit'&&app.template_snapshot.evc_mode==='none'?'Not required':i<current?'Completed':i===current?'Current stage':'Upcoming'}</small></div></li>)}</ol>;}
