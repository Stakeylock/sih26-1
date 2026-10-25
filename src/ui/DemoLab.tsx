import {neutralCopy} from '../domain/presentation';
import {useEffect,useState} from 'react';
import {CalendarClock,FastForward,FileStack,Play,RefreshCw,RotateCcw,TriangleAlert} from 'lucide-react';
import {ViewHeader} from './common';
import {guideSteps} from './demoGuide';
import {advanceDemoClock,DEMO_CLOCK_EVENT,demoClockOffset,resetDemoClock} from '../domain/virtualClock';
import type {ClockReport} from '../domain/consequences';
import type {Repository,Role,Workspace} from '../domain/model';

const rehearsalStages=[
  {stage:'t_minus_90',label:'T-90 advance notice',badge:'90d ahead',recipient:'Institution registrar',summary:'A simulated 90-day advance notice asks the institution to execute and register a renewed 30-year lease deed.'},
  {stage:'t_minus_30',label:'T-30 urgent notice',badge:'30d ahead',recipient:'Institution and regional bureau',summary:'The simulated document is flagged as expiring soon on the institution and regional views.'},
  {stage:'t_0',label:'T-0 expiry breached',badge:'Deadline day',recipient:'Regional officer',summary:'The simulated document expires and the institution enters a 15-day curing window.'},
  {stage:'escalated_ro',label:'T+7 regional escalation',badge:'T+7 days',recipient:'Regional officer',summary:'A simulated level-one escalation assigns the overdue undertaking to the regional officer for inquiry.'},
  {stage:'escalated_hq',label:'T+15 headquarters escalation',badge:'T+15 days',recipient:'Member secretary and committee',summary:'A simulated level-two escalation moves the overdue undertaking to headquarters review.'}
];

const kindLabels={reminder:'Reminder',overdue:'Overdue',escalation:'Escalation',expiry:'Validity lapse'} as const;

export function DemoLab({data,repo,onStartTour,onOpenPrototype,onOpenFlow,onSwitch,onRefresh}:{data:Workspace;repo:Repository;onStartTour:()=>void;onOpenPrototype:()=>void;onOpenFlow:()=>void;onSwitch:(role:Role,route:string)=>void;onRefresh:()=>void}){
  const [rehearsalStep,setRehearsalStep]=useState<number|null>(null);
  const [offset,setOffset]=useState(()=>demoClockOffset());
  const [clockBusy,setClockBusy]=useState(false);
  const [clockError,setClockError]=useState<string|null>(null);
  const [clockReport,setClockReport]=useState<ClockReport|null>(null);
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
  const steps=guideSteps(data);
  const counters=[['Reminders',clockReport?.reminders.length??null],['Overdue marks',clockReport?.overdue.length??null],['Escalations',clockReport?.escalations.length??null],['Validity lapses',clockReport?.expiries.length??null]] as const;
  const rows=clockReport?[...clockReport.overdue,...clockReport.escalations,...clockReport.expiries,...clockReport.reminders]:[];
  return <>
    <ViewHeader title="Demo lab" summary="Simulation controls for the synthetic workspace. Nothing here changes a real record."/>
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
    </div>
    <section className="support-surface demo-lab-guide">
      <div className="support-surface-heading"><div><h2>Guided walkthrough</h2><p>Six steps, each armed from the live synthetic records. A step switches the preview role and opens the exact work surface; unmet steps explain what is missing instead of inventing work.</p></div><span className="quiet-label">{steps.filter(step=>step.armed).length} of {steps.length} armed</span></div>
      <ol className="demo-lab-guide-steps">
        {steps.map((step,index)=><li key={step.id} className={step.armed?'armed':'unmet'}>
          <span className="demo-lab-guide-index"><strong>{String(index+1).padStart(2,'0')}</strong></span>
          <div className="demo-lab-guide-copy"><strong>{step.title}</strong><p>{step.armedBecause??step.unmetNote}</p><small>{step.roleLabel} · {step.routeLabel}</small></div>
          <button className="button small" type="button" disabled={!step.armed} aria-label={`Open as ${step.roleLabel}`} onClick={()=>onSwitch(step.role,step.route)}>{step.armed?'Open as '+step.roleLabel:'Step unmet'}</button>
        </li>)}
      </ol>
      <p className="support-footnote">Arming reads only the loaded workspace. Review actions are yours to record back in the opened surface.</p>
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
  </>;
}
