import {useMemo} from 'react';
import {demoNow} from '../domain/virtualClock';
import {workingDaysUntil} from '../domain/clock';
import {workspaceHolidays} from '../domain/calendar';
import {baseTier} from '../domain/consequences';
import {formatDateTime} from './DisplayPreferences';
import {neutralCopy} from '../domain/presentation';
import {type Identity,type Repository,type Workspace} from '../domain/model';
import {Empty,ViewHeader} from './common';
import type {Run} from './Applications';

interface WorkItem {
  id:string;application_id:string;ref_no:string;institution:string;region:string;
  deadlineType:string;title:string;dueDate:string;status:string;workingDays:number|null;tier:string;nextAction:string;
}

function institutionName(data:Workspace,id:string){return data.institutions.find(item=>item.id===id)?.name??'Institution unavailable';}
function obligationType(kind:string|null|undefined){if(kind==='document_expiry')return 'Document expiry';if(kind==='undertaking')return 'Undertaking';if(kind==='renewal')return 'Renewal';return kind??'Obligation';}
function tierLabel(tier:string|null){if(!tier)return 'Normal';if(tier==='watch')return 'Watch';if(tier==='normal')return 'Normal';if(tier==='t_minus_30')return '30-day window';if(tier==='t_minus_0')return 'Deadline date';return 'Escalated';}

function buildItems(data:Workspace):WorkItem[]{
  const now=demoNow();const holidays=workspaceHolidays();const byApp=new Map<string,ApplicationLike>(data.applications.map(app=>[app.id,app]));const items:WorkItem[]=[];
  for(const obl of data.obligations??[]){const app=byApp.get(obl.application_id);if(!app)continue;const remaining=workingDaysUntil(obl.due_date,now,holidays);const tier=tierLabel(baseTier(obl.escalation_level??null,remaining));items.push({id:obl.id,application_id:obl.application_id,ref_no:app.ref_no,institution:institutionName(data,app.institution_id),region:app.region,deadlineType:obligationType(obl.kind),title:obl.title,dueDate:obl.due_date,status:obl.status,workingDays:remaining,tier,nextAction:obl.status==='fulfilled'?'Record complete':remaining===0?'Act today':remaining!=null&&remaining<0?'Act now':'Fulfil with evidence'});}
  for(const app of data.applications){if(!app.sla_due_at||['approved','rejected'].includes(app.status))continue;const remaining=workingDaysUntil(app.sla_due_at,now,holidays);const tier=tierLabel(baseTier(null,remaining));items.push({id:'sla-'+app.id,application_id:app.id,ref_no:app.ref_no,institution:institutionName(data,app.institution_id),region:app.region,deadlineType:'Application SLA',title:'Scrutiny / decision clock',dueDate:app.sla_due_at,status:'open',workingDays:remaining,tier,nextAction:remaining===0?'Act today':remaining!=null&&remaining<0?'Act now':'Act on SLA'});}
  items.sort((left,right)=>{const lw=left.workingDays??0,rw=right.workingDays??0;if(lw<0&&rw>=0)return -1;if(lw>=0&&rw<0)return 1;if(lw===0&&rw!==0)return -1;if(rw===0&&lw!==0)return 1;return Date.parse(left.dueDate)-Date.parse(right.dueDate);});return items;}
interface ApplicationLike{id:string;ref_no:string;institution_id:string;region:string;status:string;sla_due_at:string|null;}

export function DueWork({data}:{data:Workspace;identity:Identity;repo:Repository;run:Run;busy:boolean}){
  const items=useMemo(()=>buildItems(data),[data]);const open=items.filter(item=>item.status!=='fulfilled').length;const overdue=items.filter(item=>item.workingDays!=null&&item.workingDays<0).length;const dueToday=items.filter(item=>item.workingDays===0).length;
  return (
    <section className="page-stack">
      <ViewHeader title="Due work" summary="One worklist for every recorded deadline and obligation across authorised cases: case, deadline type, responsible party, due date, escalation and next action." count={String(open).padStart(2,'0')} label="open items"/>
      {items.length===0?<Empty title="No due work">All recorded deadlines and obligations are fulfilled or have no recorded due date.</Empty>:
      <>
        <p className="muted">{overdue>0?`${overdue} item${overdue===1?'':'s'} overdue · `:''}{dueToday>0?`${dueToday} due today · `:''}Working days are counted from recorded dates only, excluding weekends.</p>
        <div className="table-scroll" tabIndex={0}><table><caption>Unified deadline and obligation worklist</caption><thead><tr><th scope="col">Case</th><th scope="col">Deadline type</th><th scope="col">Responsible party</th><th scope="col">Due date</th><th scope="col">Working days</th><th scope="col">Escalation</th><th scope="col">Next action</th></tr></thead><tbody>{items.map(item=>{const wd=item.workingDays;const dayLabel=wd===null?'No due date':wd<0?`${Math.abs(wd)}d overdue`:wd===0?'Due today':`${wd}d remaining`;return <tr key={item.id}><td><strong>{neutralCopy(item.ref_no)}</strong></td><td>{item.deadlineType}</td><td>{item.institution} · {item.region}</td><td><span className="mono">{formatDateTime(item.dueDate)}</span></td><td><span className={wd===null?'muted':wd<0?'document-tag pending':'muted'}>{dayLabel}</span></td><td>{item.tier}</td><td>{item.nextAction}</td></tr>;})}</tbody></table></div>
        <p className="support-footnote">Next action is a suggested step, not a recorded decision. Fulfilling an obligation requires reviewed current evidence and is recorded in the case audit trail.</p>
      </>
      }
    </section>
  );
}
