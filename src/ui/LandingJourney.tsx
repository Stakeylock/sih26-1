import {neutralCopy} from '../domain/presentation';
import {useEffect,useId,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import {ArrowDown,ArrowRight,Check,CheckCheck,FileCheck2,FileText,Fingerprint,History,LockKeyhole,Pause,Play,RotateCcw,ShieldCheck,TriangleAlert} from 'lucide-react';

const steps=[
  {id:'evidence',label:'Evidence',caption:'A gap gets a clear explanation.',title:'Evidence needs another look.',description:'The certificate is flagged for correction. Its original version stays in the record.',status:'Correction requested',file:'fire_safety_certificate.pdf',version:'v1'},
  {id:'correction',label:'Correction',caption:'A replacement joins the same record.',title:'New evidence. Same review trail.',description:'A replacement is supplied. Security scanning, validity and claim acceptance remain separate checks.',status:'Awaiting authorised review',file:'fire_safety_certificate_v2.pdf',version:'v2'},
  {id:'recorded',label:'Recorded',caption:'The human review becomes traceable.',title:'A review, with its rationale.',description:'The evidence version, reviewer role and explanation stay together. This is a claim review, not a final approval.',status:'Human review recorded',file:'fire_safety_certificate_v2.pdf',version:'v2'},
] as const;
const STEP_DURATION=4400;
export function LandingJourney(){
  const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [playing,setPlaying]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [step,setStep]=useState(0),[visible,setVisible]=useState(true),[pageVisible,setPageVisible]=useState(()=>document.visibilityState!=='hidden'),[run,setRun]=useState(0);
  const figureRef=useRef<HTMLElement>(null),tabRefs=useRef<(HTMLButtonElement|null)[]>([]);
  const id=useId(),current=steps[step];
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>{setReduced(media.matches);if(media.matches)setPlaying(false);};media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{const update=()=>setPageVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
  useEffect(()=>{const figure=figureRef.current;if(!figure)return;const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:0.15});observer.observe(figure);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(!playing||reduced||!visible||!pageVisible)return;const timer=window.setTimeout(()=>{if(step===steps.length-1)setPlaying(false);else setStep(value=>value+1);},STEP_DURATION);return()=>window.clearTimeout(timer);},[playing,reduced,visible,pageVisible,step,run]);
  const choose=(index:number)=>{setStep(index);setPlaying(false);};
  const replay=()=>{setStep(0);setPlaying(!reduced);setRun(value=>value+1);};
  const toggle=()=>{if(playing)setPlaying(false);else{if(step===steps.length-1)setStep(0);setPlaying(true);}};
  const keys=(event:KeyboardEvent<HTMLDivElement>)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?steps.length-1:event.key==='ArrowRight'?(step+1)%steps.length:(step+steps.length-1)%steps.length;choose(index);tabRefs.current[index]?.focus();};
  return <figure ref={figureRef} className="landing-journey" aria-label="Illustrative evidence review" data-step={current.id} data-playing={playing&&!reduced&&visible&&pageVisible} data-reduced-motion={reduced}>
    <div className="journey-toolbar"><span className="journey-toolbar-title"><span className="journey-demo-dot"/>A review in motion</span><div className="journey-controls"><span className="journey-example">Illustration</span><button type="button" aria-label={reduced?'Automatic motion disabled':playing?'Pause illustration':'Play illustration'} title={reduced?'Reduced motion is enabled':playing?'Pause illustration':'Play illustration'} disabled={reduced} onClick={toggle}>{playing&&!reduced?<Pause size={14}/>:<Play size={14}/>}</button><button type="button" aria-label="Replay illustration" title="Replay illustration" onClick={replay}><RotateCcw size={14}/></button></div></div>
    <div className="journey-stage" style={{'--journey-step':step} as CSSProperties}>
      <div className="journey-case-heading"><div><span className="journey-overline">SAMPLE DOSSIER</span><strong>Cedar Technical Institute</strong></div><span className="journey-case-state">Under review</span></div>
      <div className="journey-document" data-state={current.id} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${current.id}`} tabIndex={0} onFocus={()=>setPlaying(false)}>
        <div className="journey-document-top"><div className="journey-file-icon" aria-hidden="true">{step===2?<FileCheck2 size={23}/>:<FileText size={23}/>}</div><div className="journey-file-name"><strong>Fire safety certificate</strong><span>{current.file}</span></div><span className="journey-version">{current.version}</span></div>
        <div className="journey-document-content" key={current.id}>
          {step===0?<><div className="journey-specimen" role="group" aria-label="Synthetic document summary"><span>DOCUMENT SUMMARY</span><div><span>Type</span><strong>Safety certificate</strong></div><div><span>Validity</span><strong>Needs review</strong></div><div className="journey-paper-lines" aria-hidden="true"><i/><i/><i/></div></div><div className="journey-finding"><TriangleAlert size={16} aria-hidden="true"/><div><strong>Expiry flagged at scrutiny</strong><span>Correction requested against this evidence.</span></div></div></>:
          step===1?<><div className="journey-version-flow"><div><FileText size={19} aria-hidden="true"/><strong>Original</strong><span>v1 · retained</span></div><ArrowRight size={18} aria-hidden="true"/><div className="journey-new-version"><FileCheck2 size={19} aria-hidden="true"/><strong>Replacement</strong><span>v2 · supplied</span></div></div><div className="journey-review-pending"><LockKeyhole size={16} aria-hidden="true"/><div><strong>Checks before acceptance</strong><span>Scan → validity review → claim review</span></div></div></>:
          <div className="journey-review-record"><div className="journey-record-heading"><span className="journey-record-check"><Check size={17} aria-hidden="true"/></span><div><span>EXAMPLE REVIEW EVENT</span><strong>Evidence review recorded</strong></div></div><dl><div><dt>Reviewer role</dt><dd>Scrutiny officer</dd></div><div><dt>Review basis</dt><dd>Replacement document · v2</dd></div><div><dt>Scope</dt><dd>Evidence claim</dd></div></dl><div className="journey-rationale"><History size={14} aria-hidden="true"/><span>Original, replacement and review stay linked.</span></div></div>}
        </div>
        <div className="journey-document-bottom"><span className="journey-status">{step===0?<TriangleAlert size={12}/>:step===1?<ShieldCheck size={12}/>:<CheckCheck size={13}/>} {current.status}</span><Fingerprint size={16} aria-label="Document version provenance"/></div>
      </div>
      <div className="journey-connector" aria-hidden="true"><span/><ArrowDown size={13}/><span/></div>
      <div className="journey-step-caption" key={current.id+'-caption'}><span className="journey-step-number">{String(step+1).padStart(2,'0')} / 03</span><div><strong>{neutralCopy(current.title)}</strong><p>{current.description}</p></div></div>
      <div className="journey-tabs" role="tablist" aria-label="Illustration steps" onFocusCapture={()=>setPlaying(false)} onKeyDown={keys} style={{'--journey-step':step} as CSSProperties}>
        <span className="journey-tab-indicator" aria-hidden="true"/>{steps.map((item,index)=><button key={item.id} type="button" role="tab" id={`${id}-${item.id}`} aria-controls={`${id}-panel`} aria-selected={index===step} tabIndex={index===step?0:-1} ref={element=>{tabRefs.current[index]=element;}} onClick={()=>choose(index)}>{index<step?<Check size={12} aria-hidden="true"/>:<span className="journey-tab-dot" aria-hidden="true"/>}{neutralCopy(item.label)}</button>)}
      </div>
      <p className="journey-accessible-caption">{current.caption}</p>
    </div>
    <figcaption>{reduced?'Automatic motion is off. Choose any step above.':'An illustrative sequence. No application status is changed.'}</figcaption>
  </figure>;
}
