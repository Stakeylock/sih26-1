import {neutralCopy} from '../domain/presentation';
import {useState} from 'react';
import {ArrowLeft,ArrowRight,Check,Plus,Search} from 'lucide-react';
import {nextAuthority,regions,routeStage,statusLabels,typeLabels,type AppType,type Application,type Identity,type Repository,type Workspace} from '../domain/model';
import { workingDaysUntil } from '../domain/clock';
import {ApplicationRow} from './Overview';
import {Badge,Due,Empty,Panel,ViewHeader} from './common';
export type Run=(operation:()=>Promise<void>,message:string)=>Promise<boolean>;
export function Applications({data,query,setQuery,open,create,identity}:{data:Workspace;query:string;setQuery:(q:string)=>void;open:(id:string)=>void;create:()=>void;identity:Identity}){
  const [status,setStatus]=useState('all');const [region,setRegion]=useState('all');const [scope,setScope]=useState<'active'|'all'|'closed'>('active');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const isActive=(a:Application)=>!['draft','approved','rejected'].includes(a.status);
  const scopeCounts={active:data.applications.filter(isActive).length,closed:data.applications.filter(a=>['approved','rejected'].includes(a.status)).length,all:data.applications.length};
  // Operational order: overdue first (most overdue on top), then nearest upcoming deadline; no-date records sort last.
  const days=(a:Application)=>{const value=workingDaysUntil(a.sla_due_at);return value===null?9999:value;};
  const sorted=[...data.applications].filter(a=>scope==='all'||(scope==='active'?isActive(a):['approved','rejected'].includes(a.status))).sort((a,b)=>days(a)-days(b));
  const list=sorted.filter(a=>(status==='all'||a.status===status)&&(region==='all'||a.region===region)&&`${a.ref_no} ${neutralCopy(a.title)} ${data.institutions.find(i=>i.id===a.institution_id)?.name}`.toLowerCase().includes(query.toLowerCase()));
  return <><ViewHeader title="Applications" summary="Visible dossiers by scope — overdue and nearest deadline first." count={String(data.applications.length).padStart(2,'0')} label="visible applications"/><Panel title="Application register" subtitle={`${list.length} of ${data.applications.length} visible applications`} action={identity.roles.some(r=>r.role==='institution')?<button className="button" onClick={create}><Plus size={16}/>New application</button>:undefined}>
    <div className="register-scope" role="group" aria-label="Register scope">{([['active','Active'],['all','All'],['closed','Closed']] as const).map(([key,label])=><button key={key} type="button" aria-pressed={scope===key} className={scope===key?'register-chip selected':'register-chip'} onClick={()=>setScope(key)}>{label} <b>{scopeCounts[key]}</b></button>)}<span className="register-sorted-label">Sorted: overdue first · nearest deadline</span></div>
    <div className="filters"><label className="search-input"><Search size={16}/><input aria-label="Search applications" placeholder="Search by ID, institution, or title." value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select aria-label="Filter by region" value={region} onChange={e=>setRegion(e.target.value)}><option value="all">All regions</option>{regions.map(r=><option key={r}>{r}</option>)}</select></div>
    {selectedId != null && list.some(a => a.id === selectedId) && (() => { const sel = list.find(a => a.id === selectedId)!; return (<div className="applications-worklist-preview"><button type="button" className="applications-preview-back" onClick={()=>setSelectedId(null)} aria-label="Clear selected case preview"><span className="sr-only">Clear preview</span><ArrowLeft size={13}/></button><div><span className="mono">{sel.ref_no}</span><Badge status={sel.status}/></div><strong>{data.institutions.find(i=>i.id===sel.institution_id)?.name??'Demo institution'}</strong><p>{neutralCopy(sel.title)}</p><dl className="applications-preview-facts"><div><dt>Stage</dt><dd>{routeStage(sel.status).label}</dd></div><div><dt>Region</dt><dd>{sel.region}</dd></div><div><dt>Deadline</dt><dd><Due app={sel}/></dd></div><div><dt>Next authority</dt><dd>{nextAuthority(sel.status)}</dd></div></dl><button className="button outline small" onClick={()=>open(selectedId!)}>Open <ArrowRight size={14}/></button></div>); })()}
    {list.length?<><div className="table-wrap applications-table"><table><thead><tr><th>Application / institution</th><th>Region</th><th>Current stage</th><th>Status</th><th>Next deadline</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{list.map(a=><ApplicationRow key={a.id} app={a} institution={data.institutions.find(i=>i.id===a.institution_id)?.name??'Demo institution'} open={open} selectedId={selectedId ?? undefined}/>)}</tbody></table></div><div className="application-mobile-list">{list.map(app=>{const institution=data.institutions.find(i=>i.id===app.institution_id)?.name??'Demo institution';const stage=routeStage(app.status);return <article className={`application-mobile-card${selectedId===app.id?' data-selected':''}`} data-selected={selectedId===app.id} key={app.id} onClick={()=>setSelectedId(selectedId===app.id?null:app.id)}><div className="application-mobile-card-top"><span className="mono">{app.ref_no}</span><Badge status={app.status}/></div><strong>{institution}</strong><p>{neutralCopy(app.title)}</p><dl className="application-mobile-meta"><div><dt>Stage</dt><dd>{neutralCopy(stage.label)}</dd></div><div><dt>Region</dt><dd>{app.region}</dd></div><div><dt>Deadline</dt><dd><Due app={app}/></dd></div></dl><button className="button outline" onClick={e=>{e.stopPropagation();open(app.id);}} aria-label={`Open ${app.ref_no}`}>Open <ArrowRight size={15}/></button></article>;})}</div></>:<Empty title="No matching applications in this scope">Try the All chip, another search, or clear the status and region filters.</Empty>}
  </Panel></>;
}
export function NewApplication({data,identity,repo,run,open,back,busy}:{data:Workspace;identity:Identity;repo:Repository;run:Run;open:(id:string)=>void;back:()=>void;busy:boolean}){
  const [step,setStep]=useState(0);const [type,setType]=useState<AppType>('new_programme');const [title,setTitle]=useState('');
  const [intake,setIntake]=useState('60');
  const existing=data.institutions.find(i=>i.owner_id===identity.id);
  const [profile,setProfile]=useState({name:existing?.name??'',aicte_ref:existing?.aicte_ref??'DEMO-',region:existing?.region??'South',state:existing?.state??''});
  const template=data.templates.find(t=>t.app_type===type&&t.status==='published');
  const hasIntake=Boolean(template?.definition.required_fields.some(field=>field.key==='intake'));
  const invalidIntake=hasIntake&&!/^[1-9][0-9]{0,5}$/.test(intake);
  async function create(){let id='';const success=await run(async()=>{
    if(!existing)await repo.createInstitution(profile);
    id=await repo.createApplication(type,title,hasIntake?{intake}:{});
  },'Draft created with your entered details.');if(success)open(id);}
  return <><button className="text-button back" onClick={back}><ArrowLeft size={16}/>Back to applications</button>
    <ViewHeader title="New approval application" summary="Create a synthetic dossier through a published route."/>
    <div className="wizard-steps">{['Select category','Institution details','Upload evidence','Review & submit'].map((label,i)=><span key={label} className={i===step?'current':i<step?'done':''}><b>{i<step?<Check size={13}/>:String(i+1).padStart(2,'0')}</b>{label}</span>)}</div>
    <Panel title={step===0?'Choose an application category':'Tell us about your institution'} subtitle="Synthetic information only. This workspace does not issue regulatory decisions.">
      <form className="application-form" onSubmit={event=>{event.preventDefault();if(invalidIntake)return;if(step===0)setStep(1);else void create();}}>
        {step===0?<>
          <div className="category-options">{Object.entries(typeLabels).map(([key,label])=><label key={key} className={type===key?'category selected':'category'}><input type="radio" name="category" value={key} checked={type===key} onChange={()=>setType(key as AppType)}/><span><strong>{label}</strong><small>Version 1 · Human review required</small></span></label>)}</div>
          <label className="field">Application title<input value={title} onChange={event=>setTitle(event.target.value)} minLength={5} maxLength={200} required placeholder="Demo programme approval · 2026–27"/></label>
          {hasIntake&&<label className="field">Proposed Annual Intake (Seats)<input type="number" min={1} max={999999} step={1} value={intake} onChange={event=>setIntake(event.target.value)} required aria-describedby="intake-hint"/><small id="intake-hint">Enter a positive whole number. This is a synthetic draft value; eligibility is determined by the configured review rules.</small></label>}
        </>:<>
          <div className="form-grid"><label className="field">Institution name<input value={neutralCopy(profile.name)} disabled={Boolean(existing)} onChange={event=>setProfile({...profile,name:event.target.value})} minLength={3} maxLength={200} required placeholder="Demo Cedar Technical Institute"/></label>
          <label className="field">Synthetic institution ID<input value={profile.aicte_ref} disabled={Boolean(existing)} onChange={event=>setProfile({...profile,aicte_ref:event.target.value})} pattern="DEMO-[A-Z0-9-]{3,40}" required aria-describedby="id-hint"/><small id="id-hint">Use DEMO- followed by a synthetic identifier.</small></label>
          <label className="field">Region<select value={profile.region} disabled={Boolean(existing)} onChange={event=>setProfile({...profile,region:event.target.value})}>{regions.map(region=><option key={region}>{region}</option>)}</select></label>
          <label className="field">State<input value={profile.state} disabled={Boolean(existing)} onChange={event=>setProfile({...profile,state:event.target.value})} minLength={2} required/></label></div>
          <div className="route-note"><strong>Configured demo route</strong><p>{template?.definition.stages.map(stage=>stage.label).join(' → ')}</p><small>The published workflow is snapshotted when the draft is created.</small></div>
        </>}
        <div className="form-actions">{step===1&&<button type="button" className="button secondary" onClick={()=>setStep(0)}>Back</button>}<button className="button" disabled={busy||!template||invalidIntake}>{busy?'Creating…':step===0?'Continue to institution details':'Save draft & continue to evidence'}<ArrowRight size={16}/></button></div>
      </form>
    </Panel>
  </>;
}
