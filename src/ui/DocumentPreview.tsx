import {Stamp} from 'lucide-react';
import type {DocumentRecord} from '../domain/model';

/**
 * Renders a clearly synthetic specimen of a document from its record metadata.
 * No file bytes are stored or displayed; the banner and watermark state that plainly,
 * and the validity line is highlighted so expiry is the first thing a reviewer sees.
 */
export function DocumentPreview({document,claim}:{document:DocumentRecord;claim?:string}){
  const expired=Boolean(document.expires_on&&document.expires_on<new Date().toISOString().slice(0,10));
  const recorded=new Date(document.uploaded_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  return <figure className="doc-preview" aria-label={`Synthetic specimen preview of ${document.file_name}`}>
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
      <span className="doc-preview-file mono">{document.file_name}</span>
    </div>
  </figure>;
}
