import type {Application,Identity,Repository,Workspace} from '../domain/model';
import {expertReadiness,expertSchema,planSchema,type ExpertAvailability,type ExpertConflict,type ExpertReservation,type InspectionExpert} from '../domain/planning';
import {sha256Hex,stableJson} from '../domain/integrity';
export function seedPlanning(state:Workspace){
 const at=new Date().toISOString(),starts=new Date(Date.now()+86400000).toISOString(),ends=new Date(Date.now()+31*86400000).toISOString();
 state.inspection_experts=['Academic review','Facilities review','Operational coordination'].map((discipline,index)=>({id:'demo-expert-'+index,name:`Demo expert ${String.fromCharCode(65+index)}`,organisation:'Example review institute '+(index+1),discipline,region:'South',affiliated_institution_id:null,active:true,version:1,created_by:'demo-national',created_at:at}));
 state.expert_availability=state.inspection_experts.map(expert=>({id:'demo-availability-'+expert.id,expert_id:expert.id,starts_at:starts,ends_at:ends,note:'Synthetic coordinator-recorded availability for the example planner.',recorded_by:'demo-national',created_at:at}));state.expert_conflicts=[];state.expert_reservations=[];
}
export function demoPlanning(o:{state:()=>Workspace;actor:Identity;find:(id:string)=>Application;persist:()=>void;log:(app:Application,action:string,old:Application['status']|null,note?:string|null,detail?:Record<string,unknown>)=>Promise<void>;mutate:(app:Application,id:string,action:string,input:unknown,operation:()=>void|Promise<void>)=>Promise<void>}):Pick<Repository,'inspectionCommand'> {
 const receipts=new Map<string,{input:string;result:Record<string,unknown>}>();
 const has=(name:string,region?:string)=>o.actor.roles.some(role=>role.role===name&&(name==='national_admin'||!region||role.region===region));
 const manages=(region:string)=>has('national_admin')||has('regional_officer',region)||has('evc_coordinator',region);
 const note=(payload:Record<string,unknown>)=>{const text=String(payload.note??'').trim();if(text.length<10||text.length>2000)throw new Error('Record a planning reason of 10–2000 characters.');return text;};
 return {async inspectionCommand(kind,id,payload,expected,request=crypto.randomUUID()){
  const state=o.state(),input=stableJson({actor:o.actor.id,kind,id,payload,version:expected}),before=receipts.get(request);let result:Record<string,unknown>={};
  const roster=['expert_create','availability','conflict','conflict_resolve','expert_status'].includes(kind),expert=state.inspection_experts?.find(item=>item.id===id);
  const visit=state.visits.find(item=>item.id===id),app=roster?null:o.find(kind==='plan'?id!:visit?.application_id??'');
  if(roster){const region=kind==='expert_create'?String(payload.region):expert?.region;if(!region||!manages(region))throw new Error('Directory jurisdiction required.');}
  else if(app){if(app.owner_id===o.actor.id)throw new Error('Cannot coordinate your own case.');const manager=['cancel','reassign'].includes(kind)&&(has('national_admin')||has('regional_officer',app.region));if(!manager&&(!has('evc_coordinator',app.region)||(kind!=='plan'&&visit?.coordinator_id!==o.actor.id)))throw new Error('Assigned EVC coordinator required.');}
  if(before){if(before.input!==input)throw new Error('Request ID already used.');return structuredClone(before.result);}
  const reason=note(payload);
  if(roster){
   if(kind!=='expert_create'&&(!expert||expert.version!==expected))throw new Error('Expert changed; reload before editing.');
   if(kind==='expert_create'){const {note:ignored,...fields}=payload;void ignored;const value=expertSchema.parse(fields);const created:InspectionExpert={...value,id:'demo-expert-'+crypto.randomUUID(),version:1,created_by:o.actor.id,created_at:new Date().toISOString()};state.inspection_experts??=[];state.inspection_experts.push(created);result={id:created.id};}
   else if(kind==='availability'){
    const starts=String(payload.starts_at??''),ends=String(payload.ends_at??'');if(!Number.isFinite(Date.parse(starts))||!Number.isFinite(Date.parse(ends))||Date.parse(ends)<=Date.parse(starts))throw new Error('Choose a positive availability window.');
    const row:ExpertAvailability={id:'demo-window-'+crypto.randomUUID(),expert_id:expert!.id,starts_at:starts,ends_at:ends,note:reason,recorded_by:o.actor.id,created_at:new Date().toISOString()};state.expert_availability??=[];state.expert_availability.push(row);expert!.version++;
   }else if(kind==='conflict'){
    const institution=state.institutions.find(item=>item.id===payload.institution_id);if(!institution||(!has('national_admin')&&!manages(institution.region)))throw new Error('Conflict institution outside scope.');
    const row:ExpertConflict={id:'demo-conflict-'+crypto.randomUUID(),expert_id:expert!.id,institution_id:institution.id,reason,active:true,recorded_by:o.actor.id,created_at:new Date().toISOString()};state.expert_conflicts??=[];state.expert_conflicts.push(row);expert!.version++;
   }else if(kind==='conflict_resolve'){const conflict=state.expert_conflicts?.find(item=>item.id===payload.conflict_id&&item.expert_id===expert!.id&&item.active);if(!conflict)throw new Error('Active conflict for this expert required.');conflict.active=false;expert!.version++;
   }else{if(typeof payload.active!=='boolean')throw new Error('Explicit status required.');expert!.active=payload.active;expert!.version++;}
   o.persist();
  }else if(app){
   if(app.version!==expected)throw new Error('Case changed; reload before planning.');
   await o.mutate(app,request,'inspection_'+kind,payload,async()=>{
    if(kind==='plan'){
     const plan=planSchema.parse({...payload,note:reason});if(!['evc_pending','evc_scheduled'].includes(app.status)||Date.parse(plan.starts_at)<=Date.now())throw new Error('Choose an inspection-ready case and a future window.');
     const previous=plan.visit_id?state.visits.find(item=>item.id===plan.visit_id&&item.application_id===app.id):null;
     if(plan.visit_id&&(!previous||previous.coordinator_id!==o.actor.id||previous.completed_at||previous.planning_state==='cancelled'))throw new Error('Existing visit cannot be rescheduled.');
     if(!previous&&state.visits.some(item=>item.application_id===app.id&&!item.completed_at&&item.planning_state!=='cancelled'))throw new Error('Manage the existing visit instead of creating a duplicate.');
     const experts=plan.expert_ids.map(expertId=>{const member=state.inspection_experts?.find(item=>item.id===expertId);if(!member||!manages(member.region))throw new Error('Expert outside directory scope.');const readiness=expertReadiness(member,app.institution_id,plan.starts_at,plan.ends_at,state.expert_availability??[],state.expert_conflicts??[],state.expert_reservations??[],previous?.id);if(!readiness.eligible)throw new Error(member.name+': '+readiness.reasons.join(' '));return member;});
     const panel=experts.map(member=>({expert_id:member.id,name:member.name,organisation:member.organisation,discipline:member.discipline,declaration:'Synthetic coordinator-recorded availability and conflict screening.'}));
     const row=previous??{id:'demo-visit-'+crypto.randomUUID(),application_id:app.id,coordinator_id:o.actor.id,scheduled_for:plan.starts_at,report:null,recommendation:null,completed_at:null};
     Object.assign(row,{scheduled_for:plan.starts_at,ends_at:plan.ends_at,visit_mode:plan.mode,planning_state:'tentative',resource_planned:true,panel_snapshot:panel,planning_note:reason,version:(previous?.version??0)+1,report_due_at:new Date(Date.parse(plan.ends_at)+21*86400000).toISOString()});
     if(!previous)state.visits.push(row);state.expert_reservations??=[];for(const reservation of state.expert_reservations)if(reservation.visit_id===row.id)reservation.active=false;
     for(const member of experts){const reservation:ExpertReservation={id:'demo-reservation-'+crypto.randomUUID(),expert_id:member.id,visit_id:row.id,application_id:app.id,starts_at:plan.starts_at,ends_at:plan.ends_at,active:true};state.expert_reservations.push(reservation);}
      const old=app.status;app.status='evc_scheduled';await o.log(app,'inspection_planned',old,reason,{visit_id:row.id,mode:plan.mode,panel});result={visit_id:row.id};
    }else{
     if(!visit||visit.completed_at||visit.planning_state==='cancelled'||app.status!=='evc_scheduled')throw new Error('An active scheduled visit is required.');
     if(kind==='confirm'){if(!visit.resource_planned||visit.planning_state!=='tentative')throw new Error('Resource-planned tentative visit required.');for(const reservation of state.expert_reservations?.filter(item=>item.visit_id===visit.id&&item.active)??[]){const member=state.inspection_experts!.find(item=>item.id===reservation.expert_id)!;const check=expertReadiness(member,app.institution_id,reservation.starts_at,reservation.ends_at,state.expert_availability??[],state.expert_conflicts??[],state.expert_reservations??[],visit.id);if(!check.eligible)throw new Error('Panel eligibility changed.');}visit.planning_state='confirmed';}
     else if(kind==='report'){
      const report=String(payload.report??'').trim();if(visit.planning_state!=='confirmed'||!visit.ends_at||Date.parse(visit.ends_at)>Date.now()||report.length<20||report.length>10000||!['recommend','conditional','not_recommend'].includes(String(payload.recommendation)))throw new Error('Completed confirmed visit window, full findings and recommendation required.');
      if(!visit.panel_snapshot?.length||state.expert_reservations?.filter(item=>item.visit_id===visit.id&&item.active).some(item=>{const member=state.inspection_experts?.find(expert=>expert.id===item.expert_id);return !member?.active||member.affiliated_institution_id===app.institution_id||state.expert_conflicts?.some(conflict=>conflict.expert_id===item.expert_id&&conflict.institution_id===app.institution_id&&conflict.active);}))throw new Error('Panel eligibility changed; resolve the declaration before reporting.');
      visit.completed_at=new Date().toISOString();visit.report=report;visit.recommendation=String(payload.recommendation);visit.planning_state='completed';visit.report_basis={text_sha256:await sha256Hex(report),actor_id:o.actor.id,panel:visit.panel_snapshot??[]};app.status='pending_decision';
     }else if(kind==='cancel'){visit.planning_state='cancelled';app.status='evc_pending';}
     else if(kind==='reassign'){const target=String(payload.coordinator_id??''),grant=state.access_assignments.find(item=>item.user_id===target&&item.role==='evc_coordinator'&&item.region===app.region&&item.active&&!item.revoked_at&&(!item.expires_at||Date.parse(item.expires_at)>Date.now()));if(!grant)throw new Error('Active coordinator in the case region required.');visit.coordinator_id=target;}
     else throw new Error('Unsupported inspection command.');
    visit.version=(visit.version??0)+1;if(['report','cancel'].includes(kind))for(const reservation of state.expert_reservations??[])if(reservation.visit_id===visit.id)reservation.active=false;
    await o.log(app,'inspection_'+kind,null,reason,{visit_id:visit.id,recommendation:visit.recommendation});
    }
   });
  }else throw new Error('Inspection resource unavailable.');
  receipts.set(request,{input,result});return structuredClone(result);
 }};
}
