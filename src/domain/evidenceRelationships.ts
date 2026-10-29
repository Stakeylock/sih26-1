import type {Workspace} from './model';
export function visibleEvidenceMatches(data:Pick<Workspace,'applications'|'documents'>){
 const apps=new Map(data.applications.map(a=>[a.id,a]));const groups=new Map<string,typeof data.documents>();
 for(const doc of data.documents){if(!apps.has(doc.application_id)||!doc.sha256)continue;groups.set(doc.sha256,[...(groups.get(doc.sha256)??[]),doc]);}
 return [...groups].filter(([,docs])=>new Set(docs.map(d=>d.application_id)).size>1).map(([hash,docs])=>({hash,documents:docs.map(d=>({id:d.id,name:d.file_name,applicationId:d.application_id,ref:apps.get(d.application_id)!.ref_no,type:d.doc_type}))}));
}
