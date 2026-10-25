import type {Application,Workspace} from './model';
export interface RegisterCursor{due_at:string|null;id:string}
export interface RegisterQuery{scope:'active'|'closed'|'all';query:string;region:string|null;status:string|null;cursor:RegisterCursor|null;limit:number}
export interface ApplicationPage{items:(Application&{institution_name:string})[];next_cursor:RegisterCursor|null;total:number;counts:{all:number;active:number;closed:number};as_of:string}
export interface WorkerJobs{scans:{id:string;document_id:string;status:string;attempts:number;last_error:string|null;next_attempt_at:string}[];deadlines:{id:string;status:string;attempts:number;last_error:string|null;next_attempt_at:string}[];checked_at:string}
export function mergeCaseBundle(current:Workspace,patch:Partial<Workspace>):Workspace{
 const result={...current};
 for(const key of Object.keys(patch) as (keyof Workspace)[]){const incoming=patch[key];if(!Array.isArray(incoming))continue;const before=current[key];if(!Array.isArray(before))continue;const ids=new Set(incoming.map(row=>String((row as {id:unknown}).id)));(result as unknown as Record<string,unknown>)[key]=[...before.filter(row=>!ids.has(String((row as {id:unknown}).id))),...incoming];}
 // Case-owned collections must also lose deleted/unlinked records.
 const cases=new Set(patch.applications?.map(app=>app.id));
 for(const key of ['documents','events','checklist','visits','obligations','claims','deficiencies','integrity_signals','scope_requests','deadlines','reminder_intents','expert_reservations','delivery_outbox'] as const){if(!patch[key])continue;const previous=current[key]??[];(result as unknown as Record<string,unknown>)[key]=[...previous.filter(row=>!cases.has(row.application_id)),...patch[key]!];}
 if(patch.claim_evidence){const claims=new Set([...(current.claims.filter(c=>cases.has(c.application_id))),...(patch.claims??[])].map(c=>c.id));result.claim_evidence=[...current.claim_evidence.filter(e=>!claims.has(e.claim_id)),...patch.claim_evidence];}
 if(result.read_window)result.read_window={...result.read_window,loaded_cases:result.applications.length};
 return result;
}
