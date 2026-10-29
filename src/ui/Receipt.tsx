import {neutralCopy} from '../domain/presentation';
import {useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,Printer,ReceiptText,ShieldCheck,XCircle} from 'lucide-react';
import type {AuditVerification} from '../domain/integrity';
import {roleLabels,type Application,type Repository,type Workspace} from '../domain/model';
import type {Run} from './Applications';

export function Receipt({app,data,repo,run,busy,back,openCase}:{app:Application;data:Workspace;repo:Repository;run:Run;busy:boolean;back:()=>void;openCase:()=>void}){
  const institution=data.institutions.find(item=>item.id===app.institution_id);
  const decision=data.events.filter(event=>event.application_id===app.id&&['approved','rejected','approve','reject'].includes(event.action)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
  const evidence=data.documents.find(document=>document.id===app.decision_evidence);
  const chain=data.events.filter(event=>event.application_id===app.id).sort((a,b)=>(b.sequence??0)-(a.sequence??0));
  const recordHash=chain[0]?.event_hash??null;
  const obligations=data.obligations?.filter(item=>item.application_id===app.id)??[];
  const [verification,setVerification]=useState<AuditVerification|null>(null);const [verifiedAt,setVerifiedAt]=useState('');
  const approved=app.status==='approved';
  const recorded=decision?.created_at??app.updated_at;
  const actor=decision?.actor_role?(roleLabels as Record<string,string>)[decision.actor_role]??decision.actor_role.replaceAll('_',' '):'Regional officer';
  const receiptId=`RCPT-${app.ref_no.replace('DEMO-','')}-${String(app.version).padStart(2,'0')}`;
  const shortCode=recordHash?`CW-${app.ref_no.replace('DEMO-','')}-${recordHash.slice(0,8).toUpperCase()}`:`CW-${app.ref_no.replace('DEMO-','')}-SEEDED`;
  const verify=()=>void run(async()=>{setVerification(await repo.verifyAudit(app));setVerifiedAt(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}));},'Receipt chain verified.');
  return <div className="receipt-page">
    <header className="receipt-page-head"><button className="text-button button-small" onClick={back}><ArrowLeft size={15}/>Back</button><span>DECISION RECEIPT / SYNTHETIC RECORD</span><button className="button outline" onClick={()=>window.print()}><Printer size={15}/>Print</button></header>
    <article className="receipt-paper">
      <div className="receipt-paper-top"><div><span className="receipt-kicker">CLAUSEWAY / Institutional Review APPROVAL OPERATIONS</span><h1>Decision receipt</h1><p className="mono">{receiptId}</p></div><div className={`receipt-seal ${approved?'approved':'rejected'}`}>{approved?<CheckCircle2 size={30}/>:<XCircle size={30}/>}<strong>{approved?'Approved':'Rejected'}</strong><span>Human decision</span></div></div>
      <div className="receipt-rule"/>
      <dl className="receipt-grid">
        <div><dt>Case reference</dt><dd className="mono">{app.ref_no}</dd></div>
        <div><dt>Institution</dt><dd>{institution?.name??'Synthetic institution'}</dd></div>
        <div><dt>Application</dt><dd>{neutralCopy(app.title)}</dd></div>
        <div><dt>Workflow version</dt><dd className="mono">v{app.template_version}</dd></div>
        <div><dt>Recorded</dt><dd>{new Date(recorded).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</dd></div>
        <div><dt>Recorded by</dt><dd>{actor}</dd></div>
        <div className="span-2"><dt>Record hash</dt><dd className="mono receipt-hash">{recordHash??'Chain unavailable'}</dd></div>
      </dl>
      <section className="receipt-section"><span className="quiet-label">DECISION REASON</span><p>{app.decision_reason??decision?.reason??'No reason recorded in this synthetic record.'}</p></section>
      <section className="receipt-section"><span className="quiet-label">EVIDENCE ON RECORD</span><p>{evidence?`${evidence.doc_type.replaceAll('_',' ')} · ${neutralCopy(evidence.file_name)}`:'No evidence linked to this synthetic decision.'}</p></section>
      {obligations.length>0&&(
        <section className="receipt-section">
          <span className="quiet-label">CONTINUING OBLIGATIONS &amp; CONDITIONS ({obligations.length})</span>
          <div style={{display:'flex',flexDirection:'column',gap:'8px',marginTop:'8px'}}>
            {obligations.map(ob=>(
              <div key={ob.id} style={{padding:'8px 12px',background:'var(--surface-muted,#f8fafc)',border:'1px solid var(--rule,#e2e8f0)',borderRadius:'6px',fontSize:'11px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <strong>{neutralCopy(ob.title)}</strong>
                  <span className="mono" style={{fontSize:'10px',textTransform:'uppercase',fontWeight:600}}>{ob.status}</span>
                </div>
                <div style={{color:'var(--muted,#55647e)',marginTop:'4px'}}>
                  <span>Due: {new Date(ob.due_date+'T00:00:00').toLocaleDateString('en-IN')}</span>
                  {ob.required_evidence?.length?<span> · Required evidence: {ob.required_evidence.join(', ')}</span>:null}
                </div>
              </div>
            ))}
          </div>
          <p style={{fontSize:'11px',color:'var(--muted,#55647e)',marginTop:'8px',lineHeight:'1.5'}}>
            Approval remains subject to fulfilling post-decision obligations and maintaining active certifications. Continuing compliance is monitored in the Obligations &amp; renewal register.
          </p>
        </section>
      )}
      <div className="receipt-rule"/>
      <div className="receipt-trace">
        <div>
          <span className="quiet-label">VERIFICATION SHORT CODE</span>
          <p className="mono" style={{fontSize:'13px',fontWeight:700,letterSpacing:'.08em',color:'var(--do-accent,#0c8272)',margin:'4px 0 2px'}}>{shortCode}</p>
          <p className="mono" style={{fontSize:'8.5px',color:'var(--muted,#55647e)',margin:'2px 0 0'}}>Case {app.id} · event {decision?.id??'seeded-decision'} · version {app.version}</p>
          <small style={{fontSize:'9px',color:'var(--muted,#55647e)',display:'block',marginTop:'4px'}}>Synthetic lookup code for audit-chain integrity checking in this workspace. Not a cryptographic digital signature.</small>
        </div>
        <div className="receipt-code" aria-hidden="true"/>
      </div>
      <section className={`receipt-verification ${verification?verification.intact?'intact':'broken':''}`}>
        <div><span className="quiet-label">RECORD INTEGRITY</span><strong>{verification?verification.intact?'Chain verified. Event history intact.':`Integrity mismatch detected at event ${verification.broken_at??'?'}`:'Not verified'}</strong><p>{verification?`${verification.checked} events checked · head ${verification.head??'not available'}${verifiedAt?` · ${verifiedAt}`:''}`:'Verify the stored hash-linked chain for this decision record.'}</p></div>
        <button className="button outline" onClick={verify} disabled={busy}>{verification?'Verify again':'Verify record'}</button>
      </section>
      <div className="receipt-actions"><button className="button" onClick={openCase}>Open the dossier <ArrowRight size={15}/></button><button className="text-button button-small" onClick={back}>Back to workspace</button></div>
      <p className="receipt-disclaimer"><ShieldCheck size={15}/>Synthetic demonstration receipt. Not an Institutional Review approval, certificate, or regulatory decision.</p>
      <span className="receipt-watermark" aria-hidden="true"><ReceiptText size={120}/></span>
    </article>
  </div>;
}
