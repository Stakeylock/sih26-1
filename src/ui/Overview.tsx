import {neutralCopy} from '../domain/presentation';
import {useEffect,useState} from 'react';
import {ArrowRight,Building2,ClipboardClock,Clock3,Download,FileStack,Plus,Printer,RefreshCw,ShieldCheck,ShieldX} from 'lucide-react';
import { regions, routeStage, routeStageIndex, routeStages, type Application, type Identity, type Repository, type Status, type Workspace, typeLabels } from '../domain/model';
import {nextStep,type CaseNextStep} from '../domain/nextStep';
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
import {PolicyChangesBanner} from './PolicyChangesBanner';
import './integrity.css';
type ChainCheck={state:'checking'}|{state:'done';scope:'priority'|'all';intact:number;total:number;events:number;broken:{ref:string;at:number|null}|null}|{state:'error';message:string};

function nextDue(app:Application,step:CaseNextStep){if(step.kind==='renewal')return 'No renewal deadline recorded';const days=workingDaysUntil(step.due??app.sla_due_at,undefined,HOLIDAYS);const subject=step.kind==='obligation'?'Obligation':step.kind==='correction'?'Correction':step.kind==='visit'?'Visit':null;const prefix=subject?`${subject} `:'';if(days===null)return 'No recorded target';if(days<0)return `${prefix}overdue by ${Math.abs(days)} day${Math.abs(days)===1?'':'s'}`;if(days===0)return `${prefix}due today`;return `${prefix}due in ${days} day${days===1?'':'s'}`;}
function dueRank(app:Application,step:CaseNextStep){const value=step.due??app.sla_due_at;if(!value)return Number.POSITIVE_INFINITY;const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:Number.POSITIVE_INFINITY;}
function holdDays(app:Application){const updated=Date.parse(app.updated_at);return Number.isFinite(updated)?Math.max(0,Math.floor((Date.now()-updated)/86400000)):0;}
function downloadRoster(data:Workspace,scoped:Application[]){const rows=['Reference No,Title,Region,Category,Stage,Status,Remaining Days,Open Deficiencies'];for(const app of scoped){const remaining=workingDaysUntil(app.sla_due_at,undefined,HOLIDAYS);const defCount=data.deficiencies.filter(d=>d.application_id===app.id&&d.status==='open').length;const daysLabel=remaining===null?'None':remaining<0?`${Math.abs(remaining)}d overdue`:`${remaining}d remaining`;rows.push([app.ref_no,app.title,app.region,typeLabels[app.app_type]||app.app_type,routeStage(app.status).label,app.status,daysLabel,String(defCount)].join(','));}const blob=new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`case-pendency-roster-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(url);}
export function Overview({data,identity,repo,open,navigate}:{data:Workspace;identity:Identity;repo:Repository;open:(id:string)=>void;navigate:(page:string)=>void}){
  const active=data.applications.filter(a=>!['draft','approved','rejected'].includes(a.status));
  const closed=data.applications.filter(a=>['approved','rejected'].includes(a.status));
  const [scope,setScope]=useState<'active'|'closed'|'all'>('active');
  const scoped=scope==='active'?active:scope==='closed'?closed:data.applications;
  const actionable=scoped.filter(a=>!['draft','approved','rejected'].includes(a.status));
  const atRisk=actionable.filter(a=>(workingDaysUntil(a.sla_due_at,undefined,HOLIDAYS)??99)<=3);
  const canCreate=identity.roles.some(r=>r.role==='institution');
  const stepContext={documents:data.documents,deficiencies:data.deficiencies,obligations:data.obligations,visits:data.visits};
  const stepFor=(app:Application)=>nextStep(app,stepContext);
  const closedFollowUps=closed.filter(app=>['obligation','renewal'].includes(stepFor(app).kind));
  const priorityPool=scope==='closed'?closedFollowUps:scope==='all'?[...actionable,...closedFollowUps]:actionable;
  const priority=priorityPool.slice().sort((a,b)=>dueRank(a,stepFor(a))-dueRank(b,stepFor(b))).slice(0,3);
  const priorityKey=priority.map(app=>`${app.id}:${stepFor(app).due??app.sla_due_at??''}`).join('|');
  const [chain,setChain]=useState<ChainCheck>({state:'checking'});
  const verifyCases=async(apps:Application[])=>{const results=await Promise.all(apps.map(async app=>({app,result:await repo.verifyAudit(app)})));const broken=results.find(item=>!item.result.intact);return {intact:results.filter(item=>item.result.intact).length,total:results.length,events:results.reduce((sum,item)=>sum+item.result.checked,0),broken:broken?{ref:broken.app.ref_no,at:broken.result.broken_at}:null};};
  useEffect(()=>{let cancelled=false;const targets=priority;if(!targets.length){setChain({state:'done',scope:'priority',intact:0,total:0,events:0,broken:null});return;}setChain({state:'checking'});void verifyCases(targets).then(result=>{if(!cancelled)setChain({state:'done',scope:'priority',...result});}).catch(error=>{if(!cancelled)setChain({state:'error',message:error instanceof Error?error.message:'Chain verification unavailable.'});});return()=>{cancelled=true};},[repo,priorityKey,data.events.length]);
  const verifyVisible=()=>{if(!scoped.length)return;setChain({state:'checking'});void verifyCases(scoped).then(result=>setChain({state:'done',scope:'all',...result})).catch(error=>setChain({state:'error',message:error instanceof Error?error.message:'Chain verification unavailable.'}));};
  const chainBroken=chain.state==='done'&&chain.broken!==null;
  const chainValue=chain.state==='checking'?'···':chain.state==='error'?'—':chain.total?`${chain.intact}/${chain.total}`:'—';
  const chainNote=chain.state==='checking'?'Recomputing SHA-256 links in this browser…':chain.state==='error'?chain.message:chain.broken?`${chain.broken.ref} breaks at event ${chain.broken.at??'?'}`:chain.total===0?'No visible cases to verify.':`${chain.events} events checked · ${chain.scope==='all'?'visible scope':'priority cases'}`;

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
    </section>
    <PolicyChangesBanner data={data} identity={identity} navigate={navigate}/>
      {/* Hero Metrics Bar (Above the Fold) */}
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

        <section aria-label="Chain verification">
          <div className={`hero-metric-card-inner ${chainBroken?'hero-metric-card-attention':'hero-metric-card-verified'}`}>
            <div className="hero-metric-head">
              <span>Chain verification</span>
              {chainBroken?<ShieldX size={14}/>:<ShieldCheck size={14}/>}
            </div>
            <div className="hero-metric-value" style={{color:chainBroken?'var(--critical)':chain.state==='done'?'var(--verified)':undefined,fontSize:'34px'}} role="status" aria-live="polite">{chainValue}</div>
            <span className="hero-metric-note">{chainNote}</span>
            <div className="chain-proof-actions">
              <button type="button" className="text-button small" disabled={chain.state==='checking'||!scoped.length} onClick={verifyVisible}>{chain.state==='done'&&chain.scope==='all'?<><RefreshCw size={12}/>Re-verify</>:<><ShieldCheck size={12}/>Verify all {scoped.length}</>}</button>
              <button type="button" className="text-button small" onClick={()=>navigate('trust')}>Trust Center <ArrowRight size={12}/></button>
            </div>
          </div>
        </section>
      </div>

      <div className="overview-actions"><button className="button small outline" onClick={()=>downloadRoster(data,scoped)}><Download size={13}/>Export case roster (CSV)</button><button className="button small secondary" onClick={()=>window.print()}><Printer size={13}/>Print executive brief</button></div>

    <section className="dispatch-board" aria-label="Approval dispatch board">
      <div className="dispatch-column dispatch-action-column">
        <div className="dispatch-column-heading">
          <div><div><h2>{scope==='closed'?'Post-decision follow-ups':'Priority queue'}</h2><p>{scope==='closed'?'Recorded decisions with a condition or renewal still open.':'Cases closest to their next deadline.'}</p></div></div>
          <span className="dispatch-count">{String(priority.length).padStart(2,'0')}</span>
        </div>
        {priority.length?priority.map((app,index)=>{
          const step=stepFor(app);
          return <article className={`dispatch-case ${index===0?'dispatch-case-primary':''}`} key={app.id}>
            <div className="dispatch-case-index">{String(index+1).padStart(2,'0')}</div>
            <div className="dispatch-case-main">
              <div className="inline"><span className="mono">{app.ref_no}</span><Badge status={app.status}/>{step.kind==='obligation'&&<span className="document-tag pending">Obligation open</span>}{step.kind==='renewal'&&<span className="document-tag pending">Renewal needed</span>}</div>
              <h3>{data.institutions.find(i=>i.id===app.institution_id)?.name??'Demo institution'}</h3>
              <p>{neutralCopy(app.title)}</p>
              <div className="dispatch-case-meta">
                <span><Clock3 size={13}/>{nextDue(app,step)}</span>
                <span><ShieldCheck size={13}/>{step.owner} · {step.action}</span>
              </div>
            </div>
            <button className="dispatch-case-open" onClick={()=>open(app.id)} aria-label={`Open ${app.ref_no}`}>Inspect case <ArrowRight size={15}/></button>
          </article>;
        }):<Empty title={scope==='closed'?'No post-decision follow-ups open':'The priority queue is clear'}>{scope==='closed'?'Every visible closed case has no open condition or renewal follow-up.':'No active cases need intervention right now.'}</Empty>}
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
            <caption className="sr-only">Cases by region</caption>
            <thead>
              <tr>
                <th scope="col">Institutional Review Region</th>
                <th scope="col">Visible Dossiers</th>
                <th scope="col">Under Scrutiny</th>
                <th scope="col">EVC Inspection Queue</th>
                <th scope="col">Overdue</th>
                <th scope="col">SLA Compliance</th>
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

export function ApplicationRow({app,institution,open,selectedId,data}:{app:Application;institution:string;open:(id:string)=>void;selectedId?:string;data?:Pick<Workspace,'deadlines'|'notices'>}){const stage=routeStage(app.status);const isSelected=selectedId===app.id;return <tr data-selected={isSelected}><td><button className={`case-link${isSelected?' selected':''}`} aria-pressed={isSelected} onClick={()=>open(app.id)}>{app.ref_no}</button><strong className="cell-title">{institution}</strong><small>{neutralCopy(app.title)}</small></td><td>{app.region}</td><td><span className="station-label"><span className="station-number">{String(routeStageIndex(app.status)+1).padStart(2,'0')}</span>{neutralCopy(stage.label)}</span></td><td><span className="status-annotation"><Badge status={app.status}/><small>{operationalStatus[app.status]}</small></span></td><td><Due app={app} data={data}/></td><td><button className="icon-button" aria-label={`Open ${app.ref_no}`} onClick={()=>open(app.id)}><ArrowRight size={17}/></button></td></tr>;}
