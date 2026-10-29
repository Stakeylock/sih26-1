import {useCallback,useEffect,useState} from 'react';
import {formatDateTime} from './DisplayPreferences';
import {neutralCopy} from '../domain/presentation';
import type {Identity,Repository,Workspace} from '../domain/model';
import type {FieldKey,FieldSuggestion,ReadingResult} from '../domain/documentReading';
import {Empty,ViewHeader} from './common';
import DocumentReading from './DocumentReading';
import {makeT,useUiLang} from './i18n';
import type {Run} from './Applications';

const KEYS:FieldKey[]=['issuer','document_number','issue_date','expires_on'];
const LABELS:Record<FieldKey,[string,string]>={issuer:['Issuer','जारीकर्ता'],document_number:['Document number','दस्तावेज़ संख्या'],issue_date:['Issue date','जारी करने की तिथि'],expires_on:['Expiry date','समाप्ति तिथि']};
type ReviewedFields=Record<FieldKey,{value:string;confirmed:boolean}>;
function emptyFields():ReviewedFields{return Object.fromEntries(KEYS.map(key=>[key,{value:'',confirmed:false}])) as ReviewedFields;}

export function DocumentReview({data,identity,repo,run,busy}:{data:Workspace;identity:Identity;repo:Repository;run:Run;busy:boolean}){
 const t=makeT(useUiLang());const reviewable=data.documents.filter(d=>d.scan_status==='clean');
 const [sourceId,setSourceId]=useState(reviewable[0]?.id??'');
 const [result,setResult]=useState<ReadingResult|null>(null),[fields,setFields]=useState<ReviewedFields>(emptyFields);
 const [disposition,setDisposition]=useState<'none'|'confirmed'|'corrected'|'flagged'>('none'),[note,setNote]=useState(''),[recording,setRecording]=useState(false),[error,setError]=useState('');
 const doc=reviewable.find(d=>d.id===sourceId);const app=doc?data.applications.find(a=>a.id===doc.application_id):undefined;
 const jurisdiction=Boolean(app&&identity.roles.some(r=>r.role==='national_admin'||(r.role==='regional_officer'&&r.region===app.region)||(r.role==='institution'&&app.owner_id===identity.id)));
 const canRecord=jurisdiction&&repo.mode==='demo';
 const receive=useCallback((reading:ReadingResult|null)=>{setResult(reading);setError('');setDisposition('none');setNote('');const next=emptyFields();if(reading)for(const key of KEYS){const candidates=reading.fields.filter(f=>f.key===key);if(candidates.length===1)next[key].value=candidates[0].value;}setFields(next);},[]);
 useEffect(()=>{receive(null);},[sourceId,receive]);
 const expected=doc?.sample_sha256??doc?.sha256;
 const sourceMatches=Boolean(result&&expected&&result.sha256===expected);
 const findings=data.integrity_signals.filter(s=>s.signal_type==='document_review'&&s.document_id===sourceId).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 const ready=Boolean(doc&&app&&result&&sourceMatches&&canRecord&&!busy&&!recording&&KEYS.every(k=>fields[k].confirmed)&&disposition!=='none'&&note.trim().length>=10&&note.trim().length<=1000);
 function useSuggestion(field:FieldSuggestion){setFields(value=>({...value,[field.key]:{value:field.value,confirmed:false}}));}
 async function record(){
  if(!ready||!doc||!result)return;
  setRecording(true);setError('');
  const reason=`Document review of ${doc.file_name}: ${disposition}. ${note.trim()}`.slice(0,1000);
  const reviewed=Object.fromEntries(KEYS.map(key=>[key,{extracted:result.fields.filter(f=>f.key===key).map(f=>({value:f.value,page:f.page,excerpt:f.excerpt,method:f.method,confidence:f.confidence})),reviewer:fields[key].value.trim(),confirmed:fields[key].confirmed}]));
  try{const ok=await run(async()=>{await repo.recordIntegritySignal({application_id:doc.application_id,document_id:doc.id,signal_type:'document_review',severity:disposition==='flagged'?'critical':disposition==='corrected'?'warning':'info',fingerprint:`doc-review:${doc.id}:${result.sha256}:${crypto.randomUUID()}`,detail:{source_sha256:result.sha256,source_filename:result.filename,source_pages:result.pages.map(p=>({page:p.page,method:p.method,confidence:p.confidence})),fields:reviewed,disposition,note:note.trim()},reason});},t('Reviewer finding recorded. Claim acceptance and validity remain separate reviews.','समीक्षक का निष्कर्ष दर्ज हुआ। दावे की स्वीकृति और वैधता की समीक्षा अलग हैं।'));if(ok){setDisposition('none');setNote('');}}catch(e){setError(e instanceof Error?e.message:t('The finding could not be recorded. Review the source and try again.','निष्कर्ष दर्ज नहीं हुआ। स्रोत जाँचकर दोबारा प्रयास करें।'));}finally{setRecording(false);}
 }
 return <section className="page-stack document-review">
  <ViewHeader title={t('Document review','दस्तावेज़ समीक्षा')} summary={t('Read the selected bytes, inspect source-backed suggestions and record a human finding for the visible document.','चुनी गई फ़ाइल पढ़ें, स्रोत-आधारित सुझाव जाँचें और दिखाई दे रहे दस्तावेज़ पर मानव निष्कर्ष दर्ज करें।')} count={String(findings.length).padStart(2,'0')} label={t('recorded findings','दर्ज निष्कर्ष')}/>
  {!doc?<Empty title={t('No reviewable document','समीक्षा योग्य दस्तावेज़ नहीं')}>{t('Choose a case with clean evidence to inspect.','जाँच के लिए साफ़ साक्ष्य वाला केस चुनें।')}</Empty>:<>
   <label className="field">{t('Source document','स्रोत दस्तावेज़')}<select aria-label={t('Source document','स्रोत दस्तावेज़')} value={sourceId} disabled={recording} onChange={e=>setSourceId(e.target.value)}>{reviewable.map(d=><option key={d.id} value={d.id}>{neutralCopy(d.file_name)} · {data.applications.find(a=>a.id===d.application_id)?.ref_no??t('Case unavailable','केस उपलब्ध नहीं')}</option>)}</select></label>
   <DocumentReading key={doc.id} doc={doc} canUse={canRecord&&!recording} onUse={useSuggestion} onResult={receive}/>
   {result&&<section className="dossier-paper intelligence-panel document-review-form" aria-label={t('Reviewer finding form','समीक्षक निष्कर्ष फ़ॉर्म')}>
    {!sourceMatches&&<p className="callout warning">{t('The read bytes do not match the selected document’s recorded source hash. Choose the attached sample or a matching local copy before recording a finding.','पढ़ी गई फ़ाइल का हैश चुने गए दस्तावेज़ से मेल नहीं खाता। निष्कर्ष दर्ज करने से पहले संलग्न नमूना या मिलती स्थानीय प्रति चुनें।')}</p>}
    <fieldset disabled={!canRecord||recording}><legend>{t('Confirm or correct each field','प्रत्येक फ़ील्ड की पुष्टि या सुधार करें')}</legend><div className="form-grid">
     {KEYS.map(key=><div key={key}><label className="field">{t(...LABELS[key])}<input type={key==='issue_date'||key==='expires_on'?'date':'text'} value={fields[key].value} maxLength={200} onChange={e=>setFields(value=>({...value,[key]:{value:e.target.value,confirmed:false}}))}/></label><label className="checkbox-field"><input type="checkbox" checked={fields[key].confirmed} onChange={e=>setFields(value=>({...value,[key]:{...value[key],confirmed:e.target.checked}}))}/>{t(`Confirm ${LABELS[key][0].toLowerCase()}`,`${LABELS[key][1]} की पुष्टि करें`)}</label></div>)}
    </div></fieldset>
    <p className="support-footnote">{t('A confirmed blank field means no value was captured from this source. Confirm the selected file and its values; the reader does not authenticate it.','पुष्ट खाली फ़ील्ड का अर्थ है कि स्रोत से मान नहीं मिला। चुनी फ़ाइल और उसके मान जाँचें; रीडर प्रामाणिकता नहीं जाँचता।')}</p>
    <label className="field">{t('Disposition','निष्कर्ष')}<select aria-label={t('Disposition','निष्कर्ष')} value={disposition} disabled={!canRecord||recording} onChange={e=>setDisposition(e.target.value as typeof disposition)}><option value="none">{t('Not yet reviewed','अभी समीक्षा नहीं हुई')}</option><option value="confirmed">{t('Fields confirmed','फ़ील्ड पुष्ट')}</option><option value="corrected">{t('Fields corrected','फ़ील्ड सुधारे')}</option><option value="flagged">{t('Discrepancy flagged','विसंगति चिह्नित')}</option></select></label>
    <label className="field">{t('Reviewer note','समीक्षक टिप्पणी')}<textarea value={note} minLength={10} maxLength={1000} disabled={!canRecord||recording} onChange={e=>setNote(e.target.value)}/></label>
    <button className="button" type="button" disabled={!ready} onClick={()=>void record()}>{t('Record reviewer finding','समीक्षक निष्कर्ष दर्ज करें')}</button>
    {repo.mode!=='demo'&&<p>{t('Finding writes are unavailable in the connected workspace. Use the case’s authorized validity and claim review actions.','जुड़े कार्यक्षेत्र में यह निष्कर्ष दर्ज करना उपलब्ध नहीं है। केस की अनुमत वैधता और दावा समीक्षा क्रियाएँ प्रयोग करें।')}</p>}
    {!jurisdiction&&<p>{t('Your role cannot record this document finding. Choose a case within your permitted scope.','आपकी भूमिका यह निष्कर्ष दर्ज नहीं कर सकती। अपने अनुमत दायरे का केस चुनें।')}</p>}
    {error&&<p role="alert">{error}</p>}
   </section>}
   {findings.length>0&&<section className="dossier-paper intelligence-panel"><h2>{t('Recorded findings','दर्ज निष्कर्ष')}</h2><div className="table-scroll" tabIndex={0}><table><caption>{t('Recorded document findings','दर्ज दस्तावेज़ निष्कर्ष')}</caption><thead><tr><th scope="col">{t('Source','स्रोत')}</th><th scope="col">{t('Disposition','निष्कर्ष')}</th><th scope="col">{t('Recorded','दर्ज समय')}</th></tr></thead><tbody>{findings.map(f=><tr key={f.id}><th scope="row">{neutralCopy(doc.file_name)}<small className="reading-hash">{typeof f.detail.source_sha256==='string'?f.detail.source_sha256:t('Source hash not captured','स्रोत हैश दर्ज नहीं')}</small></th><td>{String(f.detail.disposition??'')}<p>{String(f.detail.note??'')}</p></td><td>{formatDateTime(f.created_at)}</td></tr>)}</tbody></table></div></section>}
  </>}
 </section>;
}
