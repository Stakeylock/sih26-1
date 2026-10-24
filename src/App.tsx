import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BarChart3,Bell,Building2,ChevronDown,ClipboardList,FileClock,Fingerprint,GitBranch,LayoutDashboard,LogOut,Menu,Play,RefreshCw,Settings2,ShieldCheck,ShieldEllipsis,TriangleAlert,X,CalendarClock} from 'lucide-react';
import {repository} from './data/repository';
import {roleLabels,routeStages,type Identity,type Repository,type Role,type Workspace} from './domain/model';
import {Overview} from './ui/Overview';
import {Applications,NewApplication,type Run} from './ui/Applications';
import {CaseWorkspace} from './ui/CaseWorkspace';
import {Alerts,Audit,Compliance,Reports,Settings,Visits,Workflows} from './ui/WorkspaceViews';
import {CommandPalette} from './ui/CommandPalette';
import {Brand} from './ui/common';
import {Welcome} from './ui/Welcome';
import {GuidedStory,tourSteps} from './ui/GuidedStory';
import {Receipt} from './ui/Receipt';
import {TrustCenter} from './ui/TrustCenter';
import {PrototypeOverview} from './ui/PrototypeOverview';
import {PrototypeDossier} from './ui/PrototypeDossier';
import {ThemeToggle,useTheme} from './ui/theme';
import './ui/prototype.css';
const navigation=[{id:'overview',label:'Overview',icon:LayoutDashboard},{id:'applications',label:'Applications',icon:ClipboardList},{id:'workflows',label:'Approval routes',icon:GitBranch},{id:'visits',label:'Verification visits',icon:CalendarClock},{id:'compliance',label:'Compliance',icon:ShieldCheck},{id:'alerts',label:'Alerts & escalations',icon:Bell},{id:'reports',label:'Reports',icon:BarChart3},{id:'trust',label:'Trust Center',icon:Fingerprint},{id:'audit',label:'Audit logs',icon:FileClock},{id:'settings',label:'Settings',icon:Settings2}];
type Section={id:string;label:string;home:string;items:string[]};
// Four primary sections instead of ten equal-weight destinations; destinations show contextually below the section row.
const sections:Section[]=[
  {id:'workbench',label:'Workbench',home:'overview',items:['overview','prototype']},
  {id:'approvals',label:'Approvals',home:'applications',items:['applications','workflows','visits']},
  {id:'compliance',label:'Compliance',home:'compliance',items:['compliance']},
  {id:'oversight',label:'Oversight',home:'reports',items:['reports','alerts','trust','audit']},
];
const destinations=[...navigation,{id:'prototype',label:'Needs attention',icon:TriangleAlert}];
const destinationById=Object.fromEntries(destinations.map(item=>[item.id,item]));
function sectionOf(page:string):Section|null{
  const direct=sections.find(section=>section.items.includes(page));
  if(direct)return direct;
  if(['case','receipt','new'].includes(page))return sections[1];
  if(page.startsWith('prototype'))return sections[0];
  return null;
}
const titles:Record<string,string>={overview:'Overview',applications:'Applications',new:'New approval application',case:'Application workspace',receipt:'Decision receipt',workflows:'Approval routes',visits:'Verification visits',compliance:'Compliance monitoring',alerts:'Alerts & escalations',reports:'Reports & insights',trust:'Trust Center',audit:'Audit logs',settings:'Workspace settings',prototype:'Applications requiring attention',['prototype/case']:'Application workspace'};
export default function App(){
  const [role,setRole]=useState<Role>('national_admin');const [repo,setRepo]=useState<Repository|null>(null);const [identity,setIdentity]=useState<Identity|null>(null);const [data,setData]=useState<Workspace|null>(null);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const locked=useRef(false);
  const [route,setRoute]=useState(()=>location.hash.slice(1));const [mobile,setMobile]=useState(false);const [query,setQuery]=useState('');const generation=useRef(0);
  const [tourOpen,setTourOpen]=useState(false);const [tourStep,setTourStep]=useState(0);
  const {theme,toggleTheme}=useTheme();
  const navigate=useCallback((page:string)=>{location.hash=page;setMobile(false);},[]);
  const open=(id:string)=>navigate(`case/${encodeURIComponent(id)}`);
  const closeTour=useCallback(()=>{setTourOpen(false);setTourStep(0);},[]);
  const startTour=useCallback(()=>{setTourStep(0);setTourOpen(true);navigate('overview');},[navigate]);
  const nextTourStep=useCallback(()=>{if(tourStep>=tourSteps.length-1){closeTour();navigate('overview');}else setTourStep(step=>step+1);},[tourStep,closeTour,navigate]);
  const scrollPositions=useRef(new Map<string,number>());
  const routeRef=useRef(route);
  useEffect(()=>{if('scrollRestoration'in history)history.scrollRestoration='manual';const handler=()=>{scrollPositions.current.set(routeRef.current,window.scrollY);setRoute(location.hash.slice(1));};window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler);},[]);
  // New routes open at the top; returning to a page visited this session restores its position.
  useLayoutEffect(()=>{routeRef.current=route;window.scrollTo(0,scrollPositions.current.get(route)??0);},[route]);
  useEffect(()=>{if(!tourOpen)return;const step=tourSteps[tourStep];if(!step)return;if(role!==step.role)setRole(step.role);if(route!==step.route)navigate(step.route);},[tourOpen,tourStep,role,route,navigate]);
  useEffect(()=>{let alive=true;let unsubscribe=()=>{};const current=++generation.current;
    setLoading(true);setData(null);setIdentity(null);setError('');
    void repository(role).then(async selected=>{if(!alive)return;setRepo(selected);const load=async()=>{try{const user=await selected.identity();const workspace=user?await selected.workspace():null;if(alive&&generation.current===current){setIdentity(user);setData(workspace);setLoading(false);}}catch(e){if(alive){setError(e instanceof Error?e.message:'Unable to load the workspace.');setLoading(false);}}};await load();if(alive)unsubscribe=selected.subscribeAuth(()=>void load());}).catch(e=>{if(alive){setError(e instanceof Error?e.message:'Configuration failed.');setLoading(false);}});
    return()=>{alive=false;unsubscribe();};
  },[role]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);
  const reload=async()=>{if(!repo)return;setError('');try{const user=await repo.identity();setIdentity(user);setData(user?await repo.workspace():null);}catch(e){setError(e instanceof Error?e.message:'Unable to reload.');}};
  const run:Run=async(operation,message)=>{if(locked.current)return false;locked.current=true;setBusy(true);setError('');try{await operation();if(repo){const workspace=await repo.workspace();setData(workspace);}setNotice(message);return true;}catch(e){setError(e instanceof Error?e.message:'The operation failed. Please reload and try again.');return false;}finally{locked.current=false;setBusy(false);}};
  const page=route.split('/')[0];const caseId=decodeURIComponent(route.split('/')[1]??'');const application=data?.applications.find(a=>a.id===caseId);
  const activeSection=sectionOf(page);const showContextPills=Boolean(activeSection&&activeSection.items.includes(page));
  const prototypePage=route==='prototype'||route.startsWith('prototype/case');
  const prototypeCaseId=route.startsWith('prototype/case/')?decodeURIComponent(route.slice('prototype/case/'.length)):'';
  const prototypeApplication=prototypeCaseId?data?.applications.find(a=>a.id===prototypeCaseId):null;
  const welcome=!route||route==='welcome';const tourOverlay=tourOpen?<GuidedStory step={tourStep} onNext={nextTourStep} onExit={closeTour}/>:null;
  if(welcome)return <><Welcome onEnter={()=>navigate('overview')} onStory={startTour} theme={theme} toggleTheme={toggleTheme}/>{tourOverlay}</>;
  if(loading)return <><Startup page={page}/>{tourOverlay}</>;
  if(!identity||!repo)return <Login repo={repo} error={error} setError={setError} signedIn={reload}/>;
  const initials=identity.name.split(' ').map(n=>n[0]).slice(0,2).join('');
  return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>Skip to main content</a>
    {mobile&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
    <div className="mainnav">
      <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobile(true)}><Menu size={20}/></button>
      <Brand onClick={()=>navigate('welcome')}/>
      <span className="workspace-caption">SIH26262 · DEMONSTRATION</span>
      <nav aria-label="Section navigation" className="section-nav">
        {sections.map(section=><button key={section.id} type="button" aria-current={activeSection?.id===section.id?'true':undefined} className={activeSection?.id===section.id?'section-tab active':'section-tab'} onClick={()=>navigate(section.home)}>{section.label}{section.id==='oversight'&&data?.notifications.some(n=>!n.read_at)&&<span className="nav-dot"/>}</button>)}
      </nav>
      <div className="mainnav-actions">
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} className="mainnav-icon"/>
        <button className="icon-button mainnav-icon" title="Settings" aria-label="Settings" onClick={()=>navigate('settings')}><Settings2 size={17}/></button>
        <span className="avatar small-avatar">{initials}</span>
        <span className="mainnav-identity"><strong>{identity.name}</strong><small>{roleLabels[identity.roles[0]?.role??'institution']}</small></span>
        <button className="sidebar-logout" title="Sign out" aria-label="Sign out" disabled={repo.mode==='demo'} onClick={()=>void repo.signOut().then(reload).catch(e=>setError(String(e)))}><LogOut size={16}/></button>
      </div>
    </div>
    <div className="main-shell"><header className="topbar"><nav aria-label="Workspace navigation" className="topnav">{showContextPills&&activeSection?activeSection.items.map(id=>{const item=destinationById[id];return <button key={id} type="button" aria-current={page===id?'page':undefined} className={page===id?'nav-item active':'nav-item'} onClick={()=>navigate(id)}><item.icon size={15}/><span>{id==='alerts'?'Alerts':id==='audit'?'Audit':item.label}</span>{id==='alerts'&&data?.notifications.some(n=>!n.read_at)&&<span className="nav-dot"/>}</button>;}):<>{activeSection&&<button type="button" className="nav-item context-back" onClick={()=>navigate(activeSection.home)}><ArrowLeft size={14}/>{destinationById[activeSection.home].label}</button>}<span className="breadcrumb"><strong>{titles[page]??'Overview'}</strong></span></>}</nav><div className="topbar-actions"><button className="text-button topbar-tour" onClick={startTour}><Play size={14}/>Tour</button><CommandPalette data={data} navigate={navigate}/><details className="demo-disclosure"><summary aria-label="Demo environment details"><ShieldEllipsis size={16}/><span className="demo-disclosure-title"><strong>{repo.mode==='demo'?'Demo environment':'Connected demo'}</strong><small>Synthetic cases only.</small></span><span className="demo-tag">DETAILS</span></summary><div className="demo-details">No real AICTE data or regulatory decisions are used here. Actions are synthetic and preserve the same role boundaries, evidence checks, and audit language as the connected path.</div></details><button className="icon-button refresh" title="Refresh workspace" aria-label="Refresh workspace" onClick={()=>void reload()} disabled={busy}><RefreshCw size={17}/></button>{repo.mode==='demo'?<label className="demo-role"><span>Preview as</span><select aria-label="Demo role" value={role} onChange={e=>{setRole(e.target.value as Role);navigate('overview');}}>{Object.entries(roleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><ChevronDown size={13}/></label>:<span className="connected-label"><span className="live-dot"/>Connected demo</span>}<button className="icon-button notification-button" aria-label="Open notifications" onClick={()=>navigate('alerts')}><Bell size={18}/>{data?.notifications.some(n=>!n.read_at)&&<i/>}</button></div></header>
    <main id="main-content" className="content" tabIndex={-1}>
      {error&&<div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      <div className="page-body" key={route}>
      {data?(prototypePage?(<div className="prototype-shell">{prototypePage&&prototypeApplication?<PrototypeDossier app={prototypeApplication} data={data} identity={identity} repo={repo} busy={busy} back={()=>navigate('prototype')} openReceipt={(id)=>navigate(`receipt/${encodeURIComponent(id)}`)} openCase={(id)=>navigate(`case/${encodeURIComponent(id)}`)}/>:<PrototypeOverview data={{applications:data.applications,institutions:Object.fromEntries(data.institutions.map(i=>[i.id,{name:i.name}])),documents:data.documents,claims:data.claims,deficiencies:data.deficiencies}} identity={identity} open={(id)=>id==='new'?navigate('new'):navigate(`prototype/case/${encodeURIComponent(id)}`)}/>}</div>):<>
        {page==='overview'&&<Overview data={data} identity={identity} open={open} navigate={navigate}/>}
        {page==='applications'&&<Applications data={data} query={query} setQuery={setQuery} open={open} create={()=>navigate('new')} identity={identity}/>}
        {page==='new'&&identity.roles.some(r=>r.role==='institution')&&<NewApplication data={data} identity={identity} repo={repo} run={run} open={open} back={()=>navigate('applications')} busy={busy}/>}
        {page==='case'&&(application?<CaseWorkspace key={caseId} app={application} data={data} identity={identity} repo={repo} run={run} busy={busy} back={()=>navigate('applications')} openReceipt={(id)=>navigate(`receipt/${encodeURIComponent(id)}`)} openCase={(id)=>open(id)}/>:<div className="empty"><h2>Application unavailable</h2><p>This case may be outside your permitted scope.</p><button className="button outline" onClick={()=>navigate('applications')}>Back to applications</button></div>)}
        {page==='receipt'&&(application?<Receipt app={application} data={data} repo={repo} run={run} busy={busy} back={()=>navigate('overview')} openCase={()=>open(application.id)}/>:<div className="empty"><h2>Receipt unavailable</h2><p>This decision may be outside your permitted scope.</p><button className="button outline" onClick={()=>navigate('overview')}>Back to overview</button></div>)}
        {page==='workflows'&&<Workflows data={data} open={open}/>}
        {page==='visits'&&<Visits data={data} open={open}/>}
        {page==='compliance'&&<Compliance data={data} identity={identity} repo={repo} run={run} busy={busy} navigate={navigate}/>}
        {page==='alerts'&&<Alerts data={data} repo={repo} run={run} busy={busy} navigate={navigate}/>}
        {page==='reports'&&<Reports data={data}/>}
        {page==='trust'&&<TrustCenter data={data} identity={identity} repo={repo} run={run} busy={busy}/>}
        {page==='audit'&&<Audit data={data} repo={repo} run={run} busy={busy} openReceipt={(id)=>navigate(`receipt/${encodeURIComponent(id)}`)}/>}
        {page==='settings'&&<Settings identity={identity} repo={repo}/>}
        {!titles[page]&&<div className="empty"><h2>Page unavailable</h2><button className="button outline" onClick={()=>navigate('overview')}>Return to overview</button></div>}
      </>):<div className="empty"><h2>Workspace could not be loaded</h2><button className="button outline" onClick={()=>void reload()}>Try again</button></div>}
      </div>
      <footer><span><LockIcon/>Demonstration environment · v0.4</span></footer>
    </main></div>
    <aside className={mobile?'sidebar mobile-open':'sidebar'}><Brand onClick={()=>navigate('welcome')}/><div className="workspace-caption">SIH26262 · DEMONSTRATION</div><nav aria-label="Workspace menu">{sections.map(section=><div className="nav-group" key={section.id}><div className="nav-section">{section.label}</div>{section.items.map(id=>{const item=destinationById[id];return <button key={id} type="button" aria-current={page===id?'page':undefined} className={page===id?'nav-item active':'nav-item'} onClick={()=>navigate(id)}><item.icon size={17}/><span>{item.label}</span>{id==='alerts'&&data?.notifications.some(n=>!n.read_at)&&<span className="nav-dot"/>}</button>;})}</div>)}</nav><div className="sidebar-bottom"><div className="sidebar-profile"><span className="avatar">{initials}</span><div><strong>{identity.name}</strong><small>{roleLabels[identity.roles[0]?.role??'institution']}</small></div><button className="sidebar-logout" title="Sign out" aria-label="Sign out" disabled={repo.mode==='demo'} onClick={()=>void repo.signOut().then(reload).catch(e=>setError(String(e)))}><LogOut size={16}/></button></div></div></aside>
    {tourOverlay}{notice&&<div className="toast" role="status" aria-label="Workspace notification"><CheckIcon/>{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={15}/></button></div>}
  </div>;
}
function Startup({page}:{page:string}){
  return <div className="startup startup-route"><Brand/><div className="startup-stations" aria-hidden="true">{routeStages.map((stage,index)=><span key={stage.key} style={{animationDelay:`${index*110}ms`}}><i/><small>{stage.label}</small></span>)}</div><p>Opening {titles[page]??'your workspace'}.</p></div>;
}
function CheckIcon(){return <ShieldCheck size={19}/>;}
function LockIcon(){return <ShieldCheck size={13}/>;}
function Login({repo,error,setError,signedIn}:{repo:Repository|null;error:string;setError:(e:string)=>void;signedIn:()=>Promise<void>}){
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);
  return <div className="login-page"><section className="login-intro"><Brand/><div><span className="quiet-label">SIH26262 · DEMONSTRATION</span><h1>Right process.<br/>Right authority.<br/><em>Right time.</em></h1><p>One workspace for institutional applications, evidence, and accountable human decisions.</p><ul>{['A verified identity for every role','Private documents, scoped to each case','A complete record of every decision'].map(t=><li key={t}><ShieldCheck size={18}/>{t}</li>)}</ul></div><small>Synthetic data only. Not an AICTE government service.</small></section><main className="login-main"><div className="login-card"><span className="login-icon"><Building2 size={25}/></span><div className="eyebrow">FLOWPILOT WORKSPACE</div><h2>Welcome back</h2><p>Sign in to your connected demonstration workspace.</p>{error&&<div className="error-banner" role="alert">{error}</div>}<form onSubmit={e=>{e.preventDefault();setBusy(true);setError('');void repo?.signIn(email,password).then(signedIn).catch(e=>setError(e instanceof Error?e.message:'Sign-in failed.')).finally(()=>setBusy(false));}}><label className="field">Email address<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@institution.example"/></label><label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/></label><button className="button" disabled={busy||!repo}>{busy?'Signing in…':'Sign in securely'}<ArrowRight size={17}/></button></form><div className="login-hint"><ShieldCheck size={18}/><span>Access is assigned by an administrator. Your selected role cannot change your permissions.</span></div><p className="login-small">Use an explicitly provisioned demo account. Contact your workspace administrator for access.</p></div></main></div>;
}
