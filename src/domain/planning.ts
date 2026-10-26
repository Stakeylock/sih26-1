import {z} from 'zod';
import type {Application,Identity} from '../domain/model';
export interface InspectionExpert{id:string;name:string;organisation:string;discipline:string;region:string;affiliated_institution_id:string|null;active:boolean;version:number;created_by:string;created_at:string}
export interface ExpertAvailability{id:string;expert_id:string;starts_at:string;ends_at:string;note:string;recorded_by:string;created_at:string}
export interface ExpertConflict{id:string;expert_id:string;institution_id:string;reason:string;active:boolean;recorded_by:string;created_at:string}
export interface ExpertReservation{id:string;expert_id:string;visit_id:string;application_id:string;starts_at:string;ends_at:string;active:boolean}
export interface PanelSnapshot{expert_id:string;name:string;organisation:string;discipline:string;declaration:string}
export interface InspectionPlan{starts_at:string;ends_at:string;mode:'physical'|'online'|'hybrid';expert_ids:string[];note:string;visit_id?:string|null}
export const expertSchema=z.strictObject({name:z.string().trim().min(3).max(160),organisation:z.string().trim().min(3).max(200),discipline:z.string().trim().min(3).max(120),region:z.enum(['North','South','East','West','Central','North-East']),affiliated_institution_id:z.string().nullable(),active:z.boolean()});
export const planSchema=z.strictObject({starts_at:z.string().datetime({offset:true}),ends_at:z.string().datetime({offset:true}),mode:z.enum(['physical','online','hybrid']),expert_ids:z.array(z.string()).min(1).max(10),note:z.string().trim().min(10).max(2000),visit_id:z.string().nullable().optional()}).refine(item=>new Set(item.expert_ids).size===item.expert_ids.length,'Panel members must be unique.').refine(item=>Date.parse(item.ends_at)>Date.parse(item.starts_at)&&Date.parse(item.ends_at)-Date.parse(item.starts_at)<=7*86400000,'Choose a positive window of up to seven days.');
export function overlaps(aStart:string,aEnd:string,bStart:string,bEnd:string){return Date.parse(aStart)<Date.parse(bEnd)&&Date.parse(aEnd)>Date.parse(bStart);}
export function activeConflictsFor(conflicts:ExpertConflict[]|undefined,institutionId:string|null):ExpertConflict[]{
 if(!institutionId||!conflicts)return [];
 return conflicts.filter(item=>item.institution_id===institutionId&&item.active);
}
export function expertReadiness(expert:InspectionExpert,institutionId:string,starts:string,ends:string,availability:ExpertAvailability[],conflicts:ExpertConflict[],reservations:ExpertReservation[],visitId?:string|null){
 const reasons:string[]=[];if(!expert.active)reasons.push('Expert is inactive.');
 if(expert.affiliated_institution_id===institutionId)reasons.push('Affiliation with this institution requires a different panel member.');
 if(conflicts.some(item=>item.expert_id===expert.id&&item.institution_id===institutionId&&item.active))reasons.push('An active declared conflict exists.');
 if(!availability.some(item=>item.expert_id===expert.id&&Date.parse(item.starts_at)<=Date.parse(starts)&&Date.parse(item.ends_at)>=Date.parse(ends)))reasons.push('No recorded availability covers the full window.');
  if(reservations.some(item=>item.expert_id===expert.id&&item.active&&item.visit_id!==visitId&&overlaps(starts,ends,item.starts_at,item.ends_at)))reasons.push('Another visit reserves an overlapping window.');
   return {eligible:reasons.length===0,reasons};
}
export interface PanelSuggestion{expert:InspectionExpert;reasons:string[]}
export interface PanelRecommendation{recommended:PanelSuggestion[];excluded:{expert:InspectionExpert;reasons:string[]}[]}
export function recommendPanel(experts:InspectionExpert[],institutionId:string,starts:string,ends:string,availability:ExpertAvailability[],conflicts:ExpertConflict[],reservations:ExpertReservation[],visitId?:string|null,limit=3):PanelRecommendation{
  const limitSafe=Math.max(1,Math.min(10,limit));
  const evaluated=experts.map(expert=>({expert,readiness:expertReadiness(expert,institutionId,starts,ends,availability,conflicts,reservations,visitId)}));
  const excluded=evaluated.filter(item=>!item.readiness.eligible).map(item=>({expert:item.expert,reasons:item.readiness.reasons}));
  const eligible=evaluated.filter(item=>item.readiness.eligible).map(item=>item.expert).sort((left,right)=>left.discipline.localeCompare(right.discipline)||left.name.localeCompare(right.name)||left.id.localeCompare(right.id));
  const reasons=['Recorded availability covers the full requested window.','No active conflict, institutional affiliation or overlapping reservation is recorded.'];
  const recommended:PanelSuggestion[]=[];
  const seen=new Set<string>();
  const add=(expert:InspectionExpert)=>{if(recommended.length>=limitSafe||seen.has(expert.id)||seen.has('discipline:'+expert.discipline))return;seen.add(expert.id);seen.add('discipline:'+expert.discipline);recommended.push({expert,reasons});};
  for(const expert of eligible)add(expert);
  for(const expert of eligible){if(recommended.length>=limitSafe)break;if(seen.has(expert.id))continue;seen.add(expert.id);recommended.push({expert,reasons});}
  return {recommended,excluded};
}
export function regionBlocker(identity:Identity,app:Application):string|null{
  if(identity.roles.some(role=>role.role==='national_admin'))return null;
  const scoped=identity.roles.filter(role=>['regional_officer','evc_coordinator','scrutiny_officer'].includes(role.role));
  if(scoped.some(role=>role.region===app.region))return null;
  const actorRegions=[...new Set(scoped.map(role=>role.region).filter((region):region is string=>region!==null))];
  return `You cannot act on this case — it belongs to the ${app.region} region, but your grant covers ${actorRegions.length?actorRegions.join(' · '):'no region'}.`;
}
