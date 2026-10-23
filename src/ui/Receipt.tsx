import {ArrowLeft,ArrowRight,CheckCircle2,Printer,ReceiptText,ShieldCheck,XCircle} from 'lucide-react';
import {roleLabels,type Application,type Workspace} from '../domain/model';

export function Receipt({app,data,back,openCase}:{app:Application;data:Workspace;back:()=>void;openCase:()=>void}){
  const institution=data.institutions.find(item=>item.id===app.institution_id);
  const decision=data.events.filter(event=>event.application_id===app.id&&['approved','rejected','approve','reject'].includes(event.action)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
  const evidence=data.documents.find(document=>document.id===app.decision_evidence);
  const approved=app.status==='approved';
  const recorded=decision?.created_at??app.updated_at;
  const actor=decision?.actor_role?(roleLabels as Record<string,string>)[decision.actor_role]??decision.actor_role.replaceAll('_',' '):'Regional officer';
  const receiptId=`RCPT-${app.ref_no.replace('DEMO-','')}-${String(app.version).padStart(2,'0')}`;
  return <div className="receipt-page">
    <header className="receipt-page-head"><button className="text-button" onClick={back}><ArrowLeft size={15}/>Back</button><span>DECISION RECEIPT / SYNTHETIC RECORD</span><button className="button outline" onClick={()=>window.print()}><Printer size={15}/>Print</button></header>
    <article className="receipt-paper">
      <div className="receipt-paper-top"><div><span className="receipt-kicker">FLOWPILOT / AICTE APPROVAL OPERATIONS</span><h1>Decision receipt</h1><p className="mono">{receiptId}</p></div><div className={`receipt-seal ${approved?'approved':'rejected'}`}>{approved?<CheckCircle2 size={30}/>:<XCircle size={30}/>}<strong>{approved?'Approved':'Rejected'}</strong><span>Human decision</span></div></div>
      <div className="receipt-rule"/>
      <dl className="receipt-grid">
        <div><dt>Case reference</dt><dd className="mono">{app.ref_no}</dd></div>
        <div><dt>Institution</dt><dd>{institution?.name??'Synthetic institution'}</dd></div>
        <div><dt>Application</dt><dd>{app.title}</dd></div>
        <div><dt>Workflow version</dt><dd className="mono">v{app.template_version}</dd></div>
        <div><dt>Recorded</dt><dd>{new Date(recorded).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</dd></div>
        <div><dt>Recorded by</dt><dd>{actor}</dd></div>
      </dl>
      <section className="receipt-section"><span className="quiet-label">DECISION REASON</span><p>{app.decision_reason??decision?.reason??'No reason recorded in this synthetic record.'}</p></section>
      <section className="receipt-section"><span className="quiet-label">EVIDENCE ON RECORD</span><p>{evidence?`${evidence.doc_type.replaceAll('_',' ')} · ${evidence.file_name}`:'No evidence linked to this synthetic decision.'}</p></section>
      <div className="receipt-rule"/>
      <div className="receipt-trace"><div><span className="quiet-label">RECORD TRACE</span><p className="mono">Case {app.id} · event {decision?.id??'seeded-decision'} · version {app.version}</p></div><div className="receipt-code" aria-hidden="true"/></div>
      <div className="receipt-actions"><button className="button" onClick={openCase}>Open the dossier <ArrowRight size={15}/></button><button className="text-button" onClick={back}>Back to workspace</button></div>
      <p className="receipt-disclaimer"><ShieldCheck size={15}/>Synthetic demonstration receipt. Not an AICTE approval, certificate, or regulatory decision.</p>
      <span className="receipt-watermark" aria-hidden="true"><ReceiptText size={120}/></span>
    </article>
  </div>;
}
