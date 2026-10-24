import {neutralCopy} from '../domain/presentation';
import {useState} from 'react';
import {FastForward,Play,RefreshCw,RotateCcw,TriangleAlert} from 'lucide-react';
import {ViewHeader} from './common';

const rehearsalStages=[
  {stage:'t_minus_90',label:'T-90 advance notice',badge:'90d ahead',recipient:'Institution registrar',summary:'A simulated 90-day advance notice asks the institution to execute and register a renewed 30-year lease deed.'},
  {stage:'t_minus_30',label:'T-30 urgent notice',badge:'30d ahead',recipient:'Institution and regional bureau',summary:'The simulated document is flagged as expiring soon on the institution and regional views.'},
  {stage:'t_0',label:'T-0 expiry breached',badge:'Deadline day',recipient:'Regional officer',summary:'The simulated document expires and the institution enters a 15-day curing window.'},
  {stage:'escalated_ro',label:'T+7 regional escalation',badge:'T+7 days',recipient:'Regional officer',summary:'A simulated level-one escalation assigns the overdue undertaking to the regional officer for inquiry.'},
  {stage:'escalated_hq',label:'T+15 headquarters escalation',badge:'T+15 days',recipient:'Member secretary and committee',summary:'A simulated level-two escalation moves the overdue undertaking to headquarters review.'}
];

export function DemoLab({onStartTour,onOpenPrototype}:{onStartTour:()=>void;onOpenPrototype:()=>void}){
  const [rehearsalStep,setRehearsalStep]=useState<number|null>(null);
  const reset=()=>{void import('../data/demo').then(module=>module.resetDemo());};
  return <>
    <ViewHeader title="Demo lab" summary="Simulation controls for the synthetic workspace. Nothing here changes a real record."/>
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
    </div>
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
