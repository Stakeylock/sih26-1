import { ArrowRight, BarChart3, Clock3, FileStack, MapPin, Plus, ShieldCheck, TrendingUp, Search } from 'lucide-react';
import { actionLabels, allowedActions, regions, routeStage, routeStageIndex, routeStages, type Application, type Identity, type Status, type Workspace } from '../domain/model';
import { workingDaysUntil } from '../domain/clock';
// Station label for a status. Same facts as statusLabels, phrased as the work in progress at the station.
const operationalStatus: { [key in Status]: string } = {
  draft: 'Draft in progress', submitted: 'Awaiting reviewer assignment', under_scrutiny: 'Officer reviewing',
  deficiency_raised: 'Awaiting institution correction', resubmitted: 'Awaiting reviewer assignment',
  evc_pending: 'Awaiting visit scheduling', evc_scheduled: 'Awaiting visit report',
  pending_decision: 'Awaiting decision', approved: 'Approved', rejected: 'Rejected',
};
import {Badge,Due,Empty} from './common';
import {useState} from 'react';
import {missingInputs} from '../domain/model';

function priorityReason(app:Application){const days=workingDaysUntil(app.sla_due_at);if(days!==null&&days<0)return `Overdue by ${Math.abs(days)} day${Math.abs(days)===1?'':'s'}`;if(days===0)return 'Due today';if(days!==null)return `Due in ${days} day${days===1?'':'s'}`;return 'No demo SLA recorded';}
function nextAction(app:Application,identity:Identity){const action=allowedActions(app,identity)[0];return action?`Your next action: ${actionLabels[action].toLowerCase()}`:'Next authority: '+nextAuthorityLabel(app.status);}
function nextAuthorityLabel(status:Status){if(status==='deficiency_raised')return 'Institution';const byStage:{[key in Status]:string}={draft:'Institution',submitted:'Scrutiny officer',under_scrutiny:'Assigned scrutiny officer',deficiency_raised:'Institution',resubmitted:'Scrutiny officer',evc_pending:'EVC coordinator',evc_scheduled:'Assigned EVC coordinator',pending_decision:'Regional officer',approved:'Record closed',rejected:'Record closed'};return byStage[status];}
function holdDays(app:Application){const updated=Date.parse(app.updated_at);return Number.isFinite(updated)?Math.max(0,Math.floor((Date.now()-updated)/86400000)):0;}

