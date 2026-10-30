import {neutralCopy} from '../domain/presentation';
import {ApprovalScope,ApprovalDecisionFields,initialDecision} from './ApprovalScope';
import {DocumentValidity} from './DocumentValidity';
import {documentEligible} from '../domain/approvals';
import {useEffect,useState,type DragEvent as ReactDragEvent,type FormEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,CircleAlert,Clock3,Download,FileCheck2,FileText,Info,LockKeyhole,Printer,ShieldCheck,Upload} from 'lucide-react';
import type {AuditVerification} from '../domain/integrity';
import {computeDualClock} from '../domain/clock';
import {workspaceHolidays} from '../domain/calendar';
import {evidenceNorms} from '../domain/norms';
import {expiryState} from '../domain/expiry';
import {actionLabels,allowedActions,missingInputs,nextAuthority,roleLabels,routeStage,statusLabels,typeLabels,type Action,type Advisory,type Application,type Identity,type Repository,type Status,type Workspace} from '../domain/model';
import {nextStep} from '../domain/nextStep';
import {Badge,Dialog,Due,Panel,Timeline,WorkflowRail} from './common';
import {CaseCustody} from './CaseCustody';
import {ObligationsRegister} from './ObligationsRegister';
import {ClaimLedger} from './ClaimLedger';
import {EvidencePassport} from './EvidencePassport';
import {PersonaController} from './PersonaController';
import {DocumentPreview} from './DocumentPreview';
import {PolicyImpact} from './PolicyImpact';
import {Preflight} from './Preflight';
import {ReviewReplay} from './ReviewReplay';
import type {Run} from './Applications';
import type {CaseHistory} from '../domain/review';
import {reviewBasisCurrent,canUploadEvidence} from '../domain/evidence';
const DOSSIER_TABS=[['review','Review'],['evidence','Evidence'],['scope','Scope'],['history','History'],['policy','Policy']] as const;
type DossierTab=typeof DOSSIER_TABS[number][0];
export function CaseWorkspace({app,data,identity,repo,run,busy,back,openReceipt,openCase,openPlanner}:{app:Application;data:Workspace;identity:Identity;repo:Repository;run:Run;busy:boolean;back:()=>void;openReceipt?:(id:string)=>void;openCase?:(id:string)=>void;openPlanner:()=>void}){
  const [action,setAction]=useState<Action|null>(null);const [advisory,setAdvisory]=useState<Advisory|null>(null);const [passport,setPassport]=useState<Workspace['documents'][number]|null>(null);const [audit,setAudit]=useState<AuditVerification|null>(null);const [auditAt,setAuditAt]=useState('');const [replay,setReplay]=useState(false);const [showNotice,setShowNotice]=useState(false);const [dossierTab,setDossierTab]=useState<DossierTab>('review');const documents=data.documents.filter(d=>d.application_id===app.id);const caseEvents=data.events.filter(e=>e.application_id===app.id);const handleTabKeys=(event:ReactKeyboardEvent<HTMLDivElement>)=>{const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;event.preventDefault();const index=DOSSIER_TABS.findIndex(([key])=>key===dossierTab);const next=event.key==='Home'?0:event.key==='End'?DOSSIER_TABS.length-1:event.key==='ArrowLeft'?(index+DOSSIER_TABS.length-1)%DOSSIER_TABS.length:(index+1)%DOSSIER_TABS.length;setDossierTab(DOSSIER_TABS[next][0]);};
  const [selectedDocId,setSelectedDocId]=useState<string|null>(documents.find(d=>d.scan_status==='clean')?.id??documents[0]?.id??null);const selectedDoc=documents.find(d=>d.id===selectedDocId)??null;
  const focusUnresolved=()=>{const go=()=>document.getElementById('dossier-unresolved')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});if(dossierTab==='review'){go();}else{setDossierTab('review');requestAnimationFrame(()=>requestAnimationFrame(go));}};const decisionEvent=data.events.filter(e=>e.application_id===app.id&&['approved','rejected','approve','reject'].includes(e.action)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
  const [history,setHistory]=useState<CaseHistory|null>(null);const [historyError,setHistoryError]=useState('');const [historyAttempt,setHistoryAttempt]=useState(0);
  useEffect(()=>{let active=true;setHistory(null);setHistoryError('');void repo.history(app).then(value=>{if(active)setHistory(value);}).catch(error=>{if(active)setHistoryError(error instanceof Error?error.message:'Unable to load history.');});return()=>{active=false;};},[repo,app.id,app.version,historyAttempt]);
 useEffect(()=>{const guard=(event:DragEvent)=>event.preventDefault();window.addEventListener('dragover',guard);window.addEventListener('drop',guard);return()=>{window.removeEventListener('dragover',guard);window.removeEventListener('drop',guard);};},[]);
 const uploadMessage=repo.mode==='demo'?'Demo metadata added. No file bytes were uploaded.':'Uploaded privately. The document remains quarantined until scanned.';
 const uploadEvidence=(type:string,file:File|undefined)=>{if(file)void run(()=>repo.upload(app,type,file),uploadMessage);};
const [dragTarget,setDragTarget]=useState<string|null>(null);
const handleDragLeaveGroup=()=>setDragTarget(null);
  const editable=app.owner_id===identity.id&&['draft','deficiency_raised'].includes(app.status);
  const canCheck=app.assigned_officer===identity.id&&app.status==='under_scrutiny'&&identity.roles.some(r=>r.role==='scrutiny_officer'&&r.region===app.region);
  const actions=allowedActions(app,identity,repo.mode);const missing=missingInputs(app,documents);
  const requiredFields=app.template_snapshot.required_fields;const requiredDocuments=app.template_snapshot.required_documents;
  const completedFields=requiredFields.filter(field=>app.form_data[field.key]?.trim()).length;const cleanDocuments=requiredDocuments.filter(type=>documents.some(document=>document.doc_type===type&&document.scan_status==='clean')).length;
 const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-');const missingDocs=requiredDocuments.filter(type=>!documents.some(d=>d.doc_type===type&&d.scan_status==='clean'));
  const checklist=app.template_snapshot.checklist;
  const verdicts=checklist.map(item=>data.checklist.find(entry=>entry.application_id===app.id&&entry.item===item));
  const reviewedChecks=verdicts.filter(verdict=>verdict!==undefined).length;
  const passedChecks=verdicts.filter(verdict=>verdict?.passed).length;
  const reviewComplete=checklist.length>0&&reviewedChecks===checklist.length;
  const reviewPassed=reviewComplete&&passedChecks===checklist.length;
  const claims=data.claims.filter(claim=>claim.application_id===app.id);const claimEvidence=data.claim_evidence.filter(link=>claims.some(claim=>claim.id===link.claim_id));const claimDeficiencies=data.deficiencies.filter(item=>item.application_id===app.id);
  const evidenceTypes=[...new Set([...requiredDocuments,...claims.flatMap(claim=>claim.evidence_types_snapshot),...documents.map(doc=>doc.doc_type),...data.obligations.filter(item=>item.application_id===app.id&&item.status!=='fulfilled').flatMap(item=>item.required_evidence??[])])];
  const evidenceNormsByType=new Map(evidenceNorms(claims,data.requirements).map(norm=>[norm.docType,norm]));
  const selectedClaims=selectedDoc?claims.filter(claim=>data.claim_evidence.some(link=>link.document_id===selectedDoc.id&&link.claim_id===claim.id)):[];const selectedSignals=selectedDoc?data.integrity_signals.filter(signal=>signal.document_id===selectedDoc.id):[];
  const dualClock=computeDualClock({startAt:app.submitted_at,events:history?.events??[],historyComplete:history?.complete??false,closedAt:['approved','rejected'].includes(app.status)?decisionEvent?.created_at??app.updated_at:null,holidays:workspaceHolidays()});
  const claimRoute=claims.length>0;const verifiedClaims=claims.filter(claim=>reviewBasisCurrent(app,claim,claimEvidence,documents)).length;const openClaimDeficiencies=claimDeficiencies.filter(item=>['open','escalated'].includes(item.status)).length;const claimsReady=claimRoute&&verifiedClaims===claims.length&&openClaimDeficiencies===0;const acceptBlocked=claimRoute&&!claimsReady;
  const closed=['approved','rejected'].includes(app.status);
  const caseNextStep=nextStep(app,{documents,deficiencies:data.deficiencies,obligations:data.obligations,visits:data.visits});  const continuingObligation=closed&&caseNextStep.kind==='obligation';  const renewal=app.status==='approved'&&caseNextStep.kind==='renewal';const postDecision=continuingObligation||renewal;
  const [renewalInput,setRenewalInput]=useState<{note:string;file:File|null;documentId:string|null}>({note:'',file:null,documentId:null});
  const renewalDoc=documents.find(d=>d.id===caseNextStep.documentId)??null;
  const ownerRenewal=renewal&&app.owner_id===identity.id&&identity.roles.some(r=>r.role==='institution');
  const lastDeficiency=data.events.find(e=>e.application_id===app.id&&e.action==='raise_deficiency');
  const institution=data.institutions.find(i=>i.id===app.institution_id)?.name??'Demo institution';
  const currentStage=routeStage(app.status).label;
  const roleName=roleLabels[identity.roles[0]?.role??'national_admin'];
  const nextGate=nextAuthority(app.status);const nextOwner=postDecision?caseNextStep.owner:nextGate;
  const verifyRecord=()=>void run(async()=>{setAudit(await repo.verifyAudit(app));setReplay(false);setAuditAt(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}));},'Record chain verified.');
  const simulateTamper=()=>void run(async()=>{setAudit(await repo.tamperReplay(app));setReplay(true);setAuditAt(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}));},'Tamper replay ran on a copy. Stored events were not changed.');
  const readinessLabel=renewal?'Renewal needed':continuingObligation?'Obligation open':closed?'Record closed':missing.length?`Blocked by ${missing.length}`:claimRoute?!claimsReady?`Claims ${verifiedClaims} of ${claims.length}`:actions.length?'Ready to advance':`Awaiting ${nextGate}`:!reviewComplete?'Review pending':!reviewPassed?'Review issues':actions.length?'Ready to advance':`Awaiting ${nextGate}`;
  const readinessTone=postDecision?'pending':readinessLabel==='Ready to advance'?'ready':missing.length?'blocked':claimRoute&&!claimsReady?'pending':readinessLabel==='Review pending'||readinessLabel.startsWith('Awaiting')?'pending':readinessLabel==='Record closed'?'closed':'blocked';
  const unverifiedCount=claims.length-verifiedClaims;
  const replacementDoc=documents.find(d=>d.doc_type==='Fire Safety Certificate'&&(!d.expires_on||d.expires_on>=new Date().toISOString().slice(0,10)));
  const hasReplacementEvidence=documents.some(d=>d.expires_on&&d.expires_on<new Date().toISOString().slice(0,10))&&Boolean(replacementDoc);
  const isOwner=app.owner_id===identity.id;
  const stageBriefing=(()=>{
    switch(app.status){
      case 'draft':
        return {
          title:'Draft application',
          body:isOwner?'Complete the declared form fields and upload clean scanned documents for each requirement category before submitting this application for scrutiny review.':'This application is in draft preparation by the institution and has not yet been submitted.',
          note:isOwner?'Form inputs and evidence remain editable until submission.':'Read-only preview of unsubmitted draft.'
        };
      case 'submitted':
      case 'resubmitted':
        return {
          title:app.status==='resubmitted'?'Application resubmitted':'Application submitted',
          body:isOwner?`Your application has been received and is queued for scrutiny officer allocation in the ${app.region} region. All declared fields and uploaded evidence are locked to preserve review integrity.`:`Queued for scrutiny allocation in the ${app.region} region. Declared fields and evidence are locked.`,
          note:`Current station: ${currentStage} · Awaiting scrutiny officer acquisition.`
        };
      case 'under_scrutiny':
        return {
          title:'Application under scrutiny review',
          body:isOwner?'Your application is currently under active review by the regional scrutiny committee. Declared claims and uploaded evidence are locked for review integrity. If the scrutiny officer identifies deficiencies or requests clarification, a deficiency notice will be issued with instructions on how to submit corrections.':`Case is under active scrutiny review in the ${app.region} region. Verify declared claims against linked evidence in the workbench below, and record verification findings or deficiencies.`,
          note:isOwner?'Read-only during scrutiny review. The committee will verify declared claims against attached evidence.':`Assigned scrutiny officer: ${app.assigned_officer===identity.id?'You':'Allocated officer'} · Scrutiny station active.`
        };
      case 'deficiency_raised':
        return {
          title:'Correction requested by scrutiny committee',
          body:isOwner?`The scrutiny officer has returned this application requesting clarification or replacement evidence for ${openClaimDeficiencies>0?`${openClaimDeficiencies} open ${openClaimDeficiencies===1?'deficiency':'deficiencies'}`:'identified items'}. Review the requested remedies below and submit replacement evidence before the deadline.`:'A deficiency notice was issued to the institution. The statutory scrutiny clock is paused until the applicant submits replacement evidence.',
          note:isOwner?'Action required: upload replacement documents and resolve each open deficiency.':'Awaiting institution response.'
        };
      case 'evc_pending':
        return {
          title:'Expert visit pending',
          body:isOwner?'Scrutiny checks verified. This application is queued for site inspection coordination by the Expert Visit Committee (EVC). The visit coordinator will schedule the inspection window.':'Scrutiny verified. Coordinate Expert Visit Committee panel members and schedule the inspection window.',
          note:'Committee visit scheduling is held by the EVC coordinator.'
        };
      case 'evc_scheduled':
        return {
          title:'Expert visit scheduled',
          body:isOwner?'An Expert Visit Committee site inspection has been scheduled. The visiting committee will evaluate physical infrastructure and facilities against regulatory norms.':'Inspection scheduled. The committee conducts the visit and files the consolidated EVC report upon completion.',
          note:'On-site or virtual visit in progress.'
        };
      case 'pending_decision':
        return {
          title:'Final decision pending',
          body:isOwner?'Scrutiny and committee evaluations are complete. The dossier is with the Regional Office for final decision recording and issuance of the decision letter.':'All required scrutiny and committee steps are satisfied. Review the dossier findings and record the official approval or rejection determination.',
          note:'Final decision station · Regional Officer / National Admin holds authority.'
        };
      case 'approved':
        return {
          title:'Approval recorded',
          body:isOwner?'Extension of Approval has been granted for this academic year. The formal approval record and decision receipt are preserved in the hash-linked event ledger below.':'Decision recorded as approved. Immutable decision receipt generated and continuing obligations registered.',
          note:'Completed record · Continuing obligations tracked in the obligations register.'
        };
      case 'rejected':
        return {
          title:'Application not approved',
          body:isOwner?'This application was not approved. Review the recorded decision reason, evidence citations, and Standing Hearing Committee (SHC) appeal provisions below.':'Decision recorded as rejected. Rationale and cited evidence are permanently bound to the audit chain.',
          note:isOwner?'An appeal may be filed within the statutory 7-day appeal window.':'Terminal decision state.'
        };
      default:
        return {
          title:'Dossier record',
          body:`Current station: ${currentStage}. Next authority: ${nextOwner}.`,
          note:'All dossier actions and transitions are recorded in the event chain.'
        };
    }
  })();
  return <section className="dossier-office">
    <div className="spread case-top"><button className="text-button" onClick={back}><ArrowLeft size={16}/>Application register</button><span className="mono">WORKFLOW v{app.template_version} · RECORD VERSION {app.version}</span></div>
    <div className="dossier-top-grid">
    <section className="dossier-header" aria-labelledby="dossier-title"><div className="dossier-header-top"><span className="dossier-kicker">DOSSIER / {app.ref_no}</span><div className="inline"><span className="document-tag">{app.is_demo?'Synthetic record':'Connected record'}</span><span className={`stamp ${app.status==='approved'?'green':app.status==='rejected'?'red':'blue'}`}>{statusLabels[app.status]}</span><Due app={app} data={data}/></div></div><h1 id="dossier-title">{institution}</h1><p className="dossier-title">{neutralCopy(app.title)}</p><div className="dossier-meta-line"><span>{typeLabels[app.app_type]}</span><span>{app.region} region</span><span>Current station: {currentStage}</span><span>Next authority: {nextOwner}</span><span className="mono">WORKFLOW {app.template_version}.0</span></div><div className="dossier-briefing-panel"><div className="dossier-briefing-header"><Info size={15}/><strong>{stageBriefing.title}</strong></div><p className="dossier-briefing-body">{stageBriefing.body}</p><span className="dossier-briefing-note">{stageBriefing.note}</span></div></section>
    <div className="dossier-top-side">
    <div className={`dossier-viewing ${actions.length?'can-act':''}`}><ShieldCheck size={15}/><span>Viewing as <strong>{roleName}</strong>. {closed?(renewal?'This decision is recorded. An expired document needs renewal; the dossier remains read-only.':continuingObligation?'This decision is recorded. A continuing obligation remains open.':'This record is closed.'):actions.length?'Your role holds the next permitted action.':<>Read-only at this stage; the next action belongs to <strong>{nextGate}</strong>{app.status==='deficiency_raised'? ' — the institution\'s correction response is due first.' : '.'}</>}</span></div>
    <section className="movement-contract" style={{background:'var(--paper)',border:'1px solid var(--rule,#e2e8f0)',borderLeft:'4px solid '+(postDecision?'#d97706':closed?'#059669':actions.length?'#0284c7':openClaimDeficiencies>0?'#d97706':'#475569'),borderRadius:'8px',padding:'14px 18px',margin:0,height:'100%',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'10px'}}>
        <div>
          <span style={{fontFamily:'var(--font-record)',fontSize:'10px',letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--muted,#64748b)',fontWeight:600}}>
            {postDecision?'After the decision':"What's blocking scrutiny"}
          </span>
          <h2 style={{margin:'4px 0 3px',fontSize:'16px',color:'var(--ink,#0f172a)'}}>
            {renewal?'Decision recorded; renewal needed':continuingObligation?'Decision recorded; condition open':closed?'Dossier closed':actions.length?'Ready for your next action':`${currentStage} cannot advance yet`}
          </h2>
          <p style={{margin:0,fontSize:'12px',color:'var(--muted,#475569)'}}>
            {renewal?'The human decision is recorded. Renewal is a registry follow-up; this dossier cannot accept a replacement.':continuingObligation?'The human decision is recorded. The dossier stays read-only while a continuing condition remains open.':closed?'The synthetic decision and its supporting event history are recorded.':(
              <>
                <strong>Open items:</strong> {claimRoute?(unverifiedCount>0?`${unverifiedCount} unresolved · ${openClaimDeficiencies} open ${openClaimDeficiencies===1?'deficiency':'deficiencies'}`:'Claims verified'):'Review checks are the current gate'} · <strong>Next action:</strong> {nextGate} ({actions.length?'You hold the authority':identity.roles.some(r=>r.role==='national_admin')?'Oversight role monitoring this station':`Reserved for ${nextGate}`})
              </>
            )}
          </p>
          {missing.length>0&&<p style={{margin:'8px 0 0',fontSize:'11px',color:'var(--critical,#b42318)'}}><strong>{missing.length} blocker{missing.length===1?'':'s'} before this dossier can advance</strong> · {missing.slice(0,3).join(' · ')}{missing.length>3?` · +${missing.length-3} more`:''}</p>}
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          {openClaimDeficiencies>0&&(
            <button className="button small secondary button-small" onClick={()=>setShowNotice(true)} style={{fontSize:'11px'}}>
              <FileText size={13}/>Correction summary
            </button>
          )}
          {!closed&&(
            <button type="button" className="button small outline button-small" style={{fontSize:'11px',display:'inline-flex',alignItems:'center',gap:'5px'}} onClick={focusUnresolved}>
              Inspect unresolved items <ArrowRight size={13}/>
            </button>
          )}
        </div>
      </div>
      {postDecision&&(
        <div className="callout warning dossier-alert" style={{marginTop:'10px'}}>
          <strong>{renewal?'Expired document needs renewal':'Continuing obligation remains open'}</strong>
          <p>{caseNextStep.action}</p>
          <p><strong>Owner:</strong> {caseNextStep.owner}{renewal?' - No renewal deadline recorded':caseNextStep.due?` - Due ${new Date(caseNextStep.due+'T00:00:00').toLocaleDateString('en-IN')}`:' - No due date recorded'}</p>
          {caseNextStep.detail&&<small>{renewal?caseNextStep.detail:`Evidence requested: ${caseNextStep.detail}`}</small>}
          <small>{caseNextStep.source}</small>
        </div>
      )}
        {data.obligations.filter(item=>item.application_id===app.id).length>0&&(
        <ObligationsRegister app={app} data={{obligations:data.obligations,documents:documents,compliance_evidence:data.compliance_evidence}} identity={identity} repo={repo} run={run} busy={busy}/>
      )}
      {ownerRenewal&&renewalDoc&&(
        <div className="callout dossier-alert" style={{marginTop:'10px',borderColor:'var(--rule,#e2e8f0)'}}>
          <strong>Submit renewal for reviewer verification</strong>
          <p>Replace the expired {renewalDoc.doc_type} ({neutralCopy(renewalDoc.file_name)}, expired {renewalDoc.expires_on}) with one clean replacement. The recorded decision is unchanged; a reviewer verifies the replacement.</p>
          <form className="form-grid" onSubmit={event=>{event.preventDefault();const note=renewalInput.note.trim();if(note.length<10||note.length>1000)return;void run(async()=>{await repo.submitRenewal(app,renewalDoc,{file:renewalInput.file??undefined,documentId:renewalInput.documentId??undefined,note});setRenewalInput({note:'',file:null,documentId:null});},'Renewal recorded. A reviewer still has to verify the replacement.');}}>
            <label className="field">Note<textarea value={renewalInput.note} onChange={event=>setRenewalInput({...renewalInput,note:event.target.value})} minLength={10} maxLength={1000} required/></label>
            <label className="field">Replacement file<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={event=>{const file=event.target.files?.[0]??null;setRenewalInput({...renewalInput,file,documentId:null});}}/></label>
            <label className="field">Or choose a clean uploaded replacement<select value={renewalInput.documentId??''} onChange={event=>setRenewalInput({...renewalInput,documentId:event.target.value||null,file:null})}><option value="">No replacement document</option>{documents.filter(d=>d.id!==renewalDoc.id&&d.doc_type===renewalDoc.doc_type&&d.scan_status==='clean'&&d.sha256&&(!d.expires_on||expiryState(d.expires_on)!=='expired')).map(d=><option key={d.id} value={d.id}>{neutralCopy(d.file_name)}</option>)}</select></label>
            <div className="form-actions"><button className="button" type="submit" disabled={busy||(!renewalInput.file&&!renewalInput.documentId)}>{busy?'Submitting.':'Submit renewal for reviewer verification'}</button><button className="button outline" type="button" onClick={()=>setRenewalInput({note:'',file:null,documentId:null})}>Cancel</button></div>
            <small className="muted">Demo submission records a simulated clean scan; connected upload is scanned before the file can be selected. The institution does not approve its own renewal.</small>
          </form>
        </div>
      )}
      {!ownerRenewal&&renewal&&!renewalDoc&&<div className="callout dossier-alert" style={{marginTop:'10px'}}><strong>No replaceable expired document is recorded.</strong><p>Renewal names an expired document that is not visible in this dossier.</p></div>}
      {!ownerRenewal&&renewal&&renewalDoc&&<div className="callout dossier-alert" style={{marginTop:'10px',background:'var(--info-soft)',borderColor:'var(--info-border)',color:'var(--info-text)'}}><strong>Institution submits the renewal.</strong><p>As a reviewer you verify the replacement evidence once the institution submits it; the recorded decision is unchanged.</p></div>}
      {hasReplacementEvidence&&(
        <div style={{marginTop:'10px',padding:'8px 12px',background:'var(--warning-soft)',border:'1px solid var(--warning-border)',borderRadius:'6px',fontSize:'11px',color:'var(--warning-text)',display:'flex',alignItems:'center',gap:'8px'}}>
          <CircleAlert size={15} style={{flexShrink:0}}/>
          <span>
            <strong>Replacement uploaded · review required.</strong> A current {replacementDoc?.doc_type} ({replacementDoc?.file_name}) is attached but not yet linked to the deficient claim. The correction stays open until the assigned reviewer resolves it and records a re-check.
          </span>
        </div>
      )}
    </section>
    </div>
    </div>
    <div className="responsibility-split" role="group" aria-label="Delay attribution">
      <span className="responsibility-label">Delay attribution</span>
      <span className="responsibility-chip officer"><b>{dualClock.coverageStart?dualClock.officerDays.toFixed(2):'—'}</b> officer processing · working days</span>
      <span className="responsibility-chip institution"><b>{dualClock.coverageStart?dualClock.institutionDays.toFixed(2):'—'}</b> institution response · working days</span>
       {dualClock.paused&&<span className="responsibility-chip paused">Clock paused · with institution{app.paused_remaining_working_days!==null&&app.paused_remaining_working_days!==undefined?` · ${app.paused_remaining_working_days} working days saved`:''}</span>}
      <span className="responsibility-note">Synthetic weekday elapsed time in Asia/Kolkata; weekends are excluded. {dualClock.complete?'Submission-to-closure history is available.':dualClock.coverageStart?'Attribution starts at the captured baseline; earlier cycles are unavailable.':'Complete attribution is unavailable until case history loads.'}</span>
    </div>
    <section className="dossier-route-shell" aria-label="Approval route"><div className="dossier-section-heading"><div className="dossier-heading-group"><div><h2>Approval route</h2><p>Movement is pinned to the version carried by this dossier.</p></div></div><span className="quiet-label"><LockKeyhole size={13}/>Server enforced in connected mode</span></div><div className="workflow-rail-scroll"><WorkflowRail app={app}/></div><div className="dossier-route-note"><span className="route-line-swatch"/>{app.status==='deficiency_raised'?<><strong>Return in route:</strong> Scrutiny query <ArrowLeft size={13}/> Institution correction <ArrowLeft size={13}/> Resubmission</>:<><strong>Current handoff:</strong> {currentStage} · {nextOwner}</>}<span>All deadlines are demo SLAs.</span></div><CaseCustody app={app} data={data}/></section>
    {app.status==='deficiency_raised'&&<div className="callout warning dossier-alert"><strong>Clarification required</strong><p>{lastDeficiency?.reason||'The scrutiny officer has requested corrected evidence. Review the case history.'}</p></div>}
    {app.form_data?.shc_appeal_active==='true'&&<div className="callout dossier-alert" style={{background:'var(--info-soft)',borderColor:'var(--info-border)',color:'var(--info-text)'}}><strong>Synthetic appeal in progress</strong><p>A demo appeal request was recorded. This does not establish an official hearing or regulatory process.</p></div>}
    {editable&&dossierTab!=='scope'&&<div className="dossier-edit-block"><DraftEditor key={`${app.id}-${app.version}`} app={app} run={run} repo={repo} busy={busy}/></div>}
    <div className="dossier-workspace">
      <div className="dossier-review-grid"><aside className="dossier-action-rail" aria-label="Dossier actions"><section className="dossier-action-card">{claimRoute&&(unverifiedCount>0||openClaimDeficiencies>0)&&<p className="dossier-action-note">Claim corrections remain available.</p>}<div className="dossier-action-buttons">{actions.map(a=><button className={`button ${['reject','raise_deficiency'].includes(a)||(a==='pass_scrutiny'&&acceptBlocked)?'outline':''}`} key={a} disabled={busy||(['submit','resubmit'].includes(a)&&missing.length>0)||(a==='pass_scrutiny'&&acceptBlocked)} aria-describedby={a==='pass_scrutiny'&&acceptBlocked?'accept-blocker':undefined} onClick={()=>{if(a==='schedule_evc'||a==='submit_evc_report'&&data.visits.some(visit=>visit.application_id===app.id&&visit.resource_planned&&!visit.completed_at&&visit.planning_state!=='cancelled'))openPlanner();else setAction(a);}}>{actionLabels[a]}</button>)}{!actions.length&&<><span className="quiet-label"><LockKeyhole size={15}/>No stage action at this gate</span>{claimRoute&&!closed&&(unverifiedCount>0||openClaimDeficiencies>0)&&<button type="button" className="text-button" onClick={focusUnresolved}>Open claim corrections <ArrowRight size={13}/></button>}</>}</div>{actions.includes('pass_scrutiny')&&acceptBlocked&&<p id="accept-blocker" className="action-blocker"><CircleAlert size={14}/><span>Resolve {unverifiedCount} unresolved item{unverifiedCount===1?'':'s'} before accepting scrutiny.</span></p>}</section><PersonaController app={app} actions={actions} caseNextStep={caseNextStep}/>{app.decision_reason&&<section className="decision-receipt"><span className="dossier-index-label">DECISION RECEIPT</span><strong>{app.status==='approved'?'Approved':'Rejected'}</strong><p>{app.decision_reason}</p><small>{decisionEvent?.actor_role?.replaceAll('_',' ')??'Recorded decision'} · {decisionEvent?.actor_id??identity.name} · workflow v{app.template_version}</small><span className="mono">Evidence ID: {app.decision_evidence}</span>{openReceipt&&<button className="text-button" onClick={()=>openReceipt(app.id)}>Open full receipt <ArrowRight size={13}/></button>}</section>}<section className={`record-integrity ${audit?audit.intact?'intact':'broken':''}`}><span className="dossier-index-label">RECORD INTEGRITY</span><strong>{audit?audit.intact?'Chain verified. Event history intact.':`Integrity mismatch detected at event ${audit.broken_at??'?'}`:'Not verified'}</strong><p>{audit?`${audit.checked} events checked${replay?' on a temporary copy':' in the stored chain'}.${replay?' Stored events were not changed.':''}`:'Verify the hash-linked event chain before relying on this record.'}</p><small className="chain-scope-note">Chain verification covers the stored event history only. It does not confirm the underlying claims or document validity.</small>{audit?.head&&<span className="mono record-head">HEAD {audit.head}</span>}<div className="record-integrity-actions"><button className="button outline" disabled={busy} onClick={verifyRecord}>{audit&&!replay?'Verify again':'Verify record'}</button></div>{repo.mode==='demo'&&<div className="demo-controls"><span className="demo-controls-label">Demo tool · simulation only</span><div className="record-integrity-actions">{!replay?<button className="text-button" disabled={busy} onClick={simulateTamper}>Simulate tamper</button>:<button className="text-button" disabled={busy} onClick={verifyRecord}>Reset replay</button>}</div><small>{replay?'The mismatch above came from a temporary copy; nothing stored was changed.':'Reproduces a mismatch on a temporary copy inside this demo session. Stored events are untouched.'}</small></div>}{auditAt&&<small>Last checked {auditAt}</small>}</section>{selectedDoc||missingDocs.length>0?<section className="dossier-anchor-card" id="dossier-evidence-anchors"><span className="quiet-label">Evidence anchors</span><div className="dossier-action-anchors">{selectedClaims.length>0?<><span className="quiet-label">Linked claims</span>{selectedClaims.map(claim=><button key={claim.id} className="text-button" onClick={()=>{setDossierTab('review');requestAnimationFrame(()=>requestAnimationFrame(()=>{const el=document.getElementById(`claim-${claim.id}`);if(el){el.tabIndex=-1;el.scrollIntoView({block:'start'});el.focus({preventScroll:true});}}));}}>{neutralCopy(claim.clause_snapshot)}</button>)}</>:null}{missingDocs.length>0?<><span className="quiet-label">Missing required documents</span>{missingDocs.map(type=><button key={type} className="text-button" onClick={()=>{setDossierTab('evidence');requestAnimationFrame(()=>requestAnimationFrame(()=>{const el=document.getElementById(`doc-group-${slug(type)}`);if(el)el.scrollIntoView({block:'start'});;}));}}>{type}</button>)}</>:null}</div></section>:null}</aside>
        <div className="dossier-workbench">
      <div className="dossier-tabbar">
        <div className="dossier-tabs" role="tablist" aria-label="Dossier views" onKeyDown={handleTabKeys}>
          {DOSSIER_TABS.map(([key,label])=><button key={key} type="button" role="tab" id={`dossier-tab-${key}`} aria-selected={dossierTab===key} aria-controls="dossier-workspace-panel" tabIndex={dossierTab===key?0:-1} className={dossierTab===key?'dossier-tab active':'dossier-tab'} onClick={()=>setDossierTab(key)}>{key==='history'?`History (${history?.through??caseEvents.length})`:label}</button>)}
        </div>
        <span className={`readiness-status ${readinessTone}`}>{readinessTone==='ready'?<CheckCircle2 size={13}/>:readinessTone==='pending'||readinessTone==='closed'?<FileCheck2 size={13}/>:<CircleAlert size={13}/>} {readinessLabel}</span>
      </div>
        <div className="dossier-review-main" role="tabpanel" id="dossier-workspace-panel" aria-labelledby={`dossier-tab-${dossierTab}`} tabIndex={-1}>
      {dossierTab==='evidence'&&<section id="evidence" className="dossier-paper"><div className="dossier-paper-heading"><div><div><h2>Evidence index</h2><p>Submission completeness is separate from reviewer completion.</p></div></div><span className="mono">{documents.length} DOCUMENT{documents.length===1?'':'S'} · {completedFields} of {requiredFields.length} fields · {cleanDocuments} of {requiredDocuments.length} required documents</span></div><div className="prototype-dossier-grid evidence-workspace"><aside className="prototype-dossier-nav" aria-label="Documents"><span className="prototype-nav-label">DOCUMENTS</span>{evidenceTypes.map(type=>{const matches=documents.filter(d=>d.doc_type===type);const hasClean=matches.some(d=>d.scan_status==='clean');const norm=evidenceNormsByType.get(type);const canUpload=canUploadEvidence(app,identity,claims,claimDeficiencies,type,data.obligations,documents);return <div className={`prototype-nav-group${dragTarget===type?' drag-over':''}`} key={type} id={`doc-group-${slug(type)}`} onDragOver={canUpload&&!busy?(event:ReactDragEvent)=>{event.preventDefault();setDragTarget(type);}:undefined} onDragLeave={canUpload&&!busy?handleDragLeaveGroup:undefined} onDrop={canUpload&&!busy?(event:ReactDragEvent)=>{event.preventDefault();setDragTarget(null);const file=event.dataTransfer?.files?.[0];if(file)uploadEvidence(type,file);}:undefined}><div className="prototype-nav-group-head"><span>{type}</span>{norm&&<span className="document-tag nav-norm" title={norm.docType+' — recorded norm: '+norm.statement}>{norm.clause}</span>}{hasClean?<span className="document-tag clean"><Check size={10}/>Attached</span>:<span className="document-tag pending">Required</span>}{dragTarget===type&&canUpload&&!busy&&<span className="drop-band"><Upload size={9}/> Drop PDF document here</span>}</div>{matches.map(d=>{const links=data.claim_evidence.filter(l=>l.document_id===d.id).length;const expired=expiryState(d.expires_on)==='expired';return <div className={`document ${expired?'document-expired':''} ${selectedDocId===d.id?'document-selected':''}`} id={`document-${d.id}`} key={d.id}><FileText size={20}/><span><strong><button type="button" className="text-button document-select" aria-pressed={selectedDocId===d.id} onClick={()=>setSelectedDocId(d.id)}>{neutralCopy(d.file_name)}</button></strong><small>{(d.size_bytes/1024).toFixed(0)} KB{expired?` · Expired ${d.expires_on}`:d.expires_on?` · Expiry ${d.expires_on}`:' · No expiry recorded'}{links?` · Linked to ${links} claim${links===1?'':'s'}`:''}</small></span><button className="text-button passport-trigger" aria-label={`View document record for ${neutralCopy(d.file_name)}`} onClick={()=>{setSelectedDocId(d.id);setPassport(d);}}>Record</button><button className="icon-button" aria-label={`Download ${neutralCopy(d.file_name)}`} disabled={busy||d.scan_status!=='clean'} onClick={()=>void run(()=>repo.download(d),'Document downloaded.')}><Download size={17}/></button></div>;})}{canUpload&&<label className={`upload-button button-small ${busy?'disabled':''}`}><Upload size={14}/>{matches.length?'Add replacement evidence':'Upload document'}<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} aria-label={`Upload ${type}`} onChange={e=>{const file=e.target.files?.[0];e.target.value='';uploadEvidence(type,file);}}/></label>}</div>;})}<div className="prototype-nav-facts"><span>{documents.length} file{documents.length===1?'':'s'}</span><span>{claimRoute?`${verifiedClaims} of ${claims.length} claims resolved`:`${reviewedChecks} of ${checklist.length} review checks`}</span></div></aside>
      <div className="prototype-dossier-main"><section className="prototype-evidence" aria-label="Selected document"><div className="prototype-section-head"><h2>{selectedDoc?selectedDoc.file_name:'No document selected'}</h2></div>{selectedDoc?(()=>{const expired=expiryState(selectedDoc.expires_on)==='expired';const sameType=documents.filter(d=>d.doc_type===selectedDoc.doc_type);const hasExpiredPair=sameType.some(d=>expiryState(d.expires_on)==='expired')&&sameType.some(d=>d.scan_status==='clean'&&(!d.expires_on||expiryState(d.expires_on)!=='expired'));return <div className="prototype-document-surface"><DocumentValidity key={selectedDoc.id+':'+selectedDoc.validity_reviewed_at} doc={selectedDoc} app={app} data={data} identity={identity} repo={repo} run={run} busy={busy}/><DocumentPreview document={selectedDoc} claim={selectedClaims[0]?.statement_snapshot}/><dl className="prototype-document-facts"><div><dt>File security</dt><dd>{selectedDoc.scan_status==='clean'?'Clean scan':selectedDoc.scan_status==='pending'?'Quarantined':'Rejected'}</dd></div><div><dt>Validity</dt><dd className={expired?'expired':''}>{selectedDoc.expires_on?expired?`Expired ${selectedDoc.expires_on}`:`Valid to ${selectedDoc.expires_on}`:'No expiry recorded'}</dd></div><div><dt>Type</dt><dd>{selectedDoc.doc_type}</dd></div><div><dt>Size</dt><dd>{(selectedDoc.size_bytes/1024).toFixed(0)} KB</dd></div><div><dt>Uploaded</dt><dd>{new Date(selectedDoc.uploaded_at).toLocaleDateString('en-IN')}</dd></div><div><dt>Origin</dt><dd>{repo.mode==='demo'?'Synthetic file':'Private download'}</dd></div></dl><div className="inline"><button className="button outline" disabled={busy||selectedDoc.scan_status!=='clean'} onClick={()=>void run(()=>repo.download(selectedDoc),'Document downloaded.')}><Download size={15}/>Download</button><button className="text-button passport-trigger" aria-label={`View document record for ${neutralCopy(selectedDoc.file_name)}`} onClick={()=>setPassport(selectedDoc)}>Open document record</button></div>{hasExpiredPair&&<div className="replacement-note"><Clock3 size={14}/><p>A newer valid {selectedDoc.doc_type} is attached. The outdated document stays on file for its history; its claim keeps the deficiency until the new document is reviewed, linked, and re-verified.</p></div>}{selectedSignals.length>0&&<div className="prototype-signal-list"><h3>Integrity signals</h3><ul>{selectedSignals.map(signal=><li key={signal.id}><CircleAlert size={13}/><span>{signal.signal_type.replaceAll('_',' ')} · {signal.disposition}</span></li>)}</ul></div>}<div className="prototype-doc-claims"><h3>Claims backed by this document</h3>{selectedClaims.length?<ul>{selectedClaims.map(claim=><li key={claim.id}><span>{neutralCopy(claim.statement_snapshot)}</span><Badge status={claim.status as Status}/></li>)}</ul>:<p className="quiet">This document is not linked to any claim yet.</p>}</div></div>;})():<div className="prototype-empty-surface"><FileText size={30}/><p className="quiet">No document is attached to this case yet.</p></div>}</section></div>
      </div><p className="panel-footnote">PDF, PNG or JPEG · Up to 10 MB. {repo.mode==='demo'?'Seeded files are watermarked synthetic samples served from public/samples/. Nothing personal or official.':'Unscanned documents cannot be downloaded or used for submission.'}</p></section>}
      {dossierTab==='review'&&<div id="dossier-unresolved" className="review-workbench-main review-stack">
      {claimRoute&&<Preflight app={app} data={data} openTarget={target=>{if(target.startsWith('document-')){setSelectedDocId(target.slice(9));setDossierTab('evidence');}else setDossierTab('review');requestAnimationFrame(()=>requestAnimationFrame(()=>{const element=document.getElementById(target);if(element){element.tabIndex=-1;element.scrollIntoView({block:'start'});element.focus({preventScroll:true});}}));}}/>}
      {claimRoute?<ClaimLedger app={app} claims={claims} claimEvidence={claimEvidence} documents={documents} deficiencies={claimDeficiencies} identity={identity} repo={repo} run={run} busy={busy} openEvidence={id=>{setSelectedDocId(id);setDossierTab('evidence');}}/>:<section id="checks" className="dossier-paper"><div className="dossier-paper-heading"><div><div><h2>Review checks</h2><p>Reviewer findings stay distinct from evidence readiness.</p></div></div><span className="mono">{app.template_snapshot.checklist.length} REQUIRED CHECKS</span></div><div className="checklist dossier-checklist">{app.template_snapshot.checklist.map(item=>{const verdict=data.checklist.find(c=>c.application_id===app.id&&c.item===item);return <div className="checklist-row" key={item}><span className={verdict?.passed?'check-symbol checked':'check-symbol'}>{verdict?.passed?<Check size={14}/>:<FileCheck2 size={15}/>}</span><div><strong>{item}</strong><small>{verdict?`${verdict.passed?'Verified':'Issue identified'} · ${verdict.note||'No note'}`:'Not reviewed'}</small></div>{canCheck?<div className="inline"><button className="button small secondary button-small" disabled={busy} onClick={()=>void run(()=>repo.checklist(app,item,true,'Synthetic evidence reviewed.'),'Checklist updated.')} aria-label={`Verify ${item}`}>Verify</button><button className="button small outline button-small" disabled={busy} onClick={()=>void run(()=>repo.checklist(app,item,false,'Issue requires clarification.'),'Issue recorded.')} aria-label={`Flag ${item}`}>Flag</button></div>:<span className="quiet-label">{verdict?.passed?'Verified':verdict?'Flagged':'Pending'}</span>}</div>;})}</div></section>}</div>}{dossierTab==='history'&&<><section id="history" className="dossier-paper"><div className="dossier-paper-heading"><div><div><h2>Decision history</h2><p>Every movement leaves a receipt.</p></div></div><span className="mono">{caseEvents.length} EVENTS</span></div><Timeline events={history?.events??caseEvents}/></section><ReviewReplay app={app} history={history} error={historyError} retry={()=>setHistoryAttempt(value=>value+1)}/></>}
      {dossierTab==='scope'&&<ApprovalScope key={app.id+':'+app.scope_revision} app={app} data={data} identity={identity} repo={repo} run={run} busy={busy}/>}
      {dossierTab==='policy'&&<>
      <section id="advisory" className="dossier-paper"><div className="dossier-paper-heading"><div><div><h2>Document pre-check</h2><p>Checks completeness and metadata. Advisory only; an authorised officer decides.</p><small className="advisory-dependency-note">Runs against the local advisory service; start it (with the rest) using <code>npm run local:start</code>. A pre-check result never changes workflow status.</small></div></div><button className="button outline" disabled={busy} onClick={()=>void run(async()=>{setAdvisory(await repo.advisory(app,documents));},'Pre-check prepared. Workflow status is unchanged.')}>Run document check</button></div>{advisory?<div className="advisory-result"><div className="inline"><span className="document-tag clean">Pre-check result</span><span className="quiet-label">Follow-up: {advisory.automation.state}</span></div><p>{advisory.summary}</p>{advisory.warnings.length>0&&<ul>{advisory.warnings.map(w=><li key={w}>{w}</li>)}</ul>}<div className="advisory-trace">{advisory.trace.map(node=><span key={node}><Check size={12}/>{node.replaceAll('_',' ')}</span>)}</div><small>{advisory.disclaimer}</small></div>:<div className="advisory-result"><p>Run a document completeness and metadata check before human review. It flags gaps; it does not change workflow status.</p><small>Advisory only. Human review and decisions remain with the assigned authorities.</small></div>}</section>
      <PolicyImpact data={data} app={app}/></>}
    </div></div></div></div>
    {showNotice&&<Dialog title="Synthetic correction summary" onClose={()=>setShowNotice(false)}>
      <p className="muted"><strong>Demonstration only.</strong> This summary records synthetic review requests. It is not an Institutional Review notice or regulatory direction.</p>
      <p><strong>{app.ref_no}</strong> · {institution}</p>
      <div className="correction-summary">{claimDeficiencies.filter(item=>['open','escalated'].includes(item.status)).map(item=><article key={item.id}>
        <h3>{claims.find(claim=>claim.id===item.claim_id)?.statement_snapshot??'Recorded claim'}</h3>
        <p><strong>Observation:</strong> {neutralCopy(item.observation)}</p>
        <p><strong>Requested correction:</strong> {neutralCopy(item.remedy)}</p>
        <p><strong>Demo due date:</strong> {new Date(item.due_at).toLocaleDateString('en-IN')}</p>
        <small>Recorded by {item.raised_by} · {item.clause}</small>
      </article>)}</div>
      <div className="form-actions"><button className="button outline button-small" type="button" onClick={()=>window.print()}><Printer size={13}/>Print demo summary</button><button className="button" type="button" onClick={()=>setShowNotice(false)}>Close summary</button></div>
    </Dialog>}
    {passport&&<EvidencePassport document={passport} app={app} data={data} identity={identity} repo={repo} run={run} busy={busy} openCase={openCase} close={()=>setPassport(null)}/>}
    {action&&<ActionDialog key={action} action={action} app={app} data={data} claims={claims.filter(c=>!claimDeficiencies.some(d=>d.claim_id===c.id&&['open','escalated'].includes(d.status)))} documents={documents} run={run} repo={repo} busy={busy} close={()=>setAction(null)}/>}</section>
}
function DraftEditor({app,repo,run,busy}:{app:Application;repo:Repository;run:Run;busy:boolean}){const [title,setTitle]=useState(app.title);const [fields,setFields]=useState(app.form_data);return <Panel title="Application details" subtitle="Save changes before uploading or submitting."><form onSubmit={e=>{e.preventDefault();void run(()=>repo.saveDraft(app,title,fields),'Draft saved securely.');}}><label className="field">Application title<input value={title} onChange={e=>setTitle(e.target.value)} minLength={5} maxLength={200} required/></label><div className="form-grid">{app.template_snapshot.required_fields.map(f=><label className="field" key={f.key}>{neutralCopy(f.label)}<input value={fields[f.key]??''} maxLength={4000} onChange={e=>setFields({...fields,[f.key]:e.target.value})}/></label>)}</div><button className="button" disabled={busy}>Save draft</button></form></Panel>;}
function ActionDialog({action,app,data,claims,documents,repo,run,busy,close}:{action:Action;app:Application;data:Workspace;claims:Workspace['claims'];documents:Workspace['documents'];repo:Repository;run:Run;busy:boolean;close:()=>void}){
  const [approval,setApproval]=useState(()=>initialDecision(app,data));const [reason,setReason]=useState('');const [evidence,setEvidence]=useState('');const [evc,setEvc]=useState(app.template_snapshot.evc_mode==='required');const [scheduled,setScheduled]=useState('');const [recommendation,setRecommendation]=useState('recommend');
  const [claimId,setClaimId]=useState('');const [requestId]=useState(()=>crypto.randomUUID());const decision=['approve','reject'].includes(action);const needsReason=!['submit','start_scrutiny','schedule_evc'].includes(action);
  async function submit(e:FormEvent){e.preventDefault();const payload:Record<string,unknown>={};if(action==='raise_deficiency'&&claims.length){payload.claim_id=claimId;payload.remedy=reason;}if(action==='pass_scrutiny')payload.evc=evc;if(decision)payload.evidence=evidence;if(action==='approve')payload.approval=approval;if(action==='schedule_evc')payload.scheduled_for=new Date(scheduled).toISOString();if(action==='submit_evc_report')payload.recommendation=recommendation;const ok=await run(()=>repo.transition({application:app,action,reason,payload,requestId}),'Demo case updated and audited.');if(ok)close();}
  return <Dialog title={actionLabels[action]} onClose={()=>{if(!busy)close();}}><form onSubmit={e=>void submit(e)}><p className="muted">{app.ref_no} · Version {app.version}. This action is a synthetic demonstration.</p>
    {action==='request_shc'&&<div className="callout" style={{background:'var(--info-soft)',color:'var(--info-text)',borderLeft:'3px solid var(--info-border)',marginBottom:'12px'}}><strong>Synthetic appeal request</strong><p>This isolated demo can record appeal grounds. The connected backend does not yet support this workflow.</p></div>}
    {needsReason&&<label className="field">{action==='submit_evc_report'?'Visit report':action==='request_shc'?'Demo appeal grounds':'Reason'}<textarea value={reason} onChange={e=>setReason(e.target.value)} required minLength={action==='submit_evc_report'?20:action==='request_shc'?15:10} maxLength={5000} placeholder={action==='request_shc'?'Describe the synthetic correction and grounds for reconsideration.':'Explain the evidence and rationale for this action.'}/></label>}
    {action==='raise_deficiency'&&claims.length>0&&<label className="field">Affected claim<select value={claimId} onChange={e=>setClaimId(e.target.value)} required><option value="">Select a claim from this case</option>{claims.map(c=><option key={c.id} value={c.id}>{neutralCopy(c.clause_snapshot)} · {neutralCopy(c.statement_snapshot)}</option>)}</select></label>}
    {action==='pass_scrutiny'&&app.template_snapshot.evc_mode!=='none'&&<label className="checkbox-field"><input type="checkbox" checked={evc} disabled={app.template_snapshot.evc_mode==='required'} onChange={e=>setEvc(e.target.checked)}/>Route to an Expert Visit Committee</label>}
    {decision&&<label className="field">Supporting case evidence<select value={evidence} onChange={e=>setEvidence(e.target.value)} required><option value="">Select a clean document</option>{documents.filter(d=>d.scan_status==='clean'&&(action!=='approve'||documentEligible(d))).map(d=><option key={d.id} value={d.id}>{d.doc_type} · {neutralCopy(d.file_name)}</option>)}</select></label>}
    {action==='approve'&&<ApprovalDecisionFields value={approval} onChange={setApproval} app={app} data={data}/>}
    {action==='schedule_evc'&&<label className="field">Visit date and time (your local time)<input type="datetime-local" value={scheduled} required onChange={e=>setScheduled(e.target.value)}/></label>}
    {action==='submit_evc_report'&&<label className="field">Recommendation<select value={recommendation} onChange={e=>setRecommendation(e.target.value)}><option value="recommend">Recommend</option><option value="conditional">Conditional</option><option value="not_recommend">Do not recommend</option></select></label>}
    {action==='submit'&&<div className="callout"><strong>Ready for human scrutiny</strong><p>Submission locks your draft. The backend checks all required fields and clean evidence again.</p></div>}
    <div className="form-actions"><button className="button secondary button-small" type="button" onClick={close} disabled={busy}>Cancel</button><button className="button" disabled={busy}>{busy?'Saving…':`Confirm ${actionLabels[action].toLowerCase()}`}</button></div>
  </form></Dialog>;
}
