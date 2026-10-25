import {neutralCopy} from '../domain/presentation';
import {useState} from 'react';
import {ArrowRight,Building2,ClipboardClock,Clock3,Download,FileStack,Plus,Printer,ShieldCheck,TrendingUp} from 'lucide-react';
import { actionLabels, allowedActions, regions, routeStage, routeStageIndex, routeStages, type Application, type Identity, type Status, type Workspace, typeLabels } from '../domain/model';
import { workingDaysUntil } from '../domain/clock';
import { workspaceHolidays } from '../domain/calendar';
const HOLIDAYS = workspaceHolidays();
// Station label for a status. Same facts as statusLabels, phrased as the work in progress at the station.
const operationalStatus: { [key in Status]: string } = {
  draft: 'Draft in progress', submitted: 'Awaiting reviewer assignment', under_scrutiny: 'Officer reviewing',
  deficiency_raised: 'Awaiting institution correction', resubmitted: 'Awaiting reviewer assignment',
  evc_pending: 'Awaiting visit scheduling', evc_scheduled: 'Awaiting visit report',
  pending_decision: 'Awaiting decision', approved: 'Approved', rejected: 'Rejected',
};
import {Badge,Due,Empty} from './common';

function priorityReason(app:Application){const days=workingDaysUntil(app.sla_due_at,undefined,HOLIDAYS);if(days!==null&&days<0)return `Overdue by ${Math.abs(days)} day${Math.abs(days)===1?'':'s'}`;if(days===0)return 'Due today';if(days!==null)return `Due in ${days} day${days===1?'':'s'}`;return 'No demo SLA recorded';}
function nextAction(app:Application,identity:Identity){const action=allowedActions(app,identity)[0];return action?`Your next action: ${actionLabels[action].toLowerCase()}`:'Next authority: '+nextAuthorityLabel(app.status);}
function nextAuthorityLabel(status:Status){if(status==='deficiency_raised')return 'Institution';const byStage:{[key in Status]:string}={draft:'Institution',submitted:'Scrutiny officer',under_scrutiny:'Assigned scrutiny officer',deficiency_raised:'Institution',resubmitted:'Scrutiny officer',evc_pending:'EVC coordinator',evc_scheduled:'Assigned EVC coordinator',pending_decision:'Regional officer',approved:'Record closed',rejected:'Record closed'};return byStage[status];}
function holdDays(app:Application){const updated=Date.parse(app.updated_at);return Number.isFinite(updated)?Math.max(0,Math.floor((Date.now()-updated)/86400000)):0;}
function downloadRoster(data:Workspace,scoped:Application[]){const rows=['Reference No,Title,Region,Category,Stage,Status,Remaining Days,Open Deficiencies'];for(const app of scoped){const remaining=workingDaysUntil(app.sla_due_at,undefined,HOLIDAYS);const defCount=data.deficiencies.filter(d=>d.application_id===app.id&&d.status==='open').length;const daysLabel=remaining===null?'None':remaining<0?`${Math.abs(remaining)}d overdue`:`${remaining}d remaining`;rows.push([app.ref_no,app.title,app.region,typeLabels[app.app_type]||app.app_type,routeStage(app.status).label,app.status,daysLabel,String(defCount)].join(','));}const blob=new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`case-pendency-roster-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(url);}
export function Overview({data,identity,open,navigate}:{data:Workspace;identity:Identity;open:(id:string)=>void;navigate:(page:string)=>void}){
  const active=data.applications.filter(a=>!['draft','approved','rejected'].includes(a.status));
  const closed=data.applications.filter(a=>['approved','rejected'].includes(a.status));
  const [scope,setScope]=useState<'active'|'closed'|'all'>('active');
  const scoped=scope==='active'?active:scope==='closed'?closed:data.applications;
  const actionable=scoped.filter(a=>!['draft','approved','rejected'].includes(a.status));
  const atRisk=actionable.filter(a=>(workingDaysUntil(a.sla_due_at,undefined,HOLIDAYS)??99)<=3);
  const canCreate=identity.roles.some(r=>r.role==='institution');
  const withTarget=actionable.filter(a=>workingDaysUntil(a.sla_due_at,undefined,HOLIDAYS)!==null);
  const onTime=withTarget.filter(a=>(workingDaysUntil(a.sla_due_at,undefined,HOLIDAYS)??-1)>=0).length;
  const priority=actionable.slice().sort((a,b)=>(workingDaysUntil(a.sla_due_at,undefined,HOLIDAYS)??9999)-(workingDaysUntil(b.sla_due_at,undefined,HOLIDAYS)??9999)).slice(0,3);

  const sla=withTarget.length?`${Math.round(onTime/withTarget.length*100)}%`:'—';

  const institutionHolding=active.filter(a=>a.status==='deficiency_raised');
  const authorityHolding=active.filter(a=>a.status!=='deficiency_raised');
  const instAvgDays=institutionHolding.length?Math.round(institutionHolding.reduce((s,a)=>s+holdDays(a),0)/institutionHolding.length):0;
  const authAvgDays=authorityHolding.length?Math.round(authorityHolding.reduce((s,a)=>s+holdDays(a),0)/authorityHolding.length):0;
  return <>
    <section className="dispatch-header" aria-labelledby="dispatch-title">
      <div>
        <span className="dispatch-kicker">{scope==='active'?'ACTIVE WORK':scope==='closed'?'CLOSED CASES':'ALL CASES'} · AY 2026–27</span>
        <h1 id="dispatch-title">Approval operations</h1>
        <p>{scoped.length} visible cases across {regions.length} administrative regions · {atRisk.length} require intervention.</p>
      </div>
      <div className="dispatch-header-side">
        <div className="dispatch-header-actions">
          {canCreate&&<button className="button" onClick={()=>navigate('new')}><Plus size={16}/>New application</button>}
          <div className="scope-selector"><label className="field">Scope</label>{[{key:'active',label:'Active'},{key:'closed',label:'Closed'},{key:'all',label:'All'}].map(item=><button key={item.key} className={scope===item.key?'active':''} aria-pressed={scope===item.key} onClick={()=>setScope(item.key as 'active'|'closed'|'all')}>{item.label}</button>)}</div>
        </div>
        <div className="dispatch-context">
          <span>Visible scope · Academic Year 2026–27</span>
          <strong>{String(scoped.length).padStart(2,'0')}</strong> <small>{scope==='active'?'active dossiers':scope==='closed'?'closed cases':'all cases'}</small>
        </div>
      </div>
    </section>      {/* Hero Metrics Bar (Above the Fold) */}
      {/* Hero Stats Row — 4-column leader panel */}
      <div className="overview-hero-metrics" role="region" aria-label="Case overview metrics">
        {/* Card 1: Active Dossiers */}
        <section aria-label="Active Dossiers">
          <div className="hero-metric-card-inner">
            <div className="hero-metric-head">
            <span>{scope==='closed'?'Closed cases':scope==='all'?'All cases':'Active dossiers'}</span>
              <FileStack size={14}/>
            </div>
            <div className="hero-metric-value" style={{fontSize:'34px'}}>{String(scoped.length).padStart(2,'0')}</div>
            <span className="hero-metric-note">{data.applications.length} visible synthetic dossiers</span>
          </div>
        </section>

        {/* Card 2: Time with officer / institution */}
        <section aria-label="Time with officer / institution">
          <div className="hero-metric-card-inner hero-metric-card-clock">
            <div className="hero-metric-head">
              <span>Time with officer / institution</span>
              <Clock3 size={14}/>
            </div>
            <div className="dual-clock-split">
              <div className="dual-clock-col">
                <Building2 size={11}/>
                <span className="font-medium">Council Review</span>
                <span className="mono">{authorityHolding.length} cases ({authAvgDays}d avg)</span>
              </div>
              <div className="dual-clock-col">
                <Building2 size={11}/>
                <span className="font-medium">Institution Return</span>
                <span className="mono">{institutionHolding.length} {institutionHolding.length===1?'case':'cases'} ({instAvgDays}d avg)</span>
              </div>
            </div>
            <div className="hero-metric-note">Calendar days since last update</div>
          </div>
        </section>

        {/* Card 3: Need Intervention */}
        <section aria-label="Need Intervention">
          <div className="hero-metric-card-inner hero-metric-card-attention">
            <div className="hero-metric-head">
              <span>Need Intervention</span>
              <ClipboardClock size={14}/>
            </div>
            <div className="hero-metric-value" style={{color:'var(--critical)',fontSize:'34px'}}>{String(atRisk.length).padStart(2,'0')}</div>
            <span className="hero-metric-note">Due in &le;3 days or overdue</span>
          </div>
        </section>

        {/* Card 4: Processing target */}
        <section aria-label="Processing target achievement">
          <div className="hero-metric-card-inner hero-metric-card-verified">
            <div className="hero-metric-head">
              <span>Within configured processing target</span>
              <TrendingUp size={14}/>
            </div>
            <div className="hero-metric-value" style={{color:'var(--verified)',fontSize:'34px'}}>{sla}</div>
            <span className="hero-metric-note">{onTime} of {withTarget.length} cases with a recorded target meet it</span>
          </div>
        </section>
      </div>

      <div className="overview-actions"><button className="button small outline" onClick={()=>downloadRoster(data,scoped)}><Download size={13}/>Export case roster (CSV)</button><button className="button small secondary" onClick={()=>window.print()}><Printer size={13}/>Print executive brief</button></div>

    <section className="dispatch-board" aria-label="Approval dispatch board">
      <div className="dispatch-column dispatch-action-column">
        <div className="dispatch-column-heading">
          <div><div><h2>Priority queue</h2><p>Cases closest to their next deadline.</p></div></div>
          <span className="dispatch-count">{String(priority.length).padStart(2,'0')}</span>
        </div>
        {priority.length?priority.map((app,index)=>(
          <article className={`dispatch-case ${index===0?'dispatch-case-primary':''}`} key={app.id}>
            <div className="dispatch-case-index">{String(index+1).padStart(2,'0')}</div>
            <div className="dispatch-case-main">
              <div className="inline"><span className="mono">{app.ref_no}</span><Badge status={app.status}/></div>
              <h3>{data.institutions.find(i=>i.id===app.institution_id)?.name??'Demo institution'}</h3>
              <p>{neutralCopy(app.title)}</p>
              <div className="dispatch-case-meta">
                <span><Clock3 size={13}/>{priorityReason(app)}</span>
                <span><ShieldCheck size={13}/>{nextAction(app,identity)}</span>
              </div>
            </div>
            <button className="dispatch-case-open" onClick={()=>open(app.id)} aria-label={`Open ${app.ref_no}`}>Inspect case <ArrowRight size={15}/></button>
          </article>
        )):<Empty title="The priority queue is clear">No active cases need intervention right now.</Empty>}
      </div>
      <div className="dispatch-column dispatch-handoff-column">
        <div className="dispatch-column-heading">
          <div><div><h2>Work by stage</h2><p>Cases across the selected approval scope.</p></div></div>
          <span className="quiet-label"><span className="live-dot"/>Live</span>
        </div>
        <div className="stage-bar-list">
          {routeStages.map((stage,index)=>{
            const count=scoped.filter(a=>routeStage(a.status).key===stage.key).length;
            const pct=scoped.length?Math.round((count/scoped.length)*100):0;
            const isAttention=stage.key==='scrutiny'||stage.key==='expert_visit';
            return (
              <div className="stage-bar-item" key={stage.key}>
                <div className="stage-bar-header">
                  <strong><span className="section-index">{String(index+1).padStart(2,'0')}</span> {neutralCopy(stage.label)}</strong>
                  <span className="mono" style={{fontSize:'11px',fontWeight:600}}>{count} {count===1?'case':'cases'}</span>
                </div>
                <div className="stage-bar-track">
                  <div className={`stage-bar-fill ${isAttention?'fill-attention':''}`} style={{width:`${pct}%`}}/>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'10.5px',color:'var(--muted)'}}>
                  <span>{pct}% of selected scope</span>
                  <span>{count>0?'In progress':'Clear'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="handoff-footer"><ShieldCheck size={14}/>Visible case scope<strong>{scoped.length}</strong></div>
      </div>
    </section>
    <section className="report-board">
      <div className="report-question" style={{gridColumn:'1 / -1'}}>
        <div className="support-surface-heading"><div><div><h2>Cases by region</h2><p>Regional totals calculated from the visible scope.</p></div></div><span className="quiet-label"><ShieldCheck size={14}/>{regions.length} configured demonstration regions</span></div>
        <div className="table-wrap" style={{marginTop:'12px'}}>
          <table>
            <thead>
              <tr>
                <th>Institutional Review Region</th>
                <th>Visible Dossiers</th>
                <th>Under Scrutiny</th>
                <th>EVC Inspection Queue</th>
                <th>Overdue</th>
                <th>SLA Compliance</th>
              </tr>
            </thead>
            <tbody>
              {regions.map(r=>{
                const regApps=scoped.filter(a=>a.region===r);
                const scrutinyCount=regApps.filter(a=>['submitted','resubmitted','under_scrutiny','deficiency_raised'].includes(a.status)).length;
                const evcCount=regApps.filter(a=>['evc_pending','evc_scheduled'].includes(a.status)).length;
                const regOverdue=regApps.filter(a=>(workingDaysUntil(a.sla_due_at,undefined,HOLIDAYS)??99)<0).length;
                const onTime=regApps.filter(a=>(workingDaysUntil(a.sla_due_at,undefined,HOLIDAYS)??99)>=0).length;
                const rate=regApps.length?Math.round((onTime/regApps.length)*100):null;
                return <tr key={r}>
                  <td><strong>{r} Region</strong></td>
                  <td><span className="mono">{regApps.length}</span></td>
                  <td>{scrutinyCount}</td>
                  <td>{evcCount}</td>
                  <td><span className={regOverdue?'document-tag pending':'document-tag clean'}>{regOverdue} overdue</span></td>
                  <td><strong>{rate===null?'N/A':`${rate}%`}</strong></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <div className="overview-record-link">
      <span><ShieldCheck size={14}/> Evidence provenance, record checks, and automation permissions.</span>
      <button className="text-button small" onClick={()=>navigate('trust')}>Open Trust Center <ArrowRight size={13}/></button>
    </div>

  </>;
}

export function ApplicationRow({app,institution,open,selectedId}:{app:Application;institution:string;open:(id:string)=>void;selectedId?:string}){const stage=routeStage(app.status);const isSelected=selectedId===app.id;return <tr data-selected={isSelected}><td><button className={`case-link${isSelected?' selected':''}`} aria-pressed={isSelected} onClick={()=>open(app.id)}>{app.ref_no}</button><strong className="cell-title">{institution}</strong><small>{neutralCopy(app.title)}</small></td><td>{app.region}</td><td><span className="station-label"><span className="station-number">{String(routeStageIndex(app.status)+1).padStart(2,'0')}</span>{neutralCopy(stage.label)}</span></td><td><span className="status-annotation"><Badge status={app.status}/><small>{operationalStatus[app.status]}</small></span></td><td><Due app={app}/></td><td><button className="icon-button" aria-label={`Open ${app.ref_no}`} onClick={()=>open(app.id)}><ArrowRight size={17}/></button></td></tr>;}
