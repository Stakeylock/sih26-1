import {ArrowRight,Clock3,FileMinus2,GitBranch,LockKeyhole,Play,ReceiptText,ScanLine,ShieldCheck} from 'lucide-react';
import {Badge,Brand} from './common';
import {ThemeToggle,type Theme} from './theme';
import {useState,useEffect} from 'react';

export function Welcome({onEnter,onStory,theme,toggleTheme}:{onEnter:()=>void;onStory:()=>void;theme:Theme;toggleTheme:()=>void}){
  const [reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [animationPhase,setAnimationPhase]=useState(()=>reducedMotion?10:0);
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setReducedMotion(preference.matches);
    preference.addEventListener('change',update);
    return()=>preference.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    setAnimationPhase(reducedMotion?10:0);
    if(reducedMotion)return;
    const timers=Array.from({length:10},(_,index)=>window.setTimeout(()=>setAnimationPhase(index+1),(index+1)*800));
    return()=>timers.forEach(timer=>window.clearTimeout(timer));
  },[reducedMotion]);
  const evidenceVisible = animationPhase>=4 && animationPhase<7;
  const replacementVisible = animationPhase>=7 && animationPhase<10;
  return <div className="welcome">
    <header className="welcome-top"><Brand/><div className="welcome-top-meta"><span>SIH26262 / SYNTHETIC DEMONSTRATION</span><ThemeToggle theme={theme} toggleTheme={toggleTheme} className="welcome-theme"/><button className="text-button" onClick={onEnter}>Enter workspace <ArrowRight size={15}/></button></div></header>
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
        <div className="welcome-visual-top"><span className="live-dot"/>ILLUSTRATIVE JOURNEY <span className="mono">DEMO-2026-1001</span><span className="welcome-synthetic">SYNTHETIC</span></div>
        <article className={`welcome-case-card${animationPhase>=0&&animationPhase<4?'':' done'}`}><div className="welcome-case-top"><span className="mono">DEMO-2026-1001</span><Badge status="under_scrutiny"/></div><strong>Cedar Technical Institute</strong><span>Self-disclosure extension · 2026-27</span><div className="welcome-case-meta"><span><Clock3 size={13}/>2d remaining</span><span><ShieldCheck size={13}/>Scrutiny officer</span></div></article>
        <div className="welcome-route" aria-hidden="true">
          <svg className="welcome-route-svg" viewBox="0 0 200 40" aria-hidden="true">
            <path className="welcome-route-path" d="M10 10 C50 10, 150 30, 190 30"/>
            <polygon className="welcome-marker" points="0,0 0,10 10,5" fill="currentColor"/>
          </svg>
        </div>
        <article className={`welcome-case-card${animationPhase>=4?'':' next'}`}><div className="welcome-case-top"><span className="mono">DEMO-2026-1001</span><Badge status={animationPhase>=4?'pending_decision':'under_scrutiny'}/></div><strong>Cedar Technical Institute</strong><span>Self-disclosure extension · 2026-27</span><div className="welcome-case-meta"><span><Clock3 size={13}/>2d remaining</span><span><ShieldCheck size={13}/>Scrutiny officer</span></div></article>
        <div className={`welcome-evidence-card${evidenceVisible?' shown':''}`}>
          <div className="evidence-icon"><ShieldCheck size={12}/></div>
          <div>
            <strong>Evidence issue found</strong>
            <p>Fire certificate expired on scrutiny date.</p>
          </div>
        </div>
        <div className={`welcome-replacement-tile${replacementVisible?' shown':''}`}>
          <div className="replacement-icon"><FileMinus2 size={12}/></div>
          <div>
            <strong>Replacement uploaded</strong>
            <p>Awaiting authorised review</p>
          </div>
        </div>
        <article className={`welcome-receipt-card${animationPhase===0?'':' is-mounted'}`} data-phase={animationPhase<10?'initial':'final'}><div className="welcome-receipt-head"><span>DECISION RECEIPT</span><ReceiptText size={16}/></div><strong>Scrutiny finding recorded</strong><p>Evidence reviewed by an authorised officer.</p><span className="mono">REGIONAL OFFICER · 17 OCT · v1.0</span></article>
        <span className="welcome-visual-note">Illustrative sequence, not this record's current state.</span>
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
