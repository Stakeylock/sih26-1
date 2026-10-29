export interface ReadPage {page:number;text:string;method:'pdf_text'|'ocr';confidence:number|null}
export type FieldKey='issuer'|'document_number'|'issue_date'|'expires_on';
export interface FieldSuggestion {key:FieldKey;label:string;value:string;page:number;excerpt:string;method:ReadPage['method'];confidence:number|null}
export interface ReadingResult {pages:ReadPage[];fields:FieldSuggestion[];warnings:string[];sha256:string;filename:string;totalPages:number}
const labels:Record<FieldKey,string>={issuer:'Issuer',document_number:'Document reference',issue_date:'Issue date',expires_on:'Expiry date'};
export function strictDate(raw:string):string|null{
 const value=raw.trim();let iso=value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const match=value.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})[ ,.-]+(\d{4})$/);if(!match)return null;
  const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].slice(0,3).toLowerCase())+1;if(!month)return null;
  iso=`${match[3]}-${String(month).padStart(2,'0')}-${match[1].padStart(2,'0')}`;
 }
 const stamp=Date.parse(iso+'T00:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===iso?iso:null;
}
export function suggestFields(pages:ReadPage[]):{fields:FieldSuggestion[];warnings:string[]}{
 const fields:FieldSuggestion[]=[];const warnings:string[]=[];
 const patterns:[FieldKey,RegExp][]=[['issuer',/^(?:issuer|issued by|issuing authority)\s*[:=-]\s*(.+)$/i],['document_number',/^(?:reference|document (?:number|reference)|certificate (?:number|no\.?))\s*[:=-]\s*(.+)$/i],['issue_date',/^(?:issue date|issued on|date of issue)\s*[:=-]\s*(.+)$/i],['expires_on',/^(?:expiry(?: date)?|expires(?: on)?|valid (?:to|until))\s*[:=-]\s*(.+)$/i]];
 for(const page of pages)for(const line of page.text.split(/\r?\n/))for(const [key,pattern] of patterns){const match=line.trim().match(pattern);if(!match)continue;const raw=match[1].trim().slice(0,200);let value=raw;if(key==='issue_date'||key==='expires_on'){const parsed=strictDate(raw);if(!parsed){warnings.push(`Page ${page.page}: ${labels[key]} needs manual interpretation: ${raw}`);continue;}value=parsed;}if(!fields.some(f=>f.key===key&&f.value===value))fields.push({key,label:labels[key],value,page:page.page,excerpt:line.trim().slice(0,350),method:page.method,confidence:page.confidence});}
 for(const key of Object.keys(labels) as FieldKey[])if(fields.filter(f=>f.key===key).length>1)warnings.push(`Multiple ${labels[key].toLowerCase()} values found. Select a value only after checking the source.`);
 return {fields,warnings:[...new Set(warnings)]};
}
export function compareSuggestion(field:FieldSuggestion,current:string|null|undefined){return !current?'Not recorded':current.trim().toLowerCase()===field.value.trim().toLowerCase()?'Matches record':'Differs from record';}
