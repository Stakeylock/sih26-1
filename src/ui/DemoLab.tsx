import {neutralCopy} from '../domain/presentation';
import {useEffect,useState} from 'react';
import {ArrowRight,CalendarClock,FastForward,FileStack,Fingerprint,GitBranch,Play,RefreshCw,RotateCcw,Ruler,ShieldCheck,TriangleAlert} from 'lucide-react';
import {ViewHeader} from './common';
import {formatDateTime} from './DisplayPreferences';
import {guideSteps} from './demoGuide';
import {advanceDemoClock,DEMO_CLOCK_EVENT,demoClockOffset,resetDemoClock} from '../domain/virtualClock';
import {NotificationTester} from './NotificationTester';
import {VoiceCallRehearsal} from './VoiceCallRehearsal';
import type {ClockReport} from '../domain/consequences';
import {EVC_REQUIRED_SEATS,type Repository,type Role,type Workspace} from '../domain/model';

const scenarioSteps=[
  {id:'schedule',label:'Schedule EVC visit'},
  {id:'assign',label:'Assign three members'},
  {id:'advance',label:'Advance clock 30 days'},
] as const;

const rehearsalStages=[
  {stage:'t_minus_90',label:'Example window before expiry',badge:'90 days before',recipient:'Case owner and reviewer',summary:'This sample window is counted back from a recorded expiry date. It does not set a notice deadline or evidence rule.'},
  {stage:'t_minus_30',label:'Example follow-up window',badge:'30 days before',recipient:'Case owner and reviewer',summary:'Review the entered expiry date and its linked evidence. This example performs no automatic case action.'},
  {stage:'t_0',label:'Recorded expiry date',badge:'Recorded date',recipient:'Case owner and assigned reviewer',summary:'This synthetic case reaches its entered document expiry date; a person reviews any evidence.'},
  {stage:'escalated_ro',label:'Example follow-up A',badge:'7 days after',recipient:'Assigned reviewer',summary:'A sample follow-up window based on this synthetic case’s recorded expiry.'},
  {stage:'escalated_hq',label:'Example follow-up B',badge:'15 days after',recipient:'Assigned reviewer',summary:'A second sample follow-up window based on this synthetic case’s recorded expiry.'}
];

const kindLabels={reminder:'Reminder',overdue:'Overdue',escalation:'Escalation',expiry:'Validity lapse'} as const;

