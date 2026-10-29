import {useEffect,useRef,useState} from 'react';
import {CalendarClock,Camera,Pin,ShieldCheck,UserRound,X} from 'lucide-react';
import {statusLabels,type Identity,type InspectionEvidence,type InspectionLocation,type Repository,type Workspace} from '../domain/model';
import {formatDateTime} from './DisplayPreferences';
import {Empty,ViewHeader} from './common';
import type {Run} from './Applications';
import {neutralCopy} from '../domain/presentation';
import './intelligence.css';

const visitLabels:Record<string,string>={QUEUED:'Queued',SCHEDULED:'Scheduled',CONFIRMED:'Confirmed',IN_PROGRESS:'In progress',COMPLETED:'Completed',CANCELLED:'Cancelled',RESCHEDULING_REQUIRED:'Rescheduling required'};
const localDate=(value:string)=>{const date=new Date(value);const offset=date.getTimezoneOffset()*60000;return new Date(date.getTime()-offset).toISOString().slice(0,16);};

export function InspectionEvidence({data,identity,repo,run,busy}:{data:Workspace;identity:Identity;repo:Repository;run:Run;busy:boolean}){
  const demo=repo.mode==='demo';
  const visibleCases=data.applications.filter(app=>app.owner_id===identity.id||identity.roles.some(role=>role.role==='national_admin'||(role.role!=='institution'&&role.region===app.region)));
  const evcVisits=data.evc_visits.filter(visit=>visibleCases.some(app=>app.id===visit.application_id));
  const visit=evcVisits.find(item=>!['CANCELLED','COMPLETED'].includes(item.status))??evcVisits.at(-1)??null;
  const app=visit?data.applications.find(item=>item.id===visit.application_id):null;
  const members=visit?data.evc_members.filter(item=>item.evc_visit_id===visit.id&&item.active):[];
  const member=members.find(item=>item.user_id===identity.id);
  const isMember=Boolean(member&&member.response_status==='ACCEPTED');
  const manager=Boolean(app&&identity.roles.some(role=>role.role==='national_admin'||(['evc_coordinator','regional_officer'].includes(role.role)&&role.region===app.region)));
  const canCapture=Boolean(visit&&!['CANCELLED','COMPLETED'].includes(visit.status)&&(isMember||manager));
  const [location,setLocation]=useState<InspectionLocation|null>(null);
  const [locationError,setLocationError]=useState<string|null>(null);
  const [files,setFiles]=useState<File[]>([]);
  const [previews,setPreviews]=useState<Record<string,string>>({});
  const [observations,setObservations]=useState('');
  const [voiceMemo,setVoiceMemo]=useState('');
  const [evidence,setEvidence]=useState<InspectionEvidence[]>([]);
  const [draftId,setDraftId]=useState<string|null>(null);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const objectUrls=useRef<string[]>([]);

  useEffect(()=>{
    if(!visit)return;
    void repo.getInspectionEvidence(visit.id).then(list=>setEvidence(list)).catch(()=>setEvidence([]));
  },[repo,visit?.id]);

  useEffect(()=>{return ()=>{objectUrls.current.forEach(url=>URL.revokeObjectURL(url));};},[]);

  const recordLocation=()=>{
    if(!navigator.geolocation){setLocationError('Geolocation is not available in this browser.');return;}
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(position=>{
      setLocation({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,address:`${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)} (device location)`});
    },error=>{
      setLocationError(error instanceof Error?error.message:'Location could not be read.');
    },{enableHighAccuracy:true,timeout:10000});
  };

  const handleFiles=(event:React.ChangeEvent<HTMLInputElement>)=>{
    const next=Array.from(event.target.files??[]).filter(file=>file.type.startsWith('image/'));
    if(next.length===0)return;
    setFiles(prev=>[...prev,...next]);
    next.forEach(file=>{
      const url=URL.createObjectURL(file);
      objectUrls.current.push(url);
      setPreviews(prev=>({...prev,[file.name]:url}));
    });
  };

  const removeFile=(name:string)=>{
    setFiles(prev=>prev.filter(f=>f.name!==name));
    setPreviews(prev=>{const next={...prev};delete next[name];return next;});
  };

  const captureAndSubmit=async()=>{
    if(!app||!visit)return;
    setSubmitting(true);setError(null);
    const appRef=app; const visitRef=visit; const loc=location;
      try{
        if(!location)throw new Error('Record the site location before capturing evidence.');
        if(observations.trim().length<10)throw new Error('Describe the site observations in at least 10 characters.');
        const docIds: string[] = [];
        for(const file of files){
        const ok=await run(async()=>await repo.upload(appRef,'Site inspection photo',file),'Site photo uploaded as a case document.');
        if(ok===false)throw new Error('Failed to upload a site photograph.');
        const fresh=await repo.workspace();
        const doc=fresh.documents.find(item=>item.file_name===file.name&&item.application_id===appRef.id);
        if(!doc)throw new Error('Uploaded photograph was not recorded.');
        docIds.push(doc.id);
      }
      let evidenceId=draftId;
      if(!evidenceId){
        const result=await repo.captureInspectionEvidence(appRef,visitRef.id,{captured_at:new Date().toISOString(),location:loc!,observations:observations.trim(),voice_memo:voiceMemo.trim()||null,documents:docIds});
        evidenceId=result.evidence_id;
        setDraftId(evidenceId);
      }
      await run(async()=>await repo.submitInspectionEvidence(evidenceId),'Inspection evidence submitted and linked to the case.');
      const updated=await repo.getInspectionEvidence(visitRef.id);
      setEvidence(updated);
      setFiles([]);setPreviews({});setObservations('');setVoiceMemo('');setDraftId(null);setLocation(null);
    }catch(err){
      setError(err instanceof Error?err.message:'Inspection evidence could not be captured.');
    }finally{
      setSubmitting(false);
    }
  };

  const institutionName=app?data.institutions.find(i=>i.id===app.institution_id)?.name??'Institution unavailable':'Institution unavailable';
  const header=visit?<><div className="inline"><span className="document-tag"><CalendarClock size={12}/> {statusLabels[app?.status??'evc_scheduled']}</span><span className={visit.status==='CONFIRMED'?'document-tag clean':'document-tag'}>{visitLabels[visit.status]??visit.status}</span>{app&&<span className="document-tag">Visit {visit.schedule_version}</span>}</div><p className="muted">{app?.ref_no??'Unknown case'} - {institutionName} - {app?.title??'Untitled'}</p></> : null;

  return (
    <div>
      <ViewHeader title="Site inspection evidence" summary="Capture site photographs, location and time, voice memo and observations during an EVC visit, then submit them to the case dossier." count={String(evcVisits.length).padStart(2,'0')} label="EVC visits requiring evidence" level="h2"/>
      <section className="dossier-paper intelligence-panel">
        {!demo&&<div className="callout warning"><strong>Connected workspace</strong><p>Site inspection evidence capture is available in the isolated demo workspace only. This screen shows recorded evidence and does not offer capture.</p></div>}
        {!visit&&<Empty title="No EVC visit ready for inspection">An EVC visit must be scheduled and accepted by the committee before site evidence can be captured.</Empty>}
        {visit&&(
          <div>
            {header}
            {canCapture?(
              <div className="scope-editor">
                <h3>Capture site evidence</h3>
                <p className="muted">Record the visit location, attach site photographs, add a voice memo transcription and observations. Evidence is linked to this visit and the application dossier.</p>
                <div className="form-grid"><label className="field">Visit location<button className="button outline" type="button" disabled={busy||submitting} onClick={recordLocation}><Pin size={13}/> Record current location</button></label></div>
                <div className="form-grid"><label className="field">Captured at<input type="datetime-local" value={localDate(new Date().toISOString())} readOnly/></label></div>
                {location?(
                  <div className="inline"><span className="document-tag"><Pin size={11}/> {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span><span className="muted">±{Math.round(location.accuracy??0)} m</span></div>
                ):null}
                {location?<p className="muted">{location.address}</p>:null}
                {locationError&&<div className="callout warning" role="alert">{locationError}</div>}
                <label className="field">Site photographs<input type="file" multiple accept="image/*" onChange={handleFiles} style={{marginTop:'6px'}}/></label>
                {files.length>0&&(
                  <div className="photo-previews">
                    {files.map(file=>{const url=previews[file.name];const sizeText=(file.size/1024).toFixed(1)+' KB';return (
                      <div key={file.name} className="photo-preview">
                        <img className="photo-preview-img" src={url} alt={file.name}/>
                        <div className="photo-preview-meta"><strong>{neutralCopy(file.name)}</strong><small>{sizeText}</small></div>
                        <button type="button" className="text-button" onClick={()=>removeFile(file.name)}><X size={12}/></button>
                      </div>
                    );})}
                  </div>
                )}
                <label className="field">Voice memo (transcribed)<textarea value={voiceMemo} onChange={event=>setVoiceMemo(event.target.value)} rows={2} maxLength={1000} placeholder="Transcribe the voice memo recorded during the site visit."/></label>
                <label className="field">Site observations / findings<textarea value={observations} onChange={event=>setObservations(event.target.value)} rows={3} maxLength={2000} required placeholder="Describe what was observed at the site."/></label>
                <button className="button" type="button" disabled={busy||submitting||!canCapture||!location||observations.trim().length<10} onClick={captureAndSubmit}><Camera size={15}/> Capture &amp; submit evidence</button>
              </div>
            ):(
              <div className="callout"><strong>Evidence capture not available</strong><p>{!isMember&&!manager?'You are not an accepted committee member for this visit, or do not hold a coordinator/regional grant for this case region.':''}{visit.status==='COMPLETED'?'This visit is already complete.':'Visit evidence capture is closed.'}</p></div>
            )}
            {error&&<div className="callout warning" role="alert">{error}</div>}
            {evidence.length>0&&(
              <div className="scope-editor">
                <h3>Submitted inspection evidence</h3>
                {evidence.map(item=>{const docNames=item.documents.map(id=>{const d=data.documents.find(doc=>doc.id===id);return d?neutralCopy(d.file_name):`document ${id}`;}).join(', ');return (
                  <div key={item.id} className="evidence-row">
                    <div className="evidence-row-head"><span className="mono">{formatDateTime(item.captured_at)}</span><span className={item.status==='submitted'?'document-tag clean':'document-tag pending'}>{item.status==='submitted'?'Submitted':'Draft'}</span></div>
                    <p className="muted">{item.observations}</p>
                    {item.voice_memo&&<p className="muted"><span className="quiet-label">Voice memo</span> {item.voice_memo}</p>}
                    <p className="muted"><span className="quiet-label">Location</span> {item.location.address}</p>
                    {docNames?<p className="muted"><span className="quiet-label">Photographs</span> {docNames}</p>:null}
                    <span className="muted"><UserRound size={11}/> {item.submitted_by??'Draft'}</span>
                  </div>
                );})}
              </div>
            )}
            {!canCapture&&visit&&!isMember&&!manager&&<p className="muted">Join the committee as an accepted member, or coordinate this region, to capture site evidence for this visit.</p>}
          </div>
        )}
      </section>
      <div className="support-footnote"><ShieldCheck size={14}/>Inspection evidence is linked to the EVC visit and application dossier. Photographs are scanned like any other case document before they can be relied on.</div>
    </div>
  );
}
