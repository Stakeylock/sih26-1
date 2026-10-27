import {neutralCopy} from '../domain/presentation';
import {Stamp} from 'lucide-react';
import {useEffect,useState} from 'react';
import type {DocumentRecord} from '../domain/model';

const isSampleAsset=(path:string)=>path.startsWith('/samples/');

/**
 * Renders the document preview for a seeded record. When the record points at a
 * generated watermarked sample, its real bytes are fetched once, shown through an
 * <object> element and offered as a download (unless the document is expired, which
 * stays undownloadable); the object URL is revoked on unmount. Documents without
 * sample bytes keep the metadata specimen below - no bytes are ever invented.
 */
export function DocumentPreview({document,claim}:{document:DocumentRecord;claim?:string}){
  const expired=Boolean(document.expires_on&&document.expires_on<new Date().toISOString().slice(0,10));
  const [sample,setSample]=useState<{path:string;url:string}|null>(null);
  useEffect(()=>{
    if(!isSampleAsset(document.file_path))return;
    let cancelled=false,url:string|null=null;
    fetch(document.file_path)
      .then(response=>{if(!response.ok)throw new Error('Sample asset unavailable.');return response.blob();})
      .then(blob=>{if(cancelled)return;url=URL.createObjectURL(blob);setSample({path:document.file_path,url});})
      .catch(()=>{/* Keep the metadata specimen when sample bytes cannot be read. */});
    return ()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[document.file_path]);
  const objectUrl=sample&&sample.path===document.file_path?sample.url:null;
  const recorded=new Date(document.uploaded_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  if(objectUrl){
    return <figure className="doc-preview" aria-label={`Watermarked synthetic sample preview of ${neutralCopy(document.file_name)}`}>
      <div className="doc-preview-banner"><strong>SYNTHETIC SAMPLE</strong><span>{document.origin_label??'Watermarked synthetic sample (generated locally)'}</span></div>
      <object className="doc-preview-object" data={objectUrl} type="application/pdf" tabIndex={0} aria-label={`Watermarked sample PDF of ${neutralCopy(document.file_name)}`}>
        <p>This browser cannot display the sample PDF. {expired?'Download is withheld for expired documents.':<><a href={objectUrl} download={document.file_name}>Download the sample PDF</a> instead.</>}</p>
      </object>
      {expired?<p className="doc-preview-expired-note">Expired documents stay on file for review history; download is withheld.</p>:<a className="button small doc-preview-download" href={objectUrl} download={document.file_name}>Download sample PDF</a>}
      <span className="doc-preview-file mono">{neutralCopy(document.file_name)}</span>
    </figure>;
  }
  return <figure className="doc-preview" aria-label={`Synthetic specimen preview of ${neutralCopy(document.file_name)}`}>
    <div className="doc-preview-banner"><strong>SYNTHETIC SPECIMEN</strong><span>Rendered from record metadata · no file bytes are stored or displayed</span></div>
    <div className="doc-preview-paper">
      <div className="doc-preview-watermark" aria-hidden="true">SPECIMEN</div>
      <div className="doc-preview-top">
        <span className="doc-preview-seal"><Stamp size={18}/></span>
        <div><small>{document.issuer??'Synthetic issuing authority'}</small><h4>{document.doc_type}</h4></div>
      </div>
      <dl className="doc-preview-fields">
        <div><dt>Document no.</dt><dd className="mono">{document.document_number??'—'}</dd></div>
        <div><dt>In record since</dt><dd>{recorded}</dd></div>
        {document.expires_on&&<div><dt>Validity</dt><dd className={expired?'expired':''}>{expired?`Expired ${document.expires_on}`:`Valid to ${document.expires_on}`}</dd></div>}
      </dl>
      {claim&&<p className="doc-preview-claim"><b>Supports claim:</b> {claim}</p>}
      <span className="doc-preview-file mono">{neutralCopy(document.file_name)}</span>
    </div>
  </figure>;
}
