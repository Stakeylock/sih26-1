import {neutralCopy} from '../domain/presentation';
import {Panel,Badge,Empty} from './common';
import {ShieldCheck} from 'lucide-react';
import {type Application,type DocumentRecord,type Identity,type Obligation} from '../domain/model';
import {delayRiskAdvisory} from '../domain/expiry';
import {aphClauseForDocument,APH_EDITION,APH_TITLE} from '../domain/aph';
import {expiryState} from '../domain/expiry';

function riskChip(risk:string){
  const label=risk.charAt(0).toUpperCase()+risk.slice(1);
  const className='risk-chip risk-'+risk;
  const ariaLabel='Delay risk: '+label;
  return <span className={className} aria-label={ariaLabel}>{label}</span>;
}

function factsRow(label:string,value:React.ReactNode){
  return <div className="obligation-fact"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function ObligationsRegister({app,data}:{app:Application;data:{obligations:Obligation[];documents:DocumentRecord[]};identity:Identity}){
  const obligations=data.obligations.filter(item=>item.application_id===app.id).sort((a,b)=>Date.parse(b.due_date)-Date.parse(a.due_date));
  const renewals=obligations.filter(item=>item.kind==='renewal');
  const expiries=obligations.filter(item=>item.kind==='document_expiry');
  const undertakings=obligations.filter(item=>item.kind==='undertaking');
  const documentById=new Map(data.documents.map(d=>[d.id,d]));
  return (
    <section className="obligations-register">
      <Panel title="Obligations &amp; renewal register" subtitle="Recorded post-decision conditions, document-expiry follow-ups and renewal submissions. Delay risk is advisory only and never changes workflow status.">
        <div className="register-summary inline" style={{display:'flex',gap:'14px',flexWrap:'wrap',marginBottom:'10px'}}>
          <div><strong>{obligations.length}</strong><span className="quiet-label">obligations</span></div>
          <div><strong>{renewals.length}</strong><span className="quiet-label">renewals</span></div>
          <div><strong>{expiries.length}</strong><span className="quiet-label">expiry follow-ups</span></div>
          <div><strong>{undertakings.length}</strong><span className="quiet-label">conditions</span></div>
        </div>
        {obligations.length===0 ? (
          <Empty title="No obligations recorded">This case has no recorded post-decision conditions or renewal follow-ups.</Empty>
        ) : (
          <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'10px'}}>
            <h3 className="register-section">Open &amp; submitted obligations</h3>
            {obligations.map(item=>{
              const doc=item.document_id?documentById.get(item.document_id):undefined;
              const risk=delayRiskAdvisory(item.due_date,item.status);
              const expiredDoc=doc&&expiryState(doc.expires_on)==='expired';
              const aph=doc?aphClauseForDocument(doc.doc_type):null;
              const kindClass='obligation-row kind-'+(item.kind??'unknown')+(item.status==='submitted'?' submitted':'');
              return (
                <article key={item.id} className={kindClass}>
                  <div className="obligation-head">
                    <span className="kind-tag">{neutralCopy(item.kind??'')}</span>
                    {item.kind==='renewal'&&<span className="kind-tag renewal">Renewal</span>}
                    {riskChip(risk)}
                  </div>
                  <div className="obligation-body">
                    <strong>{neutralCopy(item.title)}</strong>
                    <p>{item.deadline_source?`Source: ${item.deadline_source}`:''} {item.required_evidence?.length?`Evidence: ${item.required_evidence.join(', ')}`:''}</p>
                    <dl className="obligation-facts">
                      {factsRow('Due',new Date(item.due_date+'T00:00:00').toLocaleDateString('en-IN'))}
                      {factsRow('Status',<Badge status={item.status as any}/>)}
                      {factsRow('Delay risk',risk)}
                      {doc && (
                        <>
                          {factsRow('Document',neutralCopy(doc.file_name)+ (doc.expires_on?' · expires '+doc.expires_on:'')+(expiredDoc?' · expired':''))}
                          {aph && factsRow('APH reference',aph.clause_number+' · '+aph.clause_title+' (APH '+APH_EDITION+', p.'+aph.page_number+')')}
                        </>
                      )}
                      {item.kind==='renewal' && factsRow('Decision','The recorded decision is unchanged; a reviewer verifies the replacement.')}
                    </dl>
                    {item.status==='submitted' && <p className="quiet-label">Awaiting authorised reviewer verification.</p>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {renewals.length>0 && (
          <div className="register-note" style={{marginTop:'10px',padding:'8px 12px',background:'var(--info-soft)',border:'1px solid var(--info-border)',color:'var(--info-text)',borderRadius:'6px',fontSize:'11px'}}>
            <ShieldCheck size={13} style={{flexShrink:0,marginRight:'6px'}}/><span>A renewal records a replacement for an expired required document; the institution submits it and a reviewer verifies. The recorded decision is unchanged.</span>
          </div>
        )}
      </Panel>
      <p className="quiet-label" style={{fontSize:'11px',marginTop:'6px'}}>APH clause text verified against the {APH_TITLE} held in docs/reference. The document-to-clause mapping is ours, and these are not official AICTE determinations.</p>
    </section>
  );
}