export function Overview({data,identity,open,navigate}:{data:Workspace;identity:Identity;open:(id:string)=>void;navigate:(page:string)=>void}){
  const active=data.applications.filter(a=>!['draft','approved','rejected'].includes(a.status));
  const atRisk=active.filter(a=>(workingDaysUntil(a.sla_due_at)??99)<=3);
  const canCreate=identity.roles.some(r=>r.role==='institution');
  const onTime=active.filter(a=>(workingDaysUntil(a.sla_due_at)??99)>=0).length;
  const [filterScope,setFilterScope]=useState<'assigned'|'at_risk'|'all'>('all');
  const [searchQuery,setSearchQuery]=useState('');
  const [selectedRegion,setSelectedRegion]=useState<string|null>(null);
  const [filterSelectedId, _setFilterSelectedId]=useState<string|null>(null);
  const assigned=active.filter(a=>a.owner_id===identity.id||a.assigned_officer===identity.id);
  const scoped=filterScope==='assigned'?assigned:filterScope==='at_risk'?atRisk:active;
  const needle=searchQuery.trim().toLowerCase();
  const filtered=needle?scoped.filter(a=>{const institution=data.institutions.find(i=>i.id===a.institution_id)?.name??'';return a.ref_no.toLowerCase().includes(needle)||a.title.toLowerCase().includes(needle)||institution.toLowerCase().includes(needle);}):scoped;
  const regionFiltered=selectedRegion?filtered.filter(a=>a.region===selectedRegion):filtered;
  const list=regionFiltered.slice().sort((a,b)=>(workingDaysUntil(a.sla_due_at)??9999)-(workingDaysUntil(b.sla_due_at)??9999));
  const selected=list.find(a=>a.id===filterSelectedId)??list[0]??null;

  const sla=active.length?`${Math.round(onTime/active.length*100)}%`:'—';

  const institutionHolding=active.filter(a=>a.status==='deficiency_raised');
  const authorityHolding=active.filter(a=>a.status!=='deficiency_raised');
  const instAvgDays=institutionHolding.length?Math.round(institutionHolding.reduce((s,a)=>s+holdDays(a),0)/institutionHolding.length):0;
  const authAvgDays=authorityHolding.length?Math.round(authorityHolding.reduce((s,a)=>s+holdDays(a),0)/authorityHolding.length):0;

  const priority=active.slice().sort((a,b)=>(workingDaysUntil(a.sla_due_at)??9999)-(workingDaysUntil(b.sla_due_at)??9999)).slice(0,3);

  return <>
    <section className="dispatch-header" aria-labelledby="dispatch-title">
      <div>
        <span className="dispatch-kicker">ACTIVE WORK · AY 2026–27</span>
        <h1 id="dispatch-title">Approval operations</h1>
        <p>{active.length} active cases across {regions.length} administrative regions · {atRisk.length} require intervention.</p>
      </div>
      <div className="dispatch-header-side">
        <div className="dispatch-header-actions">
          {canCreate&&<button className="button" onClick={()=>navigate('new')}><Plus size={16}/>New application</button>}
          <button className="button outline" onClick={()=>navigate('reports')}><BarChart3 size={16}/>View reports</button>
        </div>
        <div className="dispatch-context">
          <span>Visible scope · Academic Year 2026–27</span>
          <strong>{String(active.length).padStart(2,'0')}</strong>
          <small>active dossiers</small>
        </div>
      </div>
    </section>

    {/* Hero Metrics Bar (Above the Fold) */}
    <div className="overview-hero-metrics" aria-label="Regulatory Command Center Metrics">
      <section className="hero-metric-card">
        <div className="hero-metric-head"><span>Active Dossiers</span><FileStack size={16}/></div>
        <strong className="hero-metric-value">{String(active.length).padStart(2,'0')}</strong>
        <span className="hero-metric-note">{data.applications.length} visible dossiers across AICTE</span>
      </section>

      <section className="hero-metric-card card-clock">
        <div className="hero-metric-head"><span>Time with officer / institution</span><Clock3 size={16}/></div>
        <div className="dual-clock-split">
          <div className="dual-clock-col">
            <span>🏛 Council Review</span>
            <strong>{authorityHolding.length} cases ({authAvgDays}d avg)</strong>
          </div>
          <div className="dual-clock-col">
            <span>🏫 Institution Return</span>
            <strong>{institutionHolding.length} {institutionHolding.length===1?'case':'cases'} ({instAvgDays}d avg)</strong>
          </div>
        </div>
        <span className="hero-metric-note" style={{marginTop:'4px'}}>Working days by responsible role</span>
      </section>

      <section className="hero-metric-card card-attention">
        <div className="hero-metric-head"><span>Need Intervention</span><Clock3 size={16}/></div>
        <strong className="hero-metric-value" style={{color:'var(--critical)'}}>{String(atRisk.length).padStart(2,'0')}</strong>
        <span className="hero-metric-note">Due in &le;3 days or overdue</span>
      </section>

      <section className="hero-metric-card card-verified">
        <div className="hero-metric-head"><span>Within configured processing target</span><TrendingUp size={16}/></div>
        <strong className="hero-metric-value" style={{color:'var(--verified)'}}>{sla}</strong>
        <span className="hero-metric-note">{onTime} of {active.length} active meet the configured target</span>
      </section>
    </div>

    <div className="overview-filter-bar" role="group" aria-label="Worklist scope">
      <div className="overview-scope-chips">
        {([['assigned','Assigned to me',assigned.length],['at_risk','At risk',atRisk.length],['all','All open',active.length]] as const).map(([key,label,count])=>(
          <button key={key} type="button" aria-pressed={filterScope===key} className={filterScope===key?'overview-scope-chip active':'overview-scope-chip'} onClick={()=>setFilterScope(key)}>{label} <b>{count}</b></button>
        ))}
      </div>
      <label className="overview-search">
        <Search size={14}/>
        <input aria-label="Search cases" placeholder="Search by reference, institution, or title" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/>
      </label>
    </div>

    <div className="overview-work-layout">
    {selected&&list.length>1&&(
      <aside className="overview-preview" aria-label="Selected case preview">
        <div><span className="mono">{selected.ref_no}</span><Badge status={selected.status}/></div>
        <h2>{data.institutions.find(i=>i.id===selected.institution_id)?.name??'Demo institution'}</h2>
        <p>{selected.title}</p>
        <dl className="overview-preview-facts">
          <div><dt>Stage</dt><dd>{routeStageIndex(selected.status)+1} of {routeStages.length} · {routeStage(selected.status).label}</dd></div>
          <div><dt>Status</dt><dd>{operationalStatus[selected.status]}</dd></div>
          <div><dt>Deadline</dt><dd><Due app={selected}/></dd></div>
          <div><dt>Next authority</dt><dd>{nextAuthorityLabel(selected.status)}</dd></div>
        </dl>
        <div className="overview-preview-block">
          <h3>Why it needs attention</h3>
          {missingInputs(selected,[]).length>0?(<ul>{missingInputs(selected,[]).slice(0,4).map(item=><li key={item}>{item}</li>)}</ul>):<p className="quiet">Submission is complete; the case is waiting on the current authority.</p>}
        </div>
        <div className="overview-preview-actions">
          <button className="button" onClick={()=>open(selected.id)}>Open dossier <ArrowRight size={15}/></button>
        </div>
      </aside>
    )}

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
              <p>{app.title}</p>
              <div className="dispatch-case-meta">
                <span><Clock3 size={13}/>{priorityReason(app)}</span>
                <span><ShieldCheck size={13}/>{nextAction(app,identity)}</span>
              </div>
            </div>
            <button className="dispatch-case-open" onClick={()=>open(app.id)} aria-label={`Open ${app.ref_no}`}>Inspect case <ArrowRight size={15}/></button>
          </article>
        )):<Empty title="The priority queue is clear">No active cases need intervention right now.</Empty>}
      </div>

      <aside className="dispatch-column dispatch-handoff-column">
        <div className="dispatch-column-heading">
          <div><div><h2>Work by stage</h2><p>Active cases across approval stages.</p></div></div>
          <span className="quiet-label"><span className="live-dot"/>Live</span>
        </div>
        <div className="stage-bar-list">
          {routeStages.map((stage,index)=>{
            const count=active.filter(a=>routeStage(a.status).key===stage.key).length;
            const pct=active.length?Math.round((count/active.length)*100):0;
            const isAttention=stage.key==='scrutiny'||stage.key==='expert_visit';
            return (
              <div className="stage-bar-item" key={stage.key}>
                <div className="stage-bar-header">
                  <strong><span className="section-index">{String(index+1).padStart(2,'0')}</span> {stage.label}</strong>
                  <span className="mono" style={{fontSize:'11px',fontWeight:600}}>{count} {count===1?'case':'cases'}</span>
                </div>
                <div className="stage-bar-track">
                  <div className={`stage-bar-fill ${isAttention?'fill-attention':''}`} style={{width:`${pct}%`}}/>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'10.5px',color:'var(--muted)'}}>
                  <span>{pct}% of active pool</span>
                  <span>{count>0?'In progress':'Clear'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="handoff-footer"><ShieldCheck size={14}/>Visible active scope<strong>{active.length}</strong></div>
      </aside>
    </section>
    </div>

    <div className="overview-record-link">
      <span><ShieldCheck size={14}/> Evidence provenance, record checks, and automation permissions.</span>
      <button className="text-button small" onClick={()=>navigate('trust')}>Open Trust Center <ArrowRight size={13}/></button>
    </div>

    {/* Pan-India Regional Heatmap Grid */}
    <section className="regional-control-section" aria-label="Regional Workload Matrix">
      <div className="regional-control-head">
        <h3><MapPin size={16}/> Active cases by region {selectedRegion&&<span className="quiet-label" style={{fontWeight:500}}>(Filtered to {selectedRegion} Region)</span>}</h3>
        {selectedRegion&&(
          <div style={{display:'flex',gap:'12px',alignItems:'center'}}>
            <button className="text-button small" onClick={()=>navigate('applications')}>View in full register <ArrowRight size={12}/></button>
            <button className="text-button small" onClick={()=>setSelectedRegion(null)}>Clear filter</button>
          </div>
        )}
      </div>
      <div className="regional-grid">
        {regions.map(r=>{
          const regApps=active.filter(a=>a.region===r);            const regOverdue=regApps.filter(a=>(workingDaysUntil(a.sla_due_at)??99)<0).length;
          const isSelected=selectedRegion===r;
          return (
            <button
              type="button"
              key={r}
              className={`regional-chip ${isSelected?'active':''}`}
              onClick={()=>setSelectedRegion(isSelected?null:r)}
              aria-pressed={isSelected}
            >
              <strong>{r}</strong>
              <span>
                <span>{regApps.length} active</span>
                {regOverdue>0&&<span className="overdue-tag">{regOverdue} overdue</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>

    <section className="case-register" aria-labelledby="case-register-title">
      <div className="case-register-heading">
        <div>
          <span className="dispatch-kicker">REGISTER / {list.length} OF {active.length} ACTIVE DOSSIERS</span>
          <h2 id="case-register-title">Case register</h2>
          <p>Active dossiers with route, region, and next deadline.</p>
        </div>
        <button className="text-button" onClick={()=>navigate('applications')}>View all cases <ArrowRight size={15}/></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Case / institution</th>
              <th>Region</th>
              <th>Current stage</th>
              <th>Status</th>
              <th>Next deadline</th>
              <th><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {list.map(a=><ApplicationRow key={a.id} app={a} institution={data.institutions.find(i=>i.id===a.institution_id)?.name??'Demo institution'} open={open} selectedId={selected?.id}/>)}
          </tbody>
        </table>
      </div>
    </section>

  </>;
}

export function ApplicationRow({app,institution,open,selectedId}:{app:Application;institution:string;open:(id:string)=>void;selectedId?:string}){const stage=routeStage(app.status);const isSelected=selectedId===app.id;return <tr data-selected={isSelected}><td><button className={`case-link${isSelected?' selected':''}`} aria-pressed={isSelected} onClick={()=>open(app.id)}>{app.ref_no}</button><strong className="cell-title">{institution}</strong><small>{app.title}</small></td><td>{app.region}</td><td><span className="station-label"><span className="station-number">{String(routeStageIndex(app.status)+1).padStart(2,'0')}</span>{stage.label}</span></td><td><span className="status-annotation"><Badge status={app.status}/><small>{operationalStatus[app.status]}</small></span></td><td><Due app={app}/></td><td><button className="icon-button" aria-label={`Open ${app.ref_no}`} onClick={()=>open(app.id)}><ArrowRight size={17}/></button></td></tr>;}
