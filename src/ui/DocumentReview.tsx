import {useMemo,useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {formatDateTime} from './DisplayPreferences';
import {neutralCopy} from '../domain/presentation';
import {demoNow} from '../domain/virtualClock';
import {type Application,type Identity,type Repository,type Workspace} from '../domain/model';
import {Empty,ViewHeader} from './common';
import type {Run} from './Applications';

interface FieldSpec { key:string; label:string; extract:(text:string)=>string|null; }
const FIELD_SPECS:FieldSpec[]=[
  {key:'issuer',label:'Issuer',extract:text=>{const m=text.match(/(?:issuer|issuing authority)[:\s]+([^\n]+)/i);return m?m[1].trim():null;}},
  {key:'documentNumber',label:'Document number',extract:text=>{const m=text.match(/(?:document\s*(?:no|number)|reg(?:istration)?\s*no\.?|deed\s*no\.?)\s*[:\s]+([A-Z0-9\/\-]+)/i);return m?m[1].trim():null;}},
  {key:'expiryDate',label:'Expiry date',extract:text=>{const m=text.match(/(?:valid\s*(?:through|to|until)|expiry\s*date)\s*[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i);return m?m[1].trim():null;}},
];
interface ReviewFieldValue { value:string; confirmed:boolean; }
interface RecordedFinding {
  id:string;sourceDocumentId:string;sourceFileName:string;comparedDocumentId:string|null;comparedFileName:string|null;
  fields:Record<string,{extracted:string|null;reviewer:string;confirmed:boolean}>;disposition:string;note:string|null;recordedAt:string;
}
function extractPdfText(bytes:Uint8Array):string{
  const text=typeof TextDecoder!=='undefined'?new TextDecoder().decode(bytes):String.fromCharCode(...bytes);
  const parts:string[]=[];
  let pos=0;
  while(true){
    const streamStart=text.indexOf('stream',pos);
    if(streamStart<0)break;
    const streamDataStart=text.indexOf('\n',streamStart)+1;
    const streamEnd=text.indexOf('endstream',streamDataStart);
    if(streamEnd<0)break;
    const stream=text.slice(streamDataStart,streamEnd);
    const tjMatches=[...stream.matchAll(/\(([^)]*)\)\s*Tj/g)];
    for(const m of tjMatches)parts.push(m[1]);
    const tjArrayMatches=[...stream.matchAll(/\[([^\]]*)\]\s*TJ/g)];
    for(const m of tjArrayMatches){
      const inner=m[1];
      const stringMatches=[...inner.matchAll(/\(([^)]*)\)/g)];
      for(const sm of stringMatches)parts.push(sm[1]);
    }
    pos=streamEnd+9;
  }
  return parts.join(' ');
}
function parseFields(text:string):Record<string,string|null>{
  const result:Record<string,string|null>={};
  for(const spec of FIELD_SPECS)result[spec.key]=spec.extract(text);
  return result;
}
function jurisdictionAllows(identity:Identity,application:Application|undefined):boolean{
  if(!application)return false;
  return identity.roles.some(role=>role.role==='national_admin'||(role.role==='regional_officer'&&role.region===application.region)||(role.role==='institution'&&application.owner_id===identity.id));
}
function dispositionLabel(disposition:string):string{
  if(disposition==='confirmed')return 'All extracted fields confirmed';
  if(disposition==='corrected')return 'At least one field corrected';
  if(disposition==='flagged')return 'Discrepancy flagged for review';
  return 'Not yet reviewed';
}
export function DocumentReview({data,identity,repo,run,busy}:{data:Workspace;identity:Identity;repo:Repository;run:Run;busy:boolean}){
  void run;
  const reviewable=data.documents.filter(document=>document.scan_status==='clean');
  const [sourceDocumentId,setSourceDocumentId]=useState<string|null>(reviewable[0]?.id??null);
  const [fieldValues,setFieldValues]=useState<Record<string,ReviewFieldValue>>({});
  const [disposition,setDisposition]=useState<'none'|'confirmed'|'corrected'|'flagged'>('none');
  const [dispositionNote,setDispositionNote]=useState('');
  const [findings,setFindings]=useState<RecordedFinding[]>([]);
  const [extraction,setExtraction]=useState<Record<string,string|null>|null>(null);
  const [extractionError,setExtractionError]=useState<string|null>(null);
  const sourceDocument=reviewable.find(document=>document.id===sourceDocumentId);
  const application=sourceDocument?data.applications.find(application=>application.id===sourceDocument!.application_id):undefined;
  const canRecord=jurisdictionAllows(identity,application);
  useMemo(()=>{
    setExtraction(null);setExtractionError(null);setDisposition('none');setDispositionNote('');
    const next:Record<string,ReviewFieldValue>={};
    for(const spec of FIELD_SPECS)next[spec.key]={value:'',confirmed:false};
    setFieldValues(next);
    if(!sourceDocument)return;
    (async()=>{
      try{
        if(!sourceDocument.file_path.startsWith('/samples/')){setExtractionError('Sample bytes are not available for this document.');return;}
        const response=await fetch(sourceDocument.file_path);
        if(!response.ok)throw new Error('Sample asset unavailable.');
        const bytes=new Uint8Array(await response.arrayBuffer());
        const text=extractPdfText(bytes);
        if(!text.trim())throw new Error('No extractable text found in the sample bytes.');
        setExtraction(parseFields(text));
      }catch(err){
        setExtractionError(err instanceof Error?err.message:'Extraction failed.');
      }
    })();
  },[sourceDocumentId]);
  const currentFields=extraction??Object.fromEntries(FIELD_SPECS.map(spec=>[spec.key,null]));
  const allReviewed=Object.values(fieldValues).every(value=>value.confirmed);
  const recordReview=async()=>{if(!sourceDocument||!canRecord)return;const finding:RecordedFinding={id:'doc-review-'+crypto.randomUUID(),sourceDocumentId:sourceDocument.id,sourceFileName:sourceDocument.file_name,comparedDocumentId:null,comparedFileName:null,fields:Object.fromEntries(Object.entries(fieldValues).map(([key,value])=>[key,{extracted:currentFields[key]??null,reviewer:value.value,confirmed:value.confirmed}])),disposition,note:dispositionNote.trim()||null,recordedAt:formatDateTime(demoNow())};try{        await repo.recordIntegritySignal({application_id:sourceDocument.application_id,document_id:sourceDocument.id,signal_type:'document_review',severity:disposition==='flagged'?'critical':disposition==='corrected'?'warning':'info',fingerprint:`doc-review:${sourceDocument.id}:${Date.now()}`,detail:{fields:finding.fields,disposition,note:finding.note},reason:`Document review of ${sourceDocument.file_name}: ${disposition}. ${finding.note??''}`});setFindings([finding,...findings]);setDisposition('none');setDispositionNote('');}catch(err){setExtractionError(err instanceof Error?err.message:'Finding could not be recorded.');}};
  return (
    <section className="page-stack">
      <ViewHeader title="Document review" summary="Extract fields from a document, confirm or correct each field, and record the reviewer finding as an integrity signal." count={String(findings.length).padStart(2,'0')} label="recorded findings"/>
      {reviewable.length===0?<Empty title="No reviewable documents">Uploaded or generated samples appear here for field review.</Empty>:
      <>
        <label className="field">Source document<select value={sourceDocumentId??''} onChange={event=>setSourceDocumentId(event.target.value||null)}>{reviewable.map(document=><option key={document.id} value={document.id}>{document.file_name} · {document.doc_type}</option>)}</select></label>
        {sourceDocument&&<section className="dossier-paper intelligence-panel"><div className="spread"><div><h2>Document preview</h2><p className="muted">{neutralCopy(sourceDocument.file_name)} · {sourceDocument.doc_type} · {sourceDocument.scan_status}</p></div><span className="document-tag">{sourceDocument.scan_status}</span></div>
          <label className="field">Extracted text<textarea readOnly rows={6} value={extractionError?extractionError:'Extracting text from sample bytes…'}/></label>
          {extractionError&&<p className="callout warning">{extractionError}</p>}
          {!extractionError&&<fieldset className="scope-editor"><legend>Confirm or correct each field</legend>{FIELD_SPECS.map(spec=>{const current=fieldValues[spec.key]??{value:currentFields[spec.key]??'',confirmed:false};return <label className="field" key={spec.key}>{spec.label}<input value={current.value} onChange={event=>setFieldValues({...fieldValues,[spec.key]:{value:event.target.value,confirmed:current.confirmed}})} /><span className="muted small">Extracted: {current.value||'—'}</span><label className="checkbox-field"><input type="checkbox" checked={current.confirmed} onChange={event=>setFieldValues({...fieldValues,[spec.key]:{value:current.value,confirmed:event.target.checked}})}/><span>Field confirmed</span></label></label>;})}</fieldset>}
          <label className="field">Disposition<select value={disposition} onChange={event=>setDisposition(event.target.value as 'none'|'confirmed'|'corrected'|'flagged')}><option value="none">Not yet reviewed</option><option value="confirmed">Fields confirmed</option><option value="corrected">Fields corrected</option><option value="flagged">Discrepancy flagged</option></select></label>
          <label className="field">Reviewer note<textarea minLength={disposition==='flagged'?10:0} maxLength={1000} value={dispositionNote} onChange={event=>setDispositionNote(event.target.value)} required={disposition==='flagged'} /></label>
          <button className="button" type="button" onClick={recordReview} disabled={busy||!allReviewed||!canRecord||disposition==='none'||(disposition==='flagged'&&dispositionNote.trim().length<10)}>Record reviewer finding</button>
          {!canRecord&&<p className="muted">You do not have jurisdiction over this case's document; the finding cannot be recorded.</p>}</section>}
        {findings.length>0&&<section className="dossier-paper intelligence-panel"><h2>Recorded findings</h2><div className="table-wrap"><table><thead><tr><th scope="col">Source</th><th scope="col">Disposition</th><th scope="col">Recorded</th></tr></thead><tbody>{findings.map(finding=><tr key={finding.id}><td><strong>{neutralCopy(finding.sourceFileName)}</strong></td><td><span className="document-tag">{dispositionLabel(finding.disposition)}</span></td><td><span className="mono">{finding.recordedAt}</span></td></tr>)}</tbody></table></div><p className="support-footnote"><ShieldCheck size={14}/>Findings are recorded as integrity signals in the case audit trail.</p></section>}
      </>
      }
    </section>
  );
}
