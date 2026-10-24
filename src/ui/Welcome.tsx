import {ArrowRight,FileCheck2,GitBranch,History,Play,ShieldCheck} from 'lucide-react';
import {Brand} from './common';
import {lazy,Suspense} from 'react';
import {ThemeToggle,type Theme} from './theme';
import './landing.css';
const LandingJourney=lazy(()=>import('./LandingJourney').then(module=>({default:module.LandingJourney})));

export function Welcome({onEnter,onStory,theme,toggleTheme}:{onEnter:()=>void;onStory:()=>void;theme:Theme;toggleTheme:()=>void}){
  return <div className="landing-page">
    <a className="landing-skip" href="#landing-content" onClick={event=>{event.preventDefault();document.getElementById('landing-content')?.focus();}}>Skip to content</a>
    <header className="landing-header"><Brand/><div className="landing-header-actions"><span className="landing-demo-label"><span/>Synthetic demo</span><ThemeToggle theme={theme} toggleTheme={toggleTheme} className="landing-theme"/><button className="landing-entry" type="button" onClick={onEnter}>Enter workspace <ArrowRight size={15} aria-hidden="true"/></button></div></header>
    <main id="landing-content" className="landing-content" tabIndex={-1}>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="landing-eyebrow"><GitBranch size={14} aria-hidden="true"/>An accountable path through approval</p>
          <h1 id="landing-title"><span>The file moves.</span><span>The record stays.</span></h1>
          <p className="landing-intro">Evidence, corrections, and the people responsible for the next step. One shared record from the first submission to the final review.</p>
          <div className="landing-actions"><button type="button" className="landing-primary" onClick={onEnter}>Open demo workspace <ArrowRight size={17} aria-hidden="true"/></button><button type="button" className="landing-tour" onClick={onStory}><Play size={15} aria-hidden="true"/>Take a guided tour</button></div>
          <p className="landing-disclosure">SIH26262 prototype. Synthetic cases only.<br/>No real AICTE data or regulatory decisions.</p>
          <ul className="landing-proof" aria-label="Core workflow capabilities"><li><FileCheck2 size={16} aria-hidden="true"/>Versioned evidence</li><li><ShieldCheck size={16} aria-hidden="true"/>Human review</li><li><History size={16} aria-hidden="true"/>Recorded history</li></ul>
        </div><Suspense fallback={<div className="landing-journey-loading" role="status">Loading review illustration…</div>}><LandingJourney/></Suspense>
      </section>
      <section className="landing-continuity" aria-labelledby="landing-continuity-title">
        <div className="landing-section-heading"><p className="landing-eyebrow">Continuity, at every handoff</p><h2 id="landing-continuity-title">A correction should move<br/>the case forward, not erase its past.</h2></div>
        <div className="landing-principles">
          <article><FileCheck2 size={21} aria-hidden="true"/><h3>Keep the evidence in context.</h3><p>Claims stay linked to their document versions. Replacements add to the record, with a separate validity and acceptance review.</p></article>
          <article><GitBranch size={21} aria-hidden="true"/><h3>Make the next action clear.</h3><p>Role-based routes keep submission, scrutiny, visits and authority decisions with the people permitted to act.</p></article>
          <article><History size={21} aria-hidden="true"/><h3>Carry the obligations forward.</h3><p>Recorded approval scope and continuing conditions remain available after the application closes.</p></article>
        </div>
      </section>
    </main>
    <footer className="landing-footer"><span>Clauseway <span aria-hidden="true">/</span> Evidence review, with a record.</span><span><ShieldCheck size={14} aria-hidden="true"/>Independent prototype. Not an AICTE service.</span></footer>
  </div>;
}