export function DemoLab({data,repo,onStartTour,onOpenPrototype,onOpenFlow,onSwitch,onRefresh}:{data:Workspace;repo:Repository;onStartTour:()=>void;onOpenPrototype:()=>void;onOpenFlow:()=>void;onSwitch:(role:Role,route:string)=>void;onRefresh:()=>void}){
  const [rehearsalStep,setRehearsalStep]=useState<number|null>(null);
  const [offset,setOffset]=useState(()=>demoClockOffset());
  const [clockBusy,setClockBusy]=useState(false);
  const [clockError,setClockError]=useState<string|null>(null);
  const [clockReport,setClockReport]=useState<ClockReport|null>(null);
  const [scenarioStep,setScenarioStep]=useState<number|null>(null);
  const [scenarioCompleted,setScenarioCompleted]=useState<boolean[]>([]);
  const [scenarioBusy,setScenarioBusy]=useState(false);
  const [scenarioError,setScenarioError]=useState<string|null>(null);
  const [scenarioResults,setScenarioResults]=useState<{label:string;value:string}[]>([]);
  const [scenarioVisitId,setScenarioVisitId]=useState<string|null>(null);
  useEffect(()=>{
    const sync=()=>setOffset(demoClockOffset());
    window.addEventListener(DEMO_CLOCK_EVENT,sync);
    return ()=>window.removeEventListener(DEMO_CLOCK_EVENT,sync);
  },[]);
  const advance=(days:number)=>{
    if(clockBusy||repo.mode!=='demo')return;
    setClockBusy(true);setClockError(null);
    void repo.advanceClock!(days).then(report=>{
      advanceDemoClock(days);
      setClockReport(report);
      onRefresh();
    }).catch((error:unknown)=>{setClockError(error instanceof Error?error.message:'Demo calendar advance failed.');}).finally(()=>setClockBusy(false));
  };
  const reset=()=>{void import('../data/demo').then(module=>module.resetDemo());};
  const runScenarioStep=async(index:number)=>{
    if(scenarioBusy)return;
    setScenarioBusy(true);setScenarioError(null);
    try{
      const app=data.applications.find(item=>item.id==='demo-app-12');
      if(!app)throw new Error('demo-app-12 not found.');
      if(index===0){
        const start=new Date(Date.now()+7*86400000);
        const end=new Date(Date.parse(start.toISOString())+3*60*60*1000);
        await repo.scheduleEVC(app,{scheduledStart:start.toISOString(),scheduledEnd:end.toISOString(),mode:'ONLINE',note:'Demo scenario: scheduled EVC visit for judge walkthrough.'});
        const visits=await repo.getEVCVisits(app);
        const visit=visits.find(v=>v.status==='SCHEDULED');
        if(!visit)throw new Error('Scheduled visit not found.');
        setScenarioVisitId(visit.id);
        setScenarioResults([{label:'Visit scheduled',value:`${visit.id} · ${visit.mode} · ${formatDateTime(visit.scheduled_start)}`}]);
      } else if(index===1){
        if(!scenarioVisitId)throw new Error('No visit scheduled.');
        const members=EVC_REQUIRED_SEATS.map((seat,i)=>({expertId:`demo-evc-member-${i+1}` as string,seat}));
        await repo.assignEVCMembers(app,scenarioVisitId,members);
        setScenarioResults(prev=>[...prev,{label:'Members assigned',value:'Academician · Expert · Architect-Planning'}]);
      } else if(index===2){
        if(!scenarioVisitId)throw new Error('No visit scheduled.');
        const report=(await repo.advanceClock!(30)) as ClockReport & {dispatched:{reminders:number;overdue:number;escalations:number;expiries:number}};
        setScenarioResults(prev=>[...prev,{label:'Clock advanced +30 days',value:`${report.dispatched.reminders} reminders · ${report.dispatched.overdue} overdue · ${report.dispatched.escalations} escalations · ${report.dispatched.expiries} expiries`}]);
      }
      setScenarioCompleted(prev=>{const next=[...prev];next[index]=true;return next;});
      setScenarioStep(prev=>prev===null?0:prev+1);
    }catch(err){
      setScenarioError(err instanceof Error?err.message:'Scenario step failed.');
    }finally{
      setScenarioBusy(false);
    }
  };
  const resetScenario=()=>{
    setScenarioStep(null);setScenarioCompleted([]);setScenarioBusy(false);setScenarioError(null);setScenarioResults([]);setScenarioVisitId(null);void reset();
  };
  const steps=guideSteps(data);
  const counters=[['Reminders',clockReport?.reminders.length??null],['Overdue marks',clockReport?.overdue.length??null],['Escalations',clockReport?.escalations.length??null],['Validity lapses',clockReport?.expiries.length??null]] as const;
  const rows=clockReport?[...clockReport.overdue,...clockReport.escalations,...clockReport.expiries,...clockReport.reminders]:[];
  const proofRoute=[
    {id:'correction',label:'Evidence correction',detail:'Original response and re-check stay linked.'},
    {id:'human-review',label:'Human authority',detail:'A role-gated reviewer records the finding.'},
    {id:'obligation',label:'Continuing obligation',detail:'A post-decision condition remains visible.'},
    {id:'audit',label:'Audit integrity',detail:'Recorded events can be verified and replay-tested.'},
  ].map(item=>{const armed=item.id==='human-review'?steps.some(step=>(step.id==='scrutiny'||step.id==='decision')&&step.armed):steps.find(step=>step.id===item.id)?.armed??false;return {...item,armed};});
  const showcase=[
    {id:'map',label:'Trace the evidence map',detail:'See the recorded relationships between documents, claims, corrections, and obligations.',icon:GitBranch,role:'national_admin' as Role,route:'analysis',featured:true},
    {id:'case',label:'Open the proof case',detail:'Read the correction thread and its human review basis in the dossier.',icon:FileStack,role:'institution' as Role,route:'case/demo-app-0'},
    {id:'trust',label:'Verify the audit chain',detail:'Inspect the visible security boundaries and replay the stored event links.',icon:Fingerprint,role:'national_admin' as Role,route:'trust'},
    {id:'obligation',label:'Inspect continuing obligations',detail:'Follow a recorded post-decision condition after the case closes.',icon:Ruler,role:'national_admin' as Role,route:'compliance'},
  ];
  return <>
    <ViewHeader title="Demo lab" summary="Simulation controls for the synthetic workspace. Nothing here changes a real record."/>
    <section className="support-surface demo-showcase" aria-labelledby="demo-showcase-title">
      <div className="support-surface-heading"><div><span className="demo-showcase-kicker">JUDGE SHOWCASE</span><h2 id="demo-showcase-title">Start with the proof, then follow the record.</h2><p>Four live routes reveal the strongest evidence-backed features without creating state or changing permissions.</p></div><span className="quiet-label"><ShieldCheck size={14}/>Synthetic workspace</span></div>
      <div className="demo-showcase-grid">
        {showcase.map(item=>{const Icon=item.icon;return <button key={item.id} type="button" className={`demo-showcase-item${item.featured?' demo-showcase-featured':''}`} onClick={()=>onSwitch(item.role,item.route)}><span className="demo-showcase-icon"><Icon size={18}/></span><span className="demo-showcase-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight className="demo-showcase-arrow" size={16}/></button>;})}
      </div>
      <p className="support-footnote demo-showcase-note">Each action opens the existing workspace surface. The map, table, dossier, audit records, and obligation register remain the source of truth.</p>
    </section>
    <section className="support-surface demo-lab-clock">
      <div className="support-surface-heading">
        <div><h2>Demo calendar</h2><p>Shifts the workspace review clock ahead by whole days. The consequence planner then re-derives each open deadline from its recorded date as a dry run, and the outcome is recorded as SYSTEM notes in the affected cases.</p></div>
        <span className="quiet-label"><CalendarClock size={14}/>{offset>0?`+${offset} calendar day${offset===1?'':'s'}`:'Real onward time'}</span>
      </div>
      <div className="demo-lab-clock-actions">
        {[1,7,30].map(days=><button key={days} className="button outline" type="button" disabled={clockBusy} onClick={()=>advance(days)}><FastForward size={14}/>+{days} day{days===1?'':'s'}</button>)}
        <button className="button text" type="button" disabled={clockBusy||offset===0} onClick={()=>{setClockReport(null);resetDemoClock();}}><RotateCcw size={12}/>Reset calendar</button>
      </div>
      {clockError&&<p className="callout">{clockError}</p>}
      {clockReport&&<div className="demo-lab-clock-report" role="status">
        <div className="demo-lab-clock-counters">
          {counters.map(([label,count])=><div key={label} className="demo-clock-stat"><strong>{count??0}</strong><span>{label}</span></div>)}
        </div>
        {rows.length>0?<ul className="demo-lab-clock-rows">
          {rows.map((row,index)=><li key={`${row.target}-${row.on}-${index}`}>
            <span className={`document-tag ${row.kind==='reminder'?'pending':'demo'}`}>{kindLabels[row.kind]}</span>
            <div><strong>{row.ref?row.ref+' · ':''}{neutralCopy(row.title)}</strong><p>{row.detail}</p></div>
            <span className="mono">{row.on}</span>
          </li>)}
        </ul>:<p className="muted">No new deadline crossings fell inside the shifted window.</p>}
        <p className="support-footnote">Planning output derived only from recorded deadlines and validity dates. Cases show the same dates without the shifted clock; a SYSTEM note is recorded per affected case in the audit trail. Nothing is dispatched, verified, or approved.</p>
      </div>}
    </section>
    <section className="support-surface demo-lab-scenario">
      <div className="support-surface-heading">
        <div>
          <h2>End-to-end EVC + escalation demo</h2>
          <p>Walk a complete case through the system: schedule an EVC visit, assign the three required members, advance the demo clock 30 days, and watch obligations turn overdue with notifications dispatched.</p>
        </div>
        <span className="quiet-label"><ShieldCheck size={14}/>National administrator · demo mode</span>
      </div>
      <div className="demo-lab-scenario-controls">
        {scenarioSteps.map((step,index)=>(
          <button key={step.id} type="button" className={`button small ${scenarioStep===index?(scenarioBusy?'button secondary':'button'):scenarioCompleted[index]?'button secondary':'button outline'}`} disabled={scenarioBusy||(index>0&&!scenarioCompleted[index-1])} onClick={()=>runScenarioStep(index)}>
            <span className="demo-scenario-step-index">{String(index+1).padStart(2,'0')}</span>
            <span>{step.label}</span>
            {scenarioStep===index&&scenarioBusy&&<span className="mono"> · running…</span>}
          </button>
        ))}
        {scenarioStep===scenarioSteps.length&&<button className="button text small" type="button" onClick={resetScenario}><RotateCcw size={12}/>Reset scenario</button>}
      </div>
      {scenarioError&&<p className="callout">{scenarioError}</p>}
      {scenarioResults.length>0&&(
        <div className="demo-lab-scenario-results">
          <h3>Results</h3>
          {scenarioResults.map((r,idx)=>(<div key={idx} className="demo-scenario-result-row"><strong>{r.label}</strong><span className="mono">{r.value}</span></div>))}
        </div>
      )}
    </section>
    <div className="demo-lab-grid">
      <section className="support-surface demo-lab-card">
        <h2>Reset synthetic workspace</h2>
        <p>Clear this browser's demo data and reload the seeded cases, documents, claims, and events. Recorded review actions and uploaded demo files are discarded.</p>
        <button className="button outline" type="button" onClick={reset}><RefreshCw size={14}/>Reset synthetic workspace</button>
      </section>
      <section className="support-surface demo-lab-card">
        <h2>Guided story</h2>
        <p>Walk the eight-step handoff from institution submission to decision receipt. The story switches roles automatically and finishes on Overview.</p>
        <button className="button" type="button" onClick={onStartTour}><Play size={14}/>Start guided story</button>
      </section>
      <section className="support-surface demo-lab-card">
        <h2>Prototype worklist</h2>
        <p>Open the earlier attention-first worklist for comparison. Its actions leave the prototype and open the real case record.</p>
        <button className="button outline" type="button" onClick={onOpenPrototype}><TriangleAlert size={14}/>Open prototype worklist</button>
      </section>
      <section className="support-surface demo-lab-card">
        <h2>Relationship prototype</h2>
        <p>Read one synthetic case as claim → evidence → correction → review threads. Same record as the dossier; nothing here records or changes state.</p>
        <button className="button outline" type="button" onClick={onOpenFlow}><FileStack size={14}/>Open relationship prototype</button>
      </section>
      <section className="support-surface demo-lab-card">
        <NotificationTester data={data} repo={repo}/>
      </section>
    </div>
    <VoiceCallRehearsal repo={repo} data={data}/>
    <section className="support-surface demo-lab-guide">
      <div className="support-surface-heading"><div><h2>Judge proof route</h2><p>Four proof questions show what this prototype can demonstrate. Each item is derived from the live synthetic records; the guided steps below open the exact role and work surface.</p></div><span className="quiet-label">{steps.filter(step=>step.armed).length} of {steps.length} guided steps armed</span></div>
      <div className="demo-proof-route" aria-label="Judge proof route">
        {proofRoute.map((item,index)=><div key={item.id} className={`demo-proof-route-item ${item.armed?'armed':'unmet'}`}><span className="demo-proof-route-index">{String(index+1).padStart(2,'0')}</span><div><strong>{item.label}</strong><small>{item.armed?item.detail:'This proof step is not armed in the current workspace.'}</small></div><span className="demo-proof-route-state">{item.armed?'Ready':'Not armed'}</span></div>)}
      </div>
      <ol className="demo-lab-guide-steps">
        {steps.map((step,index)=><li key={step.id} className={step.armed?'armed':'unmet'}>
          <span className="demo-lab-guide-index"><strong>{String(index+1).padStart(2,'0')}</strong></span>
          <div className="demo-lab-guide-copy"><strong>{step.title}</strong><p>{step.armedBecause??step.unmetNote}</p><small>{step.roleLabel} · {step.routeLabel}</small></div>
          <button className="button small" type="button" disabled={!step.armed} aria-label={`Open as ${step.roleLabel}`} onClick={()=>onSwitch(step.role,step.route)}>{step.armed?'Open as '+step.roleLabel:'Step unmet'}</button>
        </li>)}
      </ol>
      <p className="support-footnote">Arming reads only the loaded workspace. Review actions are yours to record back in the opened surface.</p>
      <p className="support-footnote demo-lab-scope-note">"Not armed" can mean your current preview role cannot see those records, not that the capability is missing. Switching this page's workspace identity back to "National administrator" restores the full showcase; each step always opens under its own role.</p>
    </section>
    <section className="support-surface demo-lab-rehearsal">
      <div className="support-surface-heading">
        <div><h2>Deadline escalation rehearsal</h2><p>Step through the synthetic escalation ladder used in this demo. It does not dispatch notices or change an obligation.</p></div>
        <div className="demo-lab-rehearsal-actions">
          <span className="quiet-label"><FastForward size={14}/>Simulation only</span>
          {rehearsalStep!==null&&<button className="button small outline" type="button" onClick={()=>setRehearsalStep(null)}><RotateCcw size={12}/>Reset rehearsal</button>}
        </div>
      </div>
      <div className="demo-lab-rehearsal-body">
        <div className="demo-lab-milestones" role="group" aria-label="Escalation milestones">
          {rehearsalStages.map((stage,index)=><button key={stage.stage} type="button" className={`button small ${rehearsalStep===index?'':'outline'}`} aria-pressed={rehearsalStep===index} onClick={()=>setRehearsalStep(index)}><strong>{stage.badge}</strong> · {neutralCopy(stage.label)}</button>)}
        </div>
        {rehearsalStep!==null ? (
          <div className="demo-lab-result" role="status">
            <div className="demo-lab-result-head"><strong>{rehearsalStages[rehearsalStep].label}</strong><span className="document-tag">Simulated recipient: {rehearsalStages[rehearsalStep].recipient}</span></div>
            <p>{rehearsalStages[rehearsalStep].summary}</p>
          </div>
        ) : (
        <p className="demo-lab-hint">Select a milestone to preview the simulated notice, document state, and escalation tier.</p>
      )}
      </div>
    </section>
    <p className="support-footnote demo-lab-footnote">Use Preview as in the top bar to test a role boundary. All controls operate on synthetic local data; no real Institutional Review data or regulatory decision is used.</p>
    <p className="support-footnote demo-lab-footnote">Workspace snapshot {formatDateTime(Date.now())} · {data.applications.length} applications in scope. Planning reflects only what is recorded in this snapshot.</p>
  </>;
}
