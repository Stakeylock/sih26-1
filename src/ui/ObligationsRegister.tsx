import {useState} from 'react';
import {neutralCopy} from '../domain/presentation';
import {Panel,Badge,Empty} from './common';
import {ShieldCheck} from 'lucide-react';
import {type Application,type DocumentRecord,type Identity,type Obligation,type ComplianceEvidence,type Workspace} from '../domain/model';
import {delayRiskAdvisory} from '../domain/expiry';
import {aphClauseForDocument,APH_EDITION,APH_TITLE} from '../domain/aph';
import {expiryState} from '../domain/expiry';
import type {Run} from './Applications';
import type {Repository} from '../domain/model';

function riskChip(risk:string){
  const label=risk.charAt(0).toUpperCase()+risk.slice(1);
  const className='risk-chip risk-'+risk;
  const ariaLabel='Delay risk: '+label;
  return <span className={className} aria-label={ariaLabel}>{label}</span>;
}

function factsRow(label:string,value:React.ReactNode){
  return <div className="obligation-fact"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function ObligationsRegister({app,data,identity,repo,run,busy}:{app:Application;data:{obligations:Obligation[];documents:DocumentRecord[];compliance_evidence:ComplianceEvidence[]};identity:Identity;repo:Repository;run:Run;busy:boolean}){
  const obligations=data.obligations.filter(item=>item.application_id===app.id).sort((a,b)=>Date.parse(b.due_date)-Date.parse(a.due_date));
  const renewals=obligations.filter(item=>item.kind==='renewal');
  const expiries=obligations.filter(item=>item.kind==='document_expiry');
  const undertakings=obligations.filter(item=>item.kind==='undertaking');
  const documentById=new Map(data.documents.map(d=>[d.id,d]));
  const evidenceByObligation=new Map<string,ComplianceEvidence[]>();
  obligations.forEach(item=>{
    evidenceByObligation.set(item.id,data.compliance_evidence.filter(ev=>ev.obligation_id===item.id).sort((a,b)=>Date.parse(b.uploaded_at)-Date.parse(a.uploaded_at)));
  });
  const isInstitution=identity.roles.some(role=>role.role==='institution'&&app.owner_id===identity.id);
  const canManage=identity.roles.some(role=>role.role==='national_admin'||role.role==='regional_officer');

  const [docSel,setDocSel]=useState<Record<string,string>>({});
  const [docNotes,setDocNotes]=useState<Record<string,string>>({});
  const [revNotes,setRevNotes]=useState<Record<string,string>>({});
  const [error,setError]=useState<string|null>(null);

  const submitEvidence=async(obligationId:string,documentId:string,remarks:string)=>{
    setError(null);
    try{
      const ok=await run(async()=>{
        await repo.submitComplianceEvidence(app,obligationId,{document_id:documentId,remarks:remarks||undefined});
      },'Compliance evidence submitted.');
      if(!ok)throw new Error('Evidence submission failed.');
      setDocSel(prev=>({...prev,[obligationId]:''}));
      setDocNotes(prev=>({...prev,[obligationId]:''}));
    }catch(err){
      setError(err instanceof Error?err.message:'Evidence could not be submitted.');
    }
  };

  const verifyEvidence=async(evidenceId:string,status:'APPROVED'|'REJECTED',reason:string)=>{
    setError(null);
    try{
      await run(async()=>{
        await repo.verifyComplianceEvidence(evidenceId,status,reason);
      },'Evidence reviewed.');
      setRevNotes(prev=>({...prev,[evidenceId]:''}));
    }catch(err){
      setError(err instanceof Error?err.message:'Review could not be recorded.');
    }
  };

  return (
    <section className="obligations-register">
      <Panel title="Obligations &amp; renewal register" subtitle="Recorded post-decision conditions, document-expiry follow-ups and renewal submissions. Delay risk is advisory only and never changes workflow status.">
        {error && <div className="callout warning" role="alert" style={{marginBottom:'10px'}}>{error}</div>}
        <div className="register-summary inline" style={{display:'flex',gap:'14px',flexWrap:'wrap',marginBottom:'10px'}}>
          <div><strong>{obligations.length}</strong><span className="quiet-label">obligations</span></div>
          <div><strong>{renewals.length}</strong><span className="quiet-label">renewals</span></div>
          <div><strong>{expiries.length}</strong><span className="quiet-label">expiry follow-ups</span></div>
          <div><strong>{undertakings.length}</strong><span className="quiet-label">conditions</span></div>
        </div>
        {obligations.length===0 ? (
          <Empty title="No obligations recorded">This case has no recorded post-decision conditions or renewal follow-ups.</Empty>
        ) : (
          <div className="form-grid obligations-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))',gap:'14px'}}>
            <h3 className="register-section">Open &amp; submitted obligations</h3>
            {obligations.map(item=>{
              const doc=item.document_id?documentById.get(item.document_id):undefined;
              const risk=delayRiskAdvisory(item.due_date,item.status);
              const expiredDoc=doc&&expiryState(doc.expires_on)==='expired';
              const aph=doc?aphClauseForDocument(doc.doc_type):null;
              const kindClass='obligation-row kind-'+(item.kind??'unknown')+(item.status==='submitted'?' submitted':'');
              const evidence=evidenceByObligation.get(item.id)??[];
              const currentDocSel=docSel[item.id]||'';
              const currentDocNote=docNotes[item.id]||'';
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
                    {item.status==='submitted' && !evidence.some(item=>item.status==='PENDING') && <p className="quiet-label">Awaiting authorised reviewer verification.</p>}
                    {isInstitution && item.status==='open' && item.required_evidence?.length && !evidence.some(item=>item.status==='PENDING') && (
                      <div className="submit-evidence">
                        <label className="field">Submit evidence<textarea value={currentDocNote} onChange={event=>setDocNotes({...docNotes,[item.id]:event.target.value})} rows={2} required placeholder="Describe how the attached document satisfies this obligation."/></label>
                        <label className="field">Document<select value={currentDocSel} onChange={event=>setDocSel({...docSel,[item.id]:event.target.value})} required><option value="">Choose a document</option>{data.documents.filter(d=>d.application_id===app.id&&d.scan_status==='clean'&&item.required_evidence?.includes(d.doc_type)).map(d=><option key={d.id} value={d.id}>{neutralCopy(d.file_name)}</option>)}</select></label>
                        <button className="button" type="button" disabled={busy||!currentDocSel||!currentDocNote.trim()} onClick={()=>void submitEvidence(item.id,currentDocSel,currentDocNote.trim())}>Submit evidence</button>
                        {(currentDocSel||currentDocNote.trim())&&<button className="button text" type="button" onClick={()=>{setDocSel({...docSel,[item.id]:''});setDocNotes({...docNotes,[item.id]:''});}}>Clear</button>}
                      </div>
                    )}
                    {evidence.length>0 && (
                      <div className="evidence-section">
                        <h4 className="evidence-heading">Submitted evidence</h4>
                        {evidence.map(evItem=>(
                          <div key={evItem.id} className="evidence-row">
                            <span className="document-name">{neutralCopy(documentById.get(evItem.document_id)?.file_name??evItem.document_id)}</span>
                            <span className={`evidence-status ${evItem.status}`}>{evItem.status}</span>
                            {evItem.remarks&&<small className="muted">{evItem.remarks}</small>}
                            {evItem.status==='APPROVED' && <span className="quiet-label">Verified by {evItem.verified_by}{evItem.verified_at ? ` on ${new Date(evItem.verified_at).toLocaleDateString('en-IN')}` : ''}</span>}
                            {evItem.status==='REJECTED' && <span className="quiet-label">Rejected: {evItem.verified_remarks}</span>}
                            {evItem.status==='PENDING' && canManage && (
                              <div className="evidence-actions">
                                <label className="field"><textarea value={revNotes[evItem.id]??''} onChange={event=>setRevNotes({...revNotes,[evItem.id]:event.target.value})} rows={1} required minLength={10} maxLength={1000} placeholder="Review remarks (at least 10 chars)"/></label>
                                <button className="button text" type="button" disabled={busy||(revNotes[evItem.id]??'').trim().length<10} onClick={()=>void verifyEvidence(evItem.id,'APPROVED',(revNotes[evItem.id]??'').trim())}>Approve</button>
                                <button className="button text" type="button" disabled={busy||(revNotes[evItem.id]??'').trim().length<10} onClick={()=>void verifyEvidence(evItem.id,'REJECTED',(revNotes[evItem.id]??'').trim())}>Reject</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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

export function ObligationsPage({data,identity,repo,run,busy,initialApplicationId}:{data:Workspace;identity:Identity;repo:Repository;run:Run;busy:boolean;initialApplicationId?:string}){
  const casesWithObligations=data.applications.filter(a=>data.obligations.some(o=>o.application_id===a.id));
  const [selectedAppId,setSelectedAppId]=useState(initialApplicationId??casesWithObligations[0]?.id??data.applications[0]?.id??'');
  const app=data.applications.find(a=>a.id===selectedAppId);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Obligations &amp; renewal register</h1>
          <p>Monitor post-decision conditions, recurring renewal follow-ups, and submitted compliance evidence across authorised institutions.</p>
        </div>
      </div>
      {casesWithObligations.length>0 ? (
        <>
          <div className="form-grid" style={{marginBottom:'16px'}}>
            <label className="field">
              Select case
              <select value={selectedAppId} onChange={event=>setSelectedAppId(event.target.value)}>
                {casesWithObligations.map(application=>(
                  <option key={application.id} value={application.id}>
                    {application.ref_no} — {data.institutions.find(i=>i.id===application.institution_id)?.name??'Demo institution'} ({data.obligations.filter(o=>o.application_id===application.id).length} obligations)
                  </option>
                ))}
              </select>
            </label>
          </div>
          {app ? (
            <ObligationsRegister app={app} data={{obligations:data.obligations,documents:data.documents,compliance_evidence:data.compliance_evidence}} identity={identity} repo={repo} run={run} busy={busy}/>
          ) : (
            <Empty title="Case not found">Selected application is unavailable in this workspace.</Empty>
          )}
        </>
      ) : (
        <Empty title="No recorded obligations">No cases in this workspace currently carry post-decision conditions or renewal obligations.</Empty>
      )}
    </div>
  );
}
