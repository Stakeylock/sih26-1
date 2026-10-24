import {stableJson} from './integrity';
import {z} from 'zod';
import type {AppType,Role,TemplateDefinition} from './model';
import {calendarSchema} from './intelligence';
const short=z.string().trim().min(1).max(200);
const expectedRoles:Record<string,Role>={submission:'institution',scrutiny:'scrutiny_officer',evc:'evc_coordinator',decision:'regional_officer'};
export const workflowSchema=z.strictObject({evc_mode:z.enum(['none','conditional','required']),disclaimer:z.string().trim().min(10).max(2000),stages:z.array(z.strictObject({key:z.enum(['submission','scrutiny','evc','decision']),label:short,role:z.enum(['institution','scrutiny_officer','evc_coordinator','regional_officer','national_admin']),sla_days:z.number().int().min(0).max(120)})).min(3).max(4),required_fields:z.array(z.strictObject({key:z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),label:short})).min(1).max(40),required_documents:z.array(short).min(1).max(30),checklist:z.array(short).min(1).max(40),undertakings:z.array(z.string().min(1).max(1000)).max(30),inspection_planning_required:z.boolean().optional(),calendar:calendarSchema.optional()}).superRefine((item,ctx)=>{
 const expected=item.evc_mode==='none'?['submission','scrutiny','decision']:['submission','scrutiny','evc','decision'];
 if(item.stages.map(stage=>stage.key).join(',')!==expected.join(','))ctx.addIssue({code:'custom',message:'Use submission, scrutiny, optional inspection, then decision; loops and skipped authorities are unsupported.'});
 for(const stage of item.stages)if(stage.role!==expectedRoles[stage.key]||stage.key!=='submission'&&stage.sla_days<1)ctx.addIssue({code:'custom',message:'Stage authorities are fixed and active stage targets must be positive.'});
 for(const values of [item.required_fields.map(field=>field.key),item.required_documents,item.checklist])if(new Set(values).size!==values.length)ctx.addIssue({code:'custom',message:'Fields, evidence categories and checks must be unique.'});
});
export interface PolicyRevision{id:string;app_type:AppType;version:number;status:string;name:string;definition:TemplateDefinition;revision?:number;definition_hash?:string|null;source_url?:string|null;source_hash?:string|null;review_note?:string|null;reviewed_by?:string|null;reviewed_at?:string|null}
export interface CaseReview{basis_current?:boolean;id:string;application_id:string;kind:'second_opinion'|'appeal_review';reviewer_id:string;assigned_by:string;mandatory:boolean;status:'pending'|'completed'|'cancelled';basis_hash:string;recommendation:string|null;note:string;assignment_reason:string;recorded_at:string|null;evidence_ids:string[];created_at:string}
export interface Delivery{id:string;application_id:string;recipient_id:string;channel:'in_app'|'smtp_local';generation:number;source_hash:string;status:string;attempts:number;title:string;body:string;created_at:string;scheduled_for:string;lease_until:string|null;last_error:string|null;accepted_at:string|null}
export interface WorkerHealth{id:string;last_seen_at:string;detail:Record<string,unknown>}
export interface Candidate{id:string;name:string;role:Role;region:string|null;expires_at:string|null}
export interface Readiness{checks:{name:string;state:'pass'|'attention';detail:string}[];checked_at:string}
export function workflowShape(value:TemplateDefinition){return stableJson({...value,calendar:undefined,stages:value.stages.map(({sla_days,...stage})=>{void sla_days;return stage;})});}

export interface DeliveryAttempt{id:string;outbox_id:string;attempt:number;state:string;detail:string;happened_at:string}
