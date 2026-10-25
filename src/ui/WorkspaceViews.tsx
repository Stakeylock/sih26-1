import {neutralCopy} from '../domain/presentation';
import {DisplayControls} from './DisplayPreferences';
import {OperationalExports} from './OperationalExports';
import {InspectionPlanner} from './InspectionPlanner';
import {documentEligible} from '../domain/approvals';
import {useState} from 'react';
import {AlertTriangle,ArrowLeft,ArrowRight,CalendarClock,Check,CheckCircle2,Clock3,Download,ExternalLink,FileCheck2,GitBranch,Info,LockKeyhole,Printer,ShieldCheck,TimerReset,UserRound} from 'lucide-react';
import type {AuditVerification} from '../domain/integrity';
import {missingInputs,regions,roleLabels,routeStage,routeStages,statusLabels,typeLabels,type AppType,type Application,type Identity,type Repository,type TemplateDefinition,type Workspace} from '../domain/model';
import {Badge,Empty,Panel,ViewHeader} from './common';
import type {Run} from './Applications';
import { workingDaysUntil } from '../domain/clock';
import { csv } from '../domain/intelligence';
function stageKeyFor(app:Application,stages:TemplateDefinition['stages']){
  if(['approved','rejected'].includes(app.status))return 'outcome';
  if(app.status==='draft')return stages.find(stage=>stage.key==='submission')?.key??stages[0]?.key??'unknown';
  if(['submitted','resubmitted','under_scrutiny','deficiency_raised'].includes(app.status))return stages.find(stage=>stage.key==='scrutiny')?.key??stages[1]?.key??stages[0]?.key??'unknown';
  if(['evc_pending','evc_scheduled'].includes(app.status))return stages.find(stage=>stage.key==='evc')?.key??stages.find(stage=>stage.key==='decision')?.key??stages.at(-1)?.key??'unknown';
  if(app.status==='pending_decision')return stages.find(stage=>stage.key==='decision')?.key??stages.at(-1)?.key??'unknown';
  return stages.at(-1)?.key??'unknown';
}
function holdDays(app:Application){const updated=Date.parse(app.updated_at);return Number.isFinite(updated)?Math.max(0,Math.floor((Date.now()-updated)/86400000)):0;}
function stageState(index:number,activeIndex:number,blocked:boolean,overdue:boolean){if(index<activeIndex)return 'complete';if(index>activeIndex)return 'pending';if(blocked)return 'blocked';if(overdue)return 'overdue';return 'active';}
export function Workflows({data,open}:{data:Workspace;open:(id:string)=>void}){
  const [type,setType]=useState<AppType>('new_programme');
  const [selectedAppId,setSelectedAppId]=useState('');
  const [selectedStageIndex,setSelectedStageIndex]=useState<number|null>(null);
  const selected=data.templates.find(template=>template.app_type===type&&template.status==='published');
  const availableApps=data.applications.filter(application=>application.app_type===type);
  const selectedApp=availableApps.find(application=>application.id===selectedAppId)??availableApps.find(application=>application.status!=='draft')??availableApps[0];
  const stages=selected?.definition.stages??[];
  const activeKey=selectedApp?stageKeyFor(selectedApp,stages):'';
  const activeIndex=activeKey==='outcome'?stages.length:Math.max(0,stages.findIndex(stage=>stage.key===activeKey));
  const detailIndex=stages.length?Math.min(selectedStageIndex??activeIndex,stages.length-1):0;
  const detailStage=stages[detailIndex];
  const selectedDocuments=selectedApp?data.documents.filter(document=>document.application_id===selectedApp.id):[];
  const selectedMissing=selectedApp?missingInputs(selectedApp,selectedDocuments):[];
  const stats=stages.map(stage=>{
    const stageApplications=data.applications.filter(application=>application.app_type===type&&!['draft','approved','rejected'].includes(application.status)&&stageKeyFor(application,stages)===stage.key);
    const overdue=stageApplications.filter(application=>(workingDaysUntil(application.sla_due_at)??99)<0).length;
    const averageHold=stageApplications.length?Math.round(stageApplications.reduce((total,application)=>total+holdDays(application),0)/stageApplications.length):0;
    return {stage,applications:stageApplications,overdue,averageHold};
  });
  const maxHold=Math.max(0,...stats.map(stat=>stat.averageHold));
  const detailStats=stats[detailIndex];
  return <>
    <ViewHeader title="Approval routes" summary="How each route moves, who owns each stage, and where it can return." count={String(data.templates.filter(template=>template.status==='published').length).padStart(2,'0')} label="published routes"/>
    <div className="tabs">{Object.entries(typeLabels).map(([key,label])=><button key={key} className={key===type?'active':''} onClick={()=>{setType(key as AppType);setSelectedAppId('');setSelectedStageIndex(null);}}>{label}</button>)}</div>
    {selected?<>
      <Panel title="Approval route registry" subtitle="Route stages, ownership, and return paths" action={<span className="quiet-label"><span className="live-dot"/>Live synthetic view</span>}>
        <div className="workflow-toolbar"><label className="workflow-selector"><span>Tracking application</span><select aria-label="Select application for workflow canvas" value={selectedApp?.id??''} onChange={event=>setSelectedAppId(event.target.value)}>{availableApps.map(application=><option key={application.id} value={application.id}>{application.ref_no} · {neutralCopy(application.title)}</option>)}</select></label><span className="quiet-label"><TimerReset size={14}/>{stats.reduce((total,stat)=>total+stat.applications.length,0)} active cases in this route</span></div>
        {selectedApp?<><div className="workflow-canvas" aria-label="Approval workflow canvas">{stages.map((stage,index)=>{const overdue=index===activeIndex&&(workingDaysUntil(selectedApp.sla_due_at)??99)<0;const blocked=selectedApp.status==='deficiency_raised'&&stage.key==='scrutiny';const state=stageState(index,activeIndex,blocked,overdue);const stageDocuments=selectedDocuments.filter(document=>document.scan_status==='clean').length;return <div className="workflow-step" key={stage.key}><button className={`workflow-node ${state}`} aria-label={`Open ${neutralCopy(stage.label)} stage`} onClick={()=>setSelectedStageIndex(index)}><span className="workflow-node-top"><span className="node-index">{String(index+1).padStart(2,'0')}</span><span className="node-state">{state==='complete'?<Check size={12}/>:state==='blocked'?<AlertTriangle size={12}/>:state==='overdue'?<Clock3 size={12}/>:state==='active'?<span className="node-pulse"/>:'Upcoming'}</span></span><strong>{neutralCopy(stage.label)}</strong><span className="workflow-owner"><UserRound size={13}/>{roleLabels[stage.role]}</span><span className="workflow-meta"><Clock3 size={13}/>{state==='complete'?'Stage complete':state==='pending'?'Upcoming':state==='blocked'?'Action required':`${holdDays(selectedApp)}d since update`}</span><span className="workflow-meta"><FileCheck2 size={13}/>{state==='pending'?'Awaiting handoff':`${stageDocuments} clean docs`}</span></button>{index<stages.length-1&&<ArrowRight className="workflow-edge" size={18} aria-hidden="true"/>}</div>;})}</div><div className="workflow-canvas-footer"><span><Badge status={selectedApp.status}/><span className="mono">{selectedApp.ref_no}</span></span><span className="quiet-label">Current handoff: {stages[activeIndex]?.label??'Outcome'} · {roleLabels[stages[activeIndex]?.role??'national_admin']}</span><span className="workflow-return-note">Return path: Scrutiny query → Institution → Resubmission</span></div><div className="workflow-branch" role="note" aria-label="Return and query branch"><span className="workflow-branch-stem"/><div className="workflow-branch-card"><ArrowLeft size={15}/><div><strong>Return and query branch</strong><span>Scrutiny query · Institution correction · Resubmission</span></div></div></div></>:<Empty title="No visible application">Choose a case to inspect its route.</Empty>}
      </Panel>
      <div className="workflow-insights-grid"><Panel title="Time since last update" subtitle="Average days since the last recorded update for active cases in each stage; overdue cases are called out separately."><div className="bottleneck-list">{stats.map(stat=><article className={stat.overdue?'bottleneck-row hot':'bottleneck-row'} key={stat.stage.key}><div className="bottleneck-copy"><strong>{stat.stage.label}</strong><small>{roleLabels[stat.stage.role]} · {stat.applications.length} active</small></div><div className="bottleneck-bar" role="progressbar" aria-label={`${stat.stage.label} average days since update ${stat.averageHold}`} aria-valuemin={0} aria-valuemax={maxHold||1} aria-valuenow={stat.averageHold}><span style={{width:`${maxHold?Math.round(stat.averageHold/maxHold*100):0}%`}}/></div><div className="bottleneck-value"><strong>{stat.averageHold}d</strong><small>{stat.overdue?`${stat.overdue} overdue`:'avg since update'}</small></div></article>)}</div><p className="panel-footnote">Duration is a transparent demo calculation from the last update time, not an AI score. Open a case to see the evidence and audit trail behind the signal.</p></Panel><Panel title={detailStage?`Stage detail · ${neutralCopy(detailStage.label)}`:'Stage detail'} subtitle="Owner, target, and the next explainable action"><div className="stage-detail">{detailStage&&detailStats?<><div className="stage-detail-heading"><div><span className="quiet-label">RESPONSIBLE ROLE</span><h3>{roleLabels[detailStage.role]}</h3></div><span className={detailStats.overdue?'document-tag pending':'document-tag clean'}>{detailStats.overdue?<AlertTriangle size={12}/>:<Check size={12}/>} {detailStats.overdue?`${detailStats.overdue} overdue`:'Within demo SLA'}</span></div><dl className="stage-detail-list"><div><dt>Target</dt><dd>{detailStage.sla_days?`${detailStage.sla_days} days`:'Institution intake'}</dd></div><div><dt>Active cases</dt><dd>{detailStats.applications.length}</dd></div><div><dt>Average since update</dt><dd>{detailStats.averageHold} days</dd></div><div><dt>Selected case</dt><dd>{selectedApp?.ref_no??'—'}</dd></div></dl>{selectedApp&&<div className="callout"><strong>{selectedMissing.length?`${selectedMissing.length} submission blocker${selectedMissing.length===1?'':'s'} before this case can advance.`:'No submission blockers are recorded.'}</strong><p>{selectedMissing.length?selectedMissing.slice(0,2).join(' · '):'Open the case to inspect submission completeness, review completion, role authority, and the append-only history.'}</p></div>}{selectedApp&&<button className="button outline" onClick={()=>open(selectedApp.id)}>Open case <ArrowRight size={15}/></button>}</>:<Empty title="Select a stage">The selected stage's operating detail will appear here.</Empty>}</div></Panel></div>
      <Panel title={neutralCopy(selected.name)} subtitle={`Published version ${selected.version} · Active cases retain this snapshot`} action={<span className="document-tag clean"><Check size={12}/>Published</span>}><div className="template-stages">{selected.definition.stages.map((stage,index)=><div key={stage.key}><span className="step-index">{String(index+1).padStart(2,'0')}</span><GitBranch size={20}/><h3>{neutralCopy(stage.label)}</h3><p>{roleLabels[stage.role]}</p><small>{stage.sla_days?`${stage.sla_days} days · demo target`:'Institution submission'}</small></div>)}</div><div className="detail-grid compact"><div><h3>Required evidence</h3><ul className="plain-list">{selected.definition.required_documents.map(document=><li key={document}><LockKeyhole size={14}/>{document}</li>)}</ul></div><div><h3>Review checklist</h3><ul className="plain-list">{selected.definition.checklist.map(item=><li key={item}><Check size={14}/>{item}</li>)}</ul></div></div><div className="callout"><strong>Controlled configuration</strong><p>Published templates are immutable in this app. Changes require a reviewed migration, a new version, and security tests. No active case is silently rerouted.</p></div><p className="muted">{selected.definition.disclaimer}</p></Panel>
    </>:<Empty title="No published workflow">An administrator must publish a reviewed workflow.</Empty>}
  </>;
}
function applicationInstitution(data:Workspace,application:Application|undefined){return application?data.institutions.find(i=>i.id===application.institution_id)?.name??'Demo institution':'Application unavailable';}
function evidenceSummary(data:Workspace,application:Application|undefined){if(!application)return 'No linked case';const clean=data.documents.filter(d=>d.application_id===application.id&&d.scan_status==='clean').length;const required=application.template_snapshot.required_documents.length;return `${clean}/${required} required evidence clean`;}
function dayKey(value:string){const date=new Date(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function Visits({data,open,identity,repo,run,busy,initialApplicationId}:{initialApplicationId?:string;data:Workspace;open:(id:string)=>void;identity:Identity;repo:Repository;run:Run;busy:boolean}){
  const visits=data.visits.slice().sort((a,b)=>Date.parse(a.scheduled_for)-Date.parse(b.scheduled_for));
  const upcoming=visits.filter(visit=>!visit.completed_at).length;
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const groups=visits.reduce<{key:string;label:string;visits:Workspace['visits']}[]>((result,visit)=>{const key=dayKey(visit.scheduled_for);const last=result.at(-1);if(last?.key===key)last.visits.push(visit);else result.push({key,label:new Date(visit.scheduled_for).toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),visits:[visit]});return result;},[]);
  return <>
    <ViewHeader title="Verification agenda" summary="Scheduled visits with coordinator, committee, evidence state, and dossier linkage." count={String(upcoming).padStart(2,'0')} label="upcoming visits"/>
    <InspectionPlanner initialApplicationId={initialApplicationId} data={data} identity={identity} repo={repo} run={run} busy={busy}/>
    <section className="support-surface agenda-surface">
      <div className="support-surface-heading"><div><div><h2>Visit register</h2><p>Scheduled by day, with recorded panel and evidence context for each visit.</p></div></div><span className="quiet-label"><CalendarClock size={14}/>Regional EVC coordination</span></div>
      {groups.length?<div className="agenda-list">{groups.map(group=><section className="agenda-day" key={group.key} aria-label={neutralCopy(group.label)}><div className="agenda-day-heading"><h2>{neutralCopy(group.label)}</h2><span>{group.visits.length} {group.visits.length===1?'visit':'visits'}</span></div>{group.visits.map(visit=>{const application=data.applications.find(a=>a.id===visit.application_id);const scheduled=new Date(visit.scheduled_for);return <article className="agenda-row" key={visit.id}><div className="agenda-index">{String(visits.indexOf(visit)+1).padStart(2,'0')}</div><div className="agenda-date"><strong>{scheduled.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</strong><span>Local time</span></div><div className="agenda-main"><div className="inline"><span className="mono">{application?.ref_no??'UNKNOWN CASE'}</span><span className={visit.completed_at?'document-tag clean':'document-tag pending'}>{visit.completed_at?<CheckCircle2 size={12}/>:<CalendarClock size={12}/>} {visit.completed_at?'Report complete':'Scheduled'}</span></div><h3>{applicationInstitution(data,application)}</h3><p>{application?.title??'Linked application unavailable'}</p><div className="agenda-meta"><span><UserRound size={13}/>Coordinator record · {visit.coordinator_id}</span><span><FileCheck2 size={13}/>{evidenceSummary(data,application)}</span></div>{visit.committee&&visit.committee.length>0&&<div style={{marginTop:'8px',padding:'6px 10px',background:'var(--surface-muted,#f8fafc)',borderRadius:'6px',fontSize:'12px'}}><strong style={{display:'block',marginBottom:'3px',fontSize:'11px',color:'var(--foreground-muted,#57697c)'}}>SEEDED DEMO PANEL · COORDINATOR-RECORDED DECLARATIONS</strong><div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>{visit.committee.map(exp=><span key={neutralCopy(exp.name)} style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'2px 6px',borderRadius:'4px',background:'var(--surface,#fff)',border:'1px solid var(--border,#e2e8f0)'}}><b>{exp.domain}:</b> {neutralCopy(exp.name)} ({exp.institution}){exp.no_conflict_signed&&<span className="document-tag clean" style={{marginLeft:'3px',padding:'1px 4px',fontSize:'10px'}}><Check size={10}/>Verified</span>}</span>)}</div></div>}{visit.report&&<div style={{marginTop:'8px',padding:'8px 12px',background:'var(--surface-muted,#f8fafc)',borderRadius:'6px',fontSize:'13px'}}><strong>Committee Finding:</strong> {visit.report}{visit.recommendation&&<span className="document-tag clean" style={{marginLeft:'8px'}}>Recommendation: {visit.recommendation}</span>}</div>}</div><div className="agenda-action"><span className="quiet-label">{visit.completed_at?'Inspect report':'Next action'}</span>{application?<button className="button outline" onClick={()=>open(visit.application_id)}>Open dossier <ArrowRight size={15}/></button>:<span className="quiet-label">Linked dossier unavailable</span>}</div></article>;})}</section>)}</div>:<Empty title="No visits scheduled">Open an EVC-pending case to schedule a demonstration visit.</Empty>}
      <div className="support-footnote"><ShieldCheck size={14}/>Times use this device's local timezone ({timezone}). Legacy panel labels are synthetic. Resource plans show recorded availability and conflict declarations.</div>
    </section>
  </>;
}
export function Compliance({data,identity,repo,run,busy,navigate}:{data:Workspace;identity:Identity;repo:Repository;run:Run;busy:boolean;navigate:(page:string)=>void}){
  const [selected,setSelected]=useState<string|null>(null),[reason,setReason]=useState(''),[evidence,setEvidence]=useState<string[]>([]);
  const [filter,setFilter]=useState('all');
  const mayVerify=(region:string)=>identity.roles.some(role=>role.role==='national_admin'||(role.role==='regional_officer'&&role.region===region));
  const rows=data.obligations.filter(item=>filter==='all'||(filter==='open'?item.status!=='fulfilled':item.status==='fulfilled'));
  const current=data.obligations.find(item=>item.id===selected),app=data.applications.find(item=>item.id===current?.application_id);
  return <section className="page-stack"><div className="page-heading"><div><h1>Compliance monitoring</h1><p>Continuing obligations remain open independently of the originating application’s outcome.</p></div><button className="button secondary" onClick={()=>navigate('notices')}>Policy notices</button></div>
    <label className="field">Obligation status<select value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All obligations</option><option value="open">Open obligations</option><option value="closed">Fulfilled obligations</option></select></label>
    <div className="table-scroll"><table><caption>Continuing obligations</caption><thead><tr><th>Obligation / origin</th><th>Due date</th><th>Recorded source</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(item=>{const origin=data.applications.find(app=>app.id===item.application_id),approval=data.approvals?.find(record=>record.id===item.approval_id),deadline=data.deadlines?.find(record=>record.obligation_id===item.id&&record.status==='active'),notice=data.notices?.find(record=>record.id===deadline?.notice_id);return <tr key={item.id}><td><strong>{neutralCopy(item.title)}</strong><small>{origin?.ref_no??'Originating case not available'} · {origin?.status??'institution record'}{approval?' · '+approval.source_ref:''}</small></td><td>{item.due_date}</td><td>{notice?notice.code+' · '+notice.source_version:approval?'Recorded approval condition':item.document_id?'Reviewed document expiry':'Synthetic configured follow-up'}{deadline&&<small>{deadline.calendar_basis.replaceAll('_',' ')} · IST</small>}</td><td>{item.status}</td><td><button className="button secondary small" onClick={()=>{setSelected(item.id);setReason('');setEvidence([]);}}>Review obligation</button>{origin&&<button className="button text small" onClick={()=>navigate('case/'+origin.id)}>Open case</button>}</td></tr>;})}</tbody></table></div>
    {current&&<article className="dossier-paper governance-view"><h2>{neutralCopy(current.title)}</h2><p>Due {current.due_date} · {current.status}. Evidence validity is checked separately from scan completion.</p>{!app&&<p className="callout">The originating application is unavailable; this obligation cannot be verified from this workspace.</p>}
      {app&&current.status!=='fulfilled'&&mayVerify(current.region)&&<form onSubmit={event=>{event.preventDefault();void run(()=>repo.fulfilWithEvidence(app,current,evidence,reason),'Obligation verified; its approval record remains unchanged.');}}>{(current.required_evidence??[]).length?<fieldset className="scope-editor"><legend>Required compliance evidence</legend>{current.required_evidence!.map(type=><label className="field" key={type}>{type}<select value={evidence.find(id=>data.documents.find(doc=>doc.id===id)?.doc_type===type)??''} required onChange={event=>setEvidence([...evidence.filter(id=>data.documents.find(doc=>doc.id===id)?.doc_type!==type),event.target.value].filter(Boolean))}><option value="">Select current reviewed evidence</option>{data.documents.filter(doc=>doc.application_id===app.id&&doc.doc_type===type&&documentEligible(doc)).map(doc=><option key={doc.id} value={doc.id}>{neutralCopy(doc.file_name)} · {doc.validity_reviewed_at?.slice(0,10)}</option>)}</select></label>)}</fieldset>:<p className="muted">No document categories were captured for this legacy obligation. Record your verification basis below.</p>}<label className="field">Verification reason<textarea value={reason} onChange={event=>setReason(event.target.value)} required minLength={10} maxLength={1000}/></label><button className="button" disabled={busy}>Verify fulfilment</button></form>}
      {app&&app.owner_id===identity.id&&current.status!=='fulfilled'&&<button className="button secondary" onClick={()=>navigate('case/'+app.id)}>Open case to provide evidence</button>}
    </article>}
  </section>;
}
function isEscalation(title:string,body:string){return /overdue|attention|escalat|deadline|deficien|action required|query|expired/i.test(`${title} ${body}`);}
export function Alerts({data,repo,run,busy,navigate}:{data:Workspace;repo:Repository;run:Run;busy:boolean;navigate:(page:string)=>void}){
  const escalations=data.notifications.filter(n=>isEscalation(n.title,n.body));
  const notices=data.notifications.filter(n=>!isEscalation(n.title,n.body));
  const unread=data.notifications.filter(n=>!n.read_at).length;
  const notification=(n:Workspace['notifications'][number],priority:'escalation'|'notice')=>{
    const linkedApp=n.application_id?data.applications.find(a=>a.id===n.application_id):undefined;
    return <article key={n.id} className={`alert-row ${n.read_at?'read':''} ${priority}`}><div className="alert-index">{priority==='escalation'?<AlertTriangle size={16}/>:<Info size={16}/>}</div><div className="alert-copy"><div className="inline"><span className="mono">{priority==='escalation'?'ESCALATION':'NOTICE'}</span>{linkedApp&&<span className="mono" style={{fontWeight:600}}>{linkedApp.ref_no}</span>}<span className={n.read_at?'document-tag':'document-tag pending'}>{n.read_at?'Read':'Unread'}</span></div><h3>{neutralCopy(n.title)}</h3><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString('en-IN')}</small></div><div style={{display:'flex',flexDirection:'column',gap:'8px',alignItems:'flex-end'}}>{n.application_id&&<button className="button small secondary" onClick={()=>navigate(`case/${encodeURIComponent(n.application_id!)}`)}>Inspect case <ArrowRight size={13}/></button>}{!n.read_at&&<button className="text-button" disabled={busy} onClick={()=>void run(()=>repo.markRead(n.id),'Notification marked as read.')}>Mark read</button>}</div></article>;
  };
  return <>
    <ViewHeader title="Escalation desk" summary={`${escalations.length} escalation${escalations.length===1?'':'s'} require${escalations.length===1?'s':''} review · ${notices.length} informational update${notices.length===1?'':'s'}.`} count={String(unread).padStart(2,'0')} label="unread signals"/>
    <div className="alert-toolbar"><button className="button outline" onClick={()=>navigate('overview')}>Open priority queue <ArrowRight size={15}/></button></div>
    <section className="alert-board"><div className="alert-column"><div className="support-surface-heading"><div><div><h2>Escalation queue</h2><p>Notifications that require case review or administrative intervention.</p></div></div><span className="dispatch-count">{String(escalations.length).padStart(2,'0')}</span></div>{escalations.length?escalations.map(n=>notification(n,'escalation')):<Empty title="No escalations">No current notification is classified as an intervention signal.</Empty>}</div><div className="alert-column notice-column"><div className="support-surface-heading"><div><div><h2>Information desk</h2><p>Context and reference updates from published routes.</p></div></div><span className="quiet-label"><Info size={14}/>Reference updates</span></div>{notices.length?notices.map(n=>notification(n,'notice')):<Empty title="No notices">Reference updates will appear here.</Empty>}</div></section>
    <div className="support-footnote"><ShieldCheck size={14}/>Alerts link to case references, pinned route versions and recorded deadlines.</div>
  </>;
}
function exportRosterCsv(applications: Workspace['applications'], data: Workspace) {
  const headers = ['Reference No','Title','Region','Category','Stage','Status','Dual-Clock Responsibility','SLA Due Date','Remaining Days','Open Deficiencies'];
  const rows = applications.map(app => {
    const remaining = workingDaysUntil(app.sla_due_at);
    const defCount = data.deficiencies.filter(d => d.application_id === app.id && d.status === 'open').length;
    const isInstDelay = app.status === 'deficiency_raised';
    const responsibility = isInstDelay ? 'Institution Return' : 'Council Processing';
    const daysLabel = remaining === null ? 'None' : remaining < 0 ? `${Math.abs(remaining)}d overdue` : `${remaining}d remaining`;
    return [
      app.ref_no,
      app.title,
      app.region,
      typeLabels[app.app_type] || app.app_type,
      routeStage(app.status).label,
      app.status,
      responsibility,
      app.sla_due_at ? app.sla_due_at.slice(0, 10) : 'N/A',
      daysLabel,
      defCount
    ];
  });
  const body = csv([headers, ...rows]);
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `case-pendency-roster-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
export function Reports({data}:{data:Workspace}){
  const [scope,setScope]=useState<'active'|'closed'|'all'>('active');
  const active=data.applications.filter(a=>!['approved','rejected'].includes(a.status));
  const closed=data.applications.filter(a=>['approved','rejected'].includes(a.status));
  const scoped=scope==='active'?active:scope==='closed'?closed:data.applications;
  const overdue=scoped.filter(a=>(workingDaysUntil(a.sla_due_at)??99)<0).length;
  const approved=closed.filter(a=>a.status==='approved').length;
  const rejected=closed.filter(a=>a.status==='rejected').length;
  const typeRows=Object.entries(typeLabels).map(([key,label])=>({label,count:scoped.filter(a=>a.app_type===key).length}));
  const routeRows=routeStages.filter(stage=>scope!=='closed'&&(scope==='all'||stage.key!=='outcome'));
  const scopes=[{key:'active' as const,label:'Active work',count:active.length},{key:'closed' as const,label:'Closed cases',count:closed.length},{key:'all' as const,label:'All applications',count:data.applications.length}];
  const scopeLabel=scopes.find(item=>item.key===scope)?.label??'Active work';
  return <>
    <ViewHeader title="Operations report" summary={scope==='closed'?'Approved and rejected outcomes within the visible scope.':scope==='all'?'Every visible case across the route, including closed outcomes.':'Where active work is waiting within the visible scope.'} count={String(scoped.length).padStart(2,'0')} label={scope==='active'?'active cases':scope==='closed'?'closed cases':'visible applications'}/>
    <div className="report-scope" role="group" aria-label="Report scope">{scopes.map(item=><button key={item.key} className={scope===item.key?'active':''} aria-pressed={scope===item.key} onClick={()=>setScope(item.key)}>{neutralCopy(item.label)}<strong>{String(item.count).padStart(2,'0')}</strong></button>)}</div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'10px',margin:'10px 0 16px'}}>
      <p className="report-scope-note" style={{margin:0}}>Showing {scopeLabel.toLowerCase()} · {scoped.length} of {data.applications.length} visible applications.</p>
      <div style={{display:'flex',gap:'8px'}}>
        <button className="button small outline" onClick={()=>exportRosterCsv(scoped,data)}><Download size={13}/>Export case roster (CSV)</button>
        <button className="button small secondary" onClick={()=>window.print()}><Printer size={13}/>Print executive brief</button>
      </div>
    </div>
    <OperationalExports data={data}/><section className="report-board">
      <div className="report-question"><div className="support-surface-heading"><div><div><h2>{scope==='closed'?'Closed outcomes':scope==='all'?'All visible applications':'Where are cases waiting?'}</h2><p>{scope==='closed'?'Approved and rejected outcomes, with waiting-stage counts excluded.':scope==='all'?'Every visible case across the route, including outcomes.':'Current handoffs calculated from active cases visible to this role.'}</p></div></div>{scope!=='closed'&&<span className="quiet-label"><TimerReset size={14}/>{overdue} overdue</span>}</div>
        {scope==='closed'?<div className="report-outcome-list"><div><span>Approved</span><strong>{String(approved).padStart(2,'0')}</strong><small>{closed.length?Math.round(approved/closed.length*100):0}% of closed cases</small></div><div><span>Rejected</span><strong>{String(rejected).padStart(2,'0')}</strong><small>{closed.length?Math.round(rejected/closed.length*100):0}% of closed cases</small></div></div>:<div className="report-route-list">{routeRows.map((stage,index)=>{const count=scoped.filter(a=>routeStage(a.status).key===stage.key).length;const share=scoped.length?Math.round(count/scoped.length*100):0;return <div className="report-route-row" key={stage.key}><span className="report-route-index">{String(index+1).padStart(2,'0')}</span><div><div className="spread"><strong>{neutralCopy(stage.label)}</strong><span className="mono">{count} {count===1?'case':'cases'}</span></div><div className="report-bar"><span style={{width:`${share}%`}}/></div></div></div>;})}</div>}
      </div>
      <div className="report-question report-types"><div className="support-surface-heading"><div><div><h2>{scope==='closed'?'Closed by application type':'Visible by application type'}</h2><p>Counts include only cases this account may read.</p></div></div></div><div className="report-type-list">{typeRows.map(row=><div className="report-type-row" key={neutralCopy(row.label)}><span>{neutralCopy(row.label)}</span><strong>{String(row.count).padStart(2,'0')}</strong></div>)}</div><div className="support-footnote"><Info size={14}/>Application distribution across the configured synthetic workflow routes.</div></div>
    </section>
    <section className="report-board" style={{marginTop:'20px'}}>
      <div className="report-question" style={{gridColumn:'1 / -1'}}>
        <div className="support-surface-heading"><div><div><h2>Active cases by region</h2><p>All {active.length} active dossiers, independent of the scope selected above.</p></div></div><span className="quiet-label"><ShieldCheck size={14}/>6 configured demonstration regions</span>{scope!=='active'&&<span className="document-tag pending">Always-active section</span>}</div>
        <div className="table-wrap" style={{marginTop:'12px'}}>
          <table>
            <thead>
              <tr>
                <th>Institutional Review Region</th>
                <th>Active Dossiers</th>
                <th>Under Scrutiny</th>
                <th>EVC Inspection Queue</th>
                <th>Overdue Escalations</th>
                <th>SLA Compliance</th>
              </tr>
            </thead>
            <tbody>
              {regions.map(r=>{
                const regApps=data.applications.filter(a=>a.region===r&&!['approved','rejected'].includes(a.status));
                const scrutinyCount=regApps.filter(a=>['submitted','resubmitted','under_scrutiny','deficiency_raised'].includes(a.status)).length;
                const evcCount=regApps.filter(a=>['evc_pending','evc_scheduled'].includes(a.status)).length;
                const regOverdue=regApps.filter(a=>(workingDaysUntil(a.sla_due_at)??99)<0).length;
                const onTime=regApps.filter(a=>(workingDaysUntil(a.sla_due_at)??99)>=0).length;
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
        <div className="support-footnote" style={{marginTop:'12px'}}><Info size={14}/>Regional totals are calculated from active dossiers in the visible scope.</div>
      </div>
    </section>
  </>;
}
export function Audit({data,openReceipt,repo,run,busy}:{data:Workspace;openReceipt?:(id:string)=>void;repo:Repository;run:Run;busy:boolean}){
  const applications=data.applications.slice().sort((a,b)=>a.ref_no.localeCompare(b.ref_no));
  const [selected,setSelected]=useState(applications.find(app=>app.id==='demo-app-0')?.id??applications[0]?.id??'');
  const [verification,setVerification]=useState<AuditVerification|null>(null);const [verifiedAt,setVerifiedAt]=useState('');const [replay,setReplay]=useState(false);
  const selectedApp=applications.find(app=>app.id===selected);
  const events=data.events.slice().sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
  const verify=()=>void run(async()=>{if(!selectedApp)return;setVerification(await repo.verifyAudit(selectedApp));setReplay(false);setVerifiedAt(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}));},'Chain verified.');
  const tamper=()=>void run(async()=>{if(!selectedApp)return;setVerification(await repo.tamperReplay(selectedApp));setReplay(true);setVerifiedAt(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}));},'Tamper replay ran on a copy. Stored events were not changed.');
  return <>
    <ViewHeader title="Decision receipts" summary="Who moved a dossier, under which role, and why." count={String(events.length).padStart(2,'0')} label="visible events"/>
    <section className="support-surface receipt-surface audit-chain-surface" aria-labelledby="chain-heading">
      <div className="support-surface-heading"><div><div><h2 id="chain-heading">Record verification</h2><p>Recompute the hash-linked event chain for one visible case.</p></div></div><span className="quiet-label"><ShieldCheck size={14}/>Stored events are append-only</span></div>
      <div className="audit-chain-controls"><label className="field">Case<select value={selected} onChange={event=>{setSelected(event.target.value);setVerification(null);setReplay(false);setVerifiedAt('');}} disabled={!applications.length}>{applications.map(app=><option key={app.id} value={app.id}>{app.ref_no} · {neutralCopy(app.title)}</option>)}</select></label><div className="inline"><button className="button" disabled={busy||!selectedApp} onClick={verify}>Verify chain</button></div></div>
      {repo.mode==='demo'&&<div className="demo-controls"><span className="demo-controls-label">Demo tool · simulation only</span><div className="inline">{!replay?<button className="text-button" disabled={busy||!selectedApp} onClick={tamper}>Simulate tamper</button>:<button className="text-button" disabled={busy} onClick={verify}>Reset replay</button>}</div><small>{replay?'The mismatch above came from a temporary copy; nothing stored was changed.':'Reproduces a mismatch on a temporary copy. Stored events are untouched.'}</small></div>}
      <div className={`audit-chain-status ${verification?verification.intact?'intact':'broken':'pending'}`}><div><span className="quiet-label">CHAIN STATUS</span><strong>{verification?verification.intact?'Chain verified. Event history intact.':`Integrity mismatch detected at event ${verification.broken_at??'?'}`:'Not verified'}</strong><p>{verification?`${verification.checked} events checked${replay?' on a temporary copy; stored events were not changed':' in the stored chain'}.`:'Select a case and verify its current chain head.'}</p><small className="chain-scope-note">Chain verification covers the stored event history only. It does not confirm the underlying claims or document validity.</small></div><div className="audit-chain-meta"><span className="mono">HEAD {verification?.head??'not computed'}</span>{verifiedAt&&<small>Last verified {verifiedAt}</small>}{replay&&<span className="document-tag pending">Replay on a copy</span>}</div></div>
    </section>
    <section className="support-surface receipt-surface">
      <div className="support-surface-heading"><div><div><h2>Receipt register</h2><p>Compact rows; expand for the full reason, actor, and record identity.</p></div></div><span className="quiet-label"><FileCheck2 size={14}/>Actor · reason · time</span></div>
      {events.length?<div className="receipt-list">{events.map(event=>{const application=data.applications.find(a=>a.id===event.application_id);const from=event.from_status?statusLabels[event.from_status]:'Created';const to=event.to_status?statusLabels[event.to_status]:'—';const recorded=new Date(event.created_at);return <details className="audit-row" key={event.id}><summary><span className="audit-time"><strong>{recorded.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</strong>{recorded.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span><span className="audit-case mono">{application?.ref_no??'UNKNOWN CASE'}</span><span className="audit-actor">{event.actor_role?.replaceAll('_',' ')??'system'} · {event.actor_id??'system'}</span><span className="audit-transition">{from} → {to}</span><span className="audit-action">{event.action.replaceAll('_',' ')}</span></summary><div className="audit-detail"><div><span className="quiet-label">REASON</span><p>{event.reason||'No reason recorded.'}</p></div><div><span className="quiet-label">CASE</span><p>{applicationInstitution(data,application)}</p></div><div><span className="quiet-label">ACTOR</span><p>{event.actor_role?.replaceAll('_',' ')??'system'} · {event.actor_id??'system'}</p></div><div><span className="quiet-label">RECORD</span><p className="mono">Event {event.id} · {recorded.toLocaleString('en-IN')}</p></div>{application&&['approved','rejected'].includes(application.status)&&openReceipt&&<button className="text-button" onClick={()=>openReceipt(application.id)}>Open decision receipt <ArrowRight size={13}/></button>}{Boolean(event.payload?.demo)&&<span className="document-tag">Synthetic demonstration event</span>}</div></details>;})}</div>:<Empty title="No receipts yet">Case actions will appear here.</Empty>}
      <div className="support-footnote"><ShieldCheck size={14}/>Every decision receipt is tied to a case reference and workflow version in the dossier.</div>
    </section>
  </>;
}
export function Settings({identity,repo}:{identity:Identity;repo:Repository}){
  return <>
    <DisplayControls/><ViewHeader title="Workspace settings" summary="Identity, role grants, and record controls."/>
    <Panel title="Workspace & identity" subtitle="Authorization is read from protected backend role records"><dl className="settings-list"><div><dt>Workspace</dt><dd>{repo.mode==='demo'?'Isolated browser demonstration':'Connected Supabase demo'}</dd></div><div><dt>Account</dt><dd>{neutralCopy(identity.name)}<small>{identity.email}</small></dd></div><div><dt>Granted roles</dt><dd>{identity.roles.map(r=><span key={r.role}>{roleLabels[r.role]} · {r.region??'National / institution scope'}<br/></span>)}</dd></div><div><dt>Data policy</dt><dd>Synthetic cases only. No real Institutional Review records.</dd></div></dl></Panel>
    <Panel title="Security controls" action={<ShieldCheck className="teal" size={20}/>}><div className="control-grid">{['Session validation & protected roles','Tenant and region row-level security','Atomic workflow transitions','Private, quarantined evidence','Append-only decision history','Version checks & retry protection'].map(text=><div key={text}><ShieldCheck size={18}/><span>{text}</span></div>)}</div><div className="callout warning"><strong>Validation environment</strong><p>This is a hardened prototype. Malware scanner integration, operational recovery drills, formal accessibility review, and regulatory sign-off remain release gates.</p></div></Panel>
    <div className="reference-links"><a href="https://www.example.invalid/design/0YuF68RLR5zwXZm9RzvR5q" target="_blank" rel="noreferrer">design-tool reference <ExternalLink size={13}/></a><a href="https://example.invalid/drive/folders/1OZZOYEuL9kt8mZhJpl8d3XlavEnwlR4I" target="_blank" rel="noreferrer">Engineering workspace <ExternalLink size={13}/></a></div>
  </>;
}
