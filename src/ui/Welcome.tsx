import {ArrowRight,Clock3,GitBranch,LockKeyhole,Play,ReceiptText,ScanLine,ShieldCheck} from 'lucide-react';
import {routeStages} from '../domain/model';
import {Badge,Brand} from './common';

export function Welcome({onEnter,onStory}:{onEnter:()=>void;onStory:()=>void}){
  return <div className="welcome">
    <header className="welcome-top"><Brand/><div className="welcome-top-meta"><span>SIH26262 / SYNTHETIC DEMONSTRATION</span><button className="text-button" onClick={onEnter}>Enter workspace <ArrowRight size={15}/></button></div></header>
    <main className="welcome-main">
      <section className="welcome-copy" aria-labelledby="welcome-title">
        <span className="welcome-kicker">AICTE APPROVAL OPERATIONS / 2026-27</span>
        <h1 id="welcome-title">The file moves.<br/><em>The record stays.</em></h1>
        <p className="welcome-lede">FlowPilot is a human-in-the-loop operations layer for AICTE approvals. One dossier, a visible route, a named owner at every handoff, and a receipt for every decision.</p>
        <div className="welcome-actions"><button className="button welcome-story-button" onClick={onStory}><Play size={15}/>Run the 90-second story</button><button className="button outline" onClick={onEnter}>Open the dispatch board <ArrowRight size={15}/></button></div>
        <dl className="welcome-proof">
          <div><dt><span>01</span>One dossier</dt><dd>Institution, evidence, route, and decision in one record.</dd></div>
          <div><dt><span>02</span>Named hands</dt><dd>Every stage names the role that owns the next move.</dd></div>
          <div><dt><span>03</span>Receipts</dt><dd>Actor, reason, time, and workflow version are append-only.</dd></div>
        </dl>
      </section>
      <section className="welcome-visual" aria-label="Animated preview of a case moving through the approval route">
        <div className="welcome-visual-top"><span className="live-dot"/>LIVE CASE <span className="mono">DEMO-2026-1001</span><span className="welcome-synthetic">SYNTHETIC</span></div>
        <article className="welcome-case-card"><div className="welcome-case-top"><span className="mono">DEMO-2026-1001</span><Badge status="under_scrutiny"/></div><strong>Cedar Technical Institute</strong><span>Self-disclosure extension · 2026-27</span><div className="welcome-case-meta"><span><Clock3 size={13}/>2d remaining</span><span><ShieldCheck size={13}/>Scrutiny officer</span></div></article>
        <div className="welcome-route" aria-hidden="true">{routeStages.map((stage,index)=><div className={`welcome-station ${index<2?'reached':''} ${index===2?'current':''}`} key={stage.key}><span>{String(index+1).padStart(2,'0')}</span><strong>{stage.label}</strong></div>)}<i className="welcome-pulse"/></div>
        <article className="welcome-receipt-card"><div className="welcome-receipt-head"><span>DECISION RECEIPT</span><ReceiptText size={16}/></div><strong>Approved</strong><p>Evidence accepted. Human decision recorded.</p><span className="mono">REGIONAL OFFICER · 17 OCT · v1.0</span></article>
        <span className="welcome-visual-note">One case. Five hands. Zero orphaned handoffs.</span>
      </section>
    </main>
    <section className="welcome-principles" aria-labelledby="welcome-principles-title">
      <div className="welcome-principles-head"><span className="welcome-kicker">THE DESIGN BET</span><h2 id="welcome-principles-title">Built for the messy middle of a public process.</h2></div>
      <div className="welcome-principle-grid">
        <article><GitBranch size={20}/><span>01 / ROUTE</span><h3>No orphaned handoffs.</h3><p>Every queue item names the current authority, the next permitted action, and the deadline that makes it urgent.</p></article>
        <article><ScanLine size={20}/><span>02 / EVIDENCE</span><h3>No black-box approvals.</h3><p>Assistive checks can flag a gap. They cannot change workflow status, release a file, or replace a reviewer.</p></article>
        <article><LockKeyhole size={20}/><span>03 / RECORD</span><h3>No decision without a receipt.</h3><p>Actor, role, reason, evidence, time, and workflow version travel with the dossier after the meeting ends.</p></article>
      </div>
    </section>
    <footer className="welcome-foot"><span>FlowPilot <span className="mono">/</span> Right process. Right authority. Right time.</span><span><ShieldCheck size={13}/>Synthetic data only. Not an AICTE service.</span></footer>
  </div>;
}
