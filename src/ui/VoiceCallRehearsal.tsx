import {useMemo,useState} from 'react';
import {PhoneCall,Upload,Trash2} from 'lucide-react';
import {buildVoiceCallPlan,voiceCallDisclaimer,voicePresets} from '../domain/voiceCall';
import type {DispatchNotificationResult} from '../domain/notification';
import type {Repository,Workspace} from '../domain/model';
import type {Run} from './Applications';

export function VoiceCallRehearsal({repo,data,run}:{repo:Repository;data:Workspace;run?:Run}){
  const [applicationId,setApplicationId]=useState(data.applications[0]?.id??'');
  const [preset,setPreset]=useState<string|null>(null);
  const [transcript,setTranscript]=useState('');
  const [recording,setRecording]=useState(false);
  const [result,setResult]=useState<DispatchNotificationResult|null>(null);
  const [uploadedDocumentId,setUploadedDocumentId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const plan=useMemo(()=>transcript.trim()?buildVoiceCallPlan(transcript):null,[transcript]);
  const application=data.applications.find(item=>item.id===applicationId)??data.applications[0];
  const institution=data.institutions.find(item=>item.id===application?.institution_id);
  const uploadedDocument=data.documents.find(item=>item.id===uploadedDocumentId);

  function choosePreset(id:string,text:string){
    setPreset(id);setTranscript(text);setResult(null);setError(null);setUploadedDocumentId(null);
  }

  function editTranscript(text:string){
    setTranscript(text);setPreset(null);setResult(null);setError(null);setUploadedDocumentId(null);
  }

  async function record(){
    if(!plan||!application)return;
    setRecording(true);setResult(null);setError(null);setUploadedDocumentId(null);
    const subject=`Voice follow-up: ${plan.label}`;
    const body=`${application.ref_no}${institution?` · ${institution.name}`:''}. ${plan.detail} ${plan.followUp} Transcript: "${transcript.trim()}"`;
    try{
      const file=new File([transcript],`voice-transcript-${application.ref_no}.txt`,{type:'text/plain'});
      const runFn=run??(async(operation:()=>Promise<void>)=>{await operation();});
      const ok=await runFn(async()=>{
        await repo.upload(application,'Voice Transcript',file);
      },'Voice transcript uploaded as a case document.');
      if(ok===false)return;
      const fresh=await repo.workspace();
      const doc=fresh.documents.find(item=>item.file_name===`voice-transcript-${application.ref_no}.txt`);
      setUploadedDocumentId(doc?.id??null);
      const out=await repo.dispatchNotification({
        applicationId:application.id,
        channel:['voice'],
        kind:plan.notificationKind,
        subject,
        body,
      });
      setResult(out);
    }catch(err){
      setError(err instanceof Error?err.message:'Voice follow-up could not be recorded.');
    }finally{
      setRecording(false);
    }
  }

  return (
    <section className="support-surface demo-voice-rehearsal" aria-labelledby="voice-rehearsal-title">
      <div className="support-surface-heading">
        <div><h2 id="voice-rehearsal-title">Voice reminder rehearsal</h2><p>Type what the contact said during a call. The classifier maps the response to a follow-up outcome, uploads the transcript as a case document, and dispatches an in-app notification with an audit event.</p></div>
        <span className="quiet-label"><PhoneCall size={14}/>Transcript uploaded as case document · notification dispatched</span>
      </div>
      <div className="demo-lab-rehearsal-body">
        <label className="field">Case record
          <select className="field-input" value={application?.id??''} onChange={event=>{setApplicationId(event.target.value);setResult(null);setUploadedDocumentId(null);}}>
            {data.applications.map(item=><option key={item.id} value={item.id}>{item.ref_no} · {item.title}</option>)}
          </select>
        </label>
        <div className="demo-voice-presets" role="group" aria-label="Example call transcripts">
          {voicePresets.map(item=><button key={item.id} className={`button small ${preset===item.id?'':'outline'}`} type="button" aria-pressed={preset===item.id} onClick={()=>choosePreset(item.id,item.transcript)}>{item.label}</button>)}
        </div>
        <label className="field">Call transcript
          <textarea className="field-input" value={transcript} onChange={event=>editTranscript(event.target.value)} rows={3} maxLength={500} placeholder="Type the contact's response, or choose an example above."/>
        </label>
        {plan ? (
          <div className="demo-lab-result">
            <div className="demo-lab-result-head"><strong>{plan.label}</strong><span className={`document-tag ${plan.notificationKind==='ESCALATION'?'expired':plan.notificationKind==='INFO'?'demo':'pending'}`}>{plan.notificationKind}</span></div>
            <p>{plan.detail}</p>
            <p><strong>Follow-up:</strong> {plan.followUp}</p>
            {plan.promisedDate&&<p><strong>Promised date:</strong> <span className="mono">{plan.promisedDate}</span></p>}
          </div>
        ) : (
          <p className="demo-lab-hint">Choose an example transcript or type a response to preview the classified outcome.</p>
        )}
        <div className="form-actions">
          <button className="button" type="button" disabled={!plan||recording||!application} onClick={record}><Upload size={14}/>{recording?'Recording…':'Upload transcript & notify'}</button>
          {transcript&&<button className="button text" type="button" disabled={recording} onClick={()=>{setTranscript('');setPreset(null);setResult(null);setError(null);setUploadedDocumentId(null);}}><Trash2 size={12}/>Clear transcript</button>}
        </div>
        {error&&<p className="callout warning" role="alert">{error}</p>}
        {uploadedDocument&&<div className="demo-lab-result" role="status">
          <div className="demo-lab-result-head"><strong>Transcript uploaded</strong><span className="document-tag">{uploadedDocument.scan_status}</span></div>
          <p><span className="mono">{uploadedDocument.file_name}</span> · {uploadedDocument.doc_type} · {uploadedDocument.size_bytes} bytes · scanned {new Date(uploadedDocument.uploaded_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</p>
        </div>}
        {result&&<div className="demo-lab-result" role="status">
          <div className="demo-lab-result-head"><strong>Voice notification dispatched</strong><span className="document-tag">{result.attempts[0]?.channel} · {result.attempts[0]?.status}</span></div>
          <p>Notification <span className="mono">{result.notificationId}</span> and its audit event are in the workspace record. {voiceCallDisclaimer}</p>
        </div>}
        <p className="support-footnote">{voiceCallDisclaimer} A commitment from a call is a follow-up note. The transcript is uploaded as a case document and can be linked to claims as evidence.</p>
      </div>
    </section>
  );
}
