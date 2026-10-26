import type {AccessAssignment} from './integrity';
import {roleLabels,type Application,type AuditEvent,type Role,type Workspace} from './model';

export type AuthorityContext=Pick<Workspace,'events'|'access_assignments'|'visits'>;
export type CaseHolderKind='institution'|'person'|'role'|'closed';
export type CaseGrantState='active'|'expired'|'revoked'|'inactive'|'missing';

export interface CaseHolder {
  kind:CaseHolderKind;
  user_id:string|null;
  role:Role|null;
  region:string|null;
  institution_id:string|null;
}

export interface CaseGrant {
  state:CaseGrantState;
  role:Role|null;
  region:string|null;
  expires_at:string|null;
  revoked_at:string|null;
  granted_by:string|null;
  grant_reason:string|null;
}

export interface CaseHandoff {
  action:string;
  actor_id:string|null;
  actor_role:string|null;
  created_at:string;
  reason:string|null;
}

export interface CaseAuthority {
  holder:CaseHolder;
  grant:CaseGrant|null;
  handoff:CaseHandoff|null;
  warnings:string[];
}

function latest(events:AuditEvent[],match:(event:AuditEvent)=>boolean){
  return [...events].sort((left,right)=>Date.parse(right.created_at)-Date.parse(left.created_at)||right.id-left.id).find(match)??null;
}

function handoffFrom(event:AuditEvent):CaseHandoff {
  return {action:event.action,actor_id:event.actor_id,actor_role:event.actor_role,created_at:event.created_at,reason:event.reason};
}

function stateOf(grant:AccessAssignment,now:number):CaseGrantState {
  if(grant.revoked_at)return 'revoked';
  if(!grant.active)return 'inactive';
  if(grant.expires_at&&Date.parse(grant.expires_at)<=now)return 'expired';
  return 'active';
}

function rank(state:CaseGrantState){
  return state==='active'?0:state==='revoked'?1:state==='inactive'?2:3;
}

function caseGrant(userId:string,role:Role,region:string|null,grants:AccessAssignment[],now:number):CaseGrant {
  const matches=grants.filter(grant=>grant.user_id===userId&&grant.role===role&&grant.region===region);
  if(!matches.length)return {state:'missing',role,region,expires_at:null,revoked_at:null,granted_by:null,grant_reason:null};
  const ranked=[...matches].sort((left,right)=>{
    const state=rank(stateOf(left,now))-rank(stateOf(right,now));
    if(state)return state;
    return (Date.parse(right.expires_at??'')||0)-(Date.parse(left.expires_at??'')||0);
  });
  const grant=ranked[0];
  return {state:stateOf(grant,now),role,region,expires_at:grant.expires_at,revoked_at:grant.revoked_at,granted_by:grant.granted_by,grant_reason:grant.grant_reason};
}

function grantWarning(grant:CaseGrant){
  if(grant.state==='active')return null;
  const role=(grant.role?roleLabels[grant.role]:'authority').toLowerCase();
  if(grant.state==='expired')return `The recorded ${role} grant has expired.`;
  if(grant.state==='revoked')return `The recorded ${role} grant was revoked.`;
  if(grant.state==='inactive')return `The recorded ${role} grant is inactive.`;
  return `No ${role} grant for ${grant.region??'this region'} is included in this workspace view.`;
}

function holderFor(app:Application,visits:Workspace['visits']):CaseHolder {
  if(app.status==='draft'||app.status==='deficiency_raised')return {kind:'institution',user_id:app.owner_id,role:'institution',region:null,institution_id:app.institution_id};
  if(app.status==='submitted'||app.status==='resubmitted'||app.status==='under_scrutiny')return app.assigned_officer?{kind:'person',user_id:app.assigned_officer,role:'scrutiny_officer',region:app.region,institution_id:null}:{kind:'role',user_id:null,role:'scrutiny_officer',region:app.region,institution_id:null};
  if(app.status==='evc_pending'||app.status==='evc_scheduled'){
    const visit=[...visits].filter(item=>item.application_id===app.id).sort((left,right)=>Date.parse(right.scheduled_for)-Date.parse(left.scheduled_for))[0];
    return visit?.coordinator_id?{kind:'person',user_id:visit.coordinator_id,role:'evc_coordinator',region:app.region,institution_id:null}:{kind:'role',user_id:null,role:'evc_coordinator',region:app.region,institution_id:null};
  }
  if(app.status==='pending_decision')return {kind:'role',user_id:null,role:'regional_officer',region:app.region,institution_id:null};
  return {kind:'closed',user_id:null,role:null,region:null,institution_id:null};
}

function handoffFor(app:Application,holder:CaseHolder,events:AuditEvent[]):CaseHandoff|null {
  if(app.status==='approved'||app.status==='rejected')return null;
  if(holder.kind==='person'&&holder.user_id&&holder.role==='scrutiny_officer'){
    const assigned=latest(events,event=>event.application_id===app.id&&event.action==='operations_assign_case'&&String(event.payload.assigned_to)===holder.user_id);
    if(assigned)return handoffFrom(assigned);
    const started=latest(events,event=>event.application_id===app.id&&event.action==='start_scrutiny'&&event.actor_id===holder.user_id);
    return started?handoffFrom(started):null;
  }
  if(holder.kind==='person'&&holder.user_id&&holder.role==='evc_coordinator'){
    const assigned=latest(events,event=>event.application_id===app.id&&['schedule_evc','inspection_plan','inspection_reassign'].includes(event.action)&&(event.actor_id===holder.user_id||String(event.payload.coordinator_id)===holder.user_id));
    return assigned?handoffFrom(assigned):null;
  }
  if(holder.kind==='institution'&&app.status==='deficiency_raised'){
    const returned=latest(events,event=>event.application_id===app.id&&event.action==='raise_deficiency');
    return returned?handoffFrom(returned):null;
  }
  return null;
}

export function caseAuthority(app:Application,context:AuthorityContext,now=Date.now()):CaseAuthority {
  const holder=holderFor(app,context.visits);
  if(holder.kind==='closed')return {holder,grant:null,handoff:null,warnings:[]};
  const grant=holder.kind==='person'&&holder.user_id&&holder.role?caseGrant(holder.user_id,holder.role,holder.region,context.access_assignments,now):null;
  const warnings:string[]=[];
  if(app.status==='under_scrutiny'&&!app.assigned_officer)warnings.push('The case is under scrutiny but no individual officer is recorded.');
  if(grant){
    const warning=grantWarning(grant);
    if(warning)warnings.push(warning);
    if(grant.state==='active'&&grant.expires_at&&app.sla_due_at&&Date.parse(grant.expires_at)<Date.parse(app.sla_due_at))warnings.push(`The recorded ${grant.role?roleLabels[grant.role].toLowerCase():'authority'} grant expires before the case deadline.`);
  }
  return {holder,grant,handoff:handoffFor(app,holder,context.events),warnings};
}
