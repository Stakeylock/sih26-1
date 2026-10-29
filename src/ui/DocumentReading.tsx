import {useEffect,useRef,useState} from 'react';
import type {DocumentRecord} from '../domain/model';
import {compareSuggestion,type FieldSuggestion,type ReadingResult} from '../domain/documentReading';
import {makeT,useUiLang} from './i18n';

interface Props {doc:DocumentRecord;canUse:boolean;onUse:(field:FieldSuggestion,hash:string)=>void;onResult?:(result:ReadingResult|null)=>void}
export default function DocumentReading({doc,canUse,onUse,onResult}:Props){
 const t=makeT(useUiLang());
 const [result,setResult]=useState<ReadingResult|null>(null),[status,setStatus]=useState(''),[error,setError]=useState('');
 const abort=useRef<AbortController|null>(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 async function read(load:(signal:AbortSignal)=>Promise<{file:Blob;name:string}>){
  abort.current?.abort();const controller=new AbortController();abort.current=controller;
  setResult(null);onResult?.(null);setError('');setStatus(t('Preparing local document reader…','स्थानीय दस्तावेज़ रीडर तैयार हो रहा है…'));
  try{
   const {file,name}=await load(controller.signal);if(controller.signal.aborted)return;
   const {readDocument}=await import('../domain/readDocument');
   const value=await readDocument(file,name,controller.signal,label=>{if(!controller.signal.aborted)setStatus(label);});
   if(!controller.signal.aborted){setResult(value);onResult?.(value);}
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:t('Document reading failed. Choose a supported file and try again.','दस्तावेज़ पढ़ा नहीं गया। समर्थित फ़ाइल चुनकर दोबारा प्रयास करें।'));}
  finally{if(abort.current===controller){abort.current=null;setStatus('');}}
 }
 function cancel(){abort.current?.abort();abort.current=null;setStatus('');setResult(null);onResult?.(null);}
 function sample(){void read(async signal=>{
  if(!/^\/samples\/[a-zA-Z0-9_-]+\.pdf$/.test(doc.file_path))throw new Error('No watermarked sample is available. Choose a local copy to read.');
  const response=await fetch(doc.file_path,{signal});if(!response.ok)throw new Error('Sample file unavailable. Choose a local copy to read.');
  return {file:await response.blob(),name:doc.file_name};
 });}
 function openSource(page:number){const source=document.getElementById(`read-source-${doc.id}-${page}`);if(source instanceof HTMLDetailsElement){source.open=true;source.scrollIntoView({block:'nearest'});source.focus({preventScroll:true});}}
 return <section className="document-reading" aria-label={t('Local document reading','स्थानीय दस्तावेज़ पठन')}>
  <h3>{t('Read document fields','दस्तावेज़ के फ़ील्ड पढ़ें')}</h3>
  <p>{t('PDF text and English OCR run on this device. Suggestions need source review. Reading a file does not verify its authenticity or change a claim.','PDF पाठ और अंग्रेज़ी OCR इसी डिवाइस पर चलते हैं। सुझावों की स्रोत से जाँच करें। फ़ाइल पढ़ना उसकी प्रामाणिकता सत्यापित नहीं करता या किसी दावे को नहीं बदलता।')}</p>
  <div className="inline">
   {doc.scan_status==='clean'&&/^\/samples\//.test(doc.file_path)&&<button type="button" className="button secondary" disabled={Boolean(status)} onClick={sample}>{t('Read watermarked sample','वॉटरमार्क वाला नमूना पढ़ें')}</button>}
   <label className="field">{t('Choose a local document to read','पढ़ने के लिए स्थानीय दस्तावेज़ चुनें')}<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={Boolean(status)} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void read(async()=>({file,name:file.name}));}}/></label>
   {status&&<button type="button" className="button outline" onClick={cancel}>{t('Cancel reading','पठन रद्द करें')}</button>}
  </div>
  <p className="support-footnote">{t('Up to 10 MB and the first 3 pages. A chosen local file is not automatically linked to this case. Provider uploads are not used.','अधिकतम 10 MB और पहले 3 पृष्ठ। चुनी गई स्थानीय फ़ाइल इस केस से स्वतः नहीं जुड़ती। फ़ाइल किसी बाहरी प्रदाता को नहीं भेजी जाती।')}</p>
  {status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}
  {result&&<>
   <p><strong>{t('Source','स्रोत')}: {result.filename}</strong> · {result.pages.length} / {result.totalPages} {t('pages read','पृष्ठ पढ़े गए')}</p>
   <p className="mono reading-hash">SHA-256: {result.sha256}</p>
   {result.warnings.map(warning=><p className="callout warning" key={warning}>{warning}</p>)}
   <div className="table-scroll" tabIndex={0}><table><caption>{t('Suggested document fields for human review','मानव समीक्षा के लिए सुझाए गए दस्तावेज़ फ़ील्ड')}</caption>
    <thead><tr><th scope="col">{t('Field','फ़ील्ड')}</th><th scope="col">{t('Suggested value','सुझाया गया मान')}</th><th scope="col">{t('Source','स्रोत')}</th><th scope="col">{t('Comparison','तुलना')}</th>{canUse&&<th scope="col">{t('Review','समीक्षा')}</th>}</tr></thead>
    <tbody>{result.fields.map((field,i)=><tr key={`${field.key}-${i}`}><th scope="row">{field.label}</th><td>{field.value}</td><td><button type="button" className="text-button" onClick={()=>openSource(field.page)}>{t('Page','पृष्ठ')} {field.page}</button><blockquote>{field.excerpt}</blockquote><small>{field.method==='ocr'?`${t('OCR reading confidence','OCR पठन विश्वास')} ${Math.round(field.confidence??0)}%`:t('Embedded PDF text; no OCR confidence','एम्बेडेड PDF पाठ; OCR विश्वास लागू नहीं')}</small></td><td>{compareSuggestion(field,doc[field.key])}</td>{canUse&&<td><button type="button" className="button small outline" onClick={()=>onUse(field,result.sha256)}>{t(`Use ${field.label.toLowerCase()} in review`,`${field.label} को समीक्षा में लें`)}</button></td>}</tr>)}</tbody>
   </table></div>
   {result.pages.map(page=><details key={page.page} id={`read-source-${doc.id}-${page.page}`} tabIndex={-1}><summary>{t('Page','पृष्ठ')} {page.page} {t('source text','स्रोत पाठ')} ({page.method==='ocr'?'English OCR':'PDF text'})</summary><pre className="reading-source" tabIndex={0}>{page.text||t('No readable text detected.','पढ़ने योग्य पाठ नहीं मिला।')}</pre></details>)}
   <p className="support-footnote">{t('Reading confidence concerns text recognition only. Check the selected file against this case document before recording any review.','पठन विश्वास केवल पाठ पहचान से जुड़ा है। समीक्षा दर्ज करने से पहले चुनी गई फ़ाइल को केस के दस्तावेज़ से मिलाएँ।')}</p>
  </>}
 </section>;
}
