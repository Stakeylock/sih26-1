import {ChevronDown,ShieldCheck} from 'lucide-react';
import {caseAuthority,type CaseGrant,type CaseHandoff,type CaseHolder} from '../domain/authority';
import {roleLabels,type Application,type Role,type Workspace} from '../domain/model';
import {neutralCopy} from '../domain/presentation';
import './explain.css';

const person=(value:string|null)=>value?value.replace(/^demo-/,'Demo '):'Not recorded';
const day=(value:string|null)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}):'not recorded';
const moment=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}):'an unrecorded time';
const roleText=(role:Role|null)=>role?roleLabels[role]:'Authority';

function holderLabel(holder:CaseHolder,data:Workspace){
  if(holder.kind==='institution')return data.institutions.find(item=>item.id===holder.institution_id)?.name??person(holder.user_id);
  if(holder.kind==='closed')return 'No active holder';
  if(holder.kind==='role')return roleText(holder.role)+' role';
  return person(holder.user_id);
}

function summaryText(holder:CaseHolder,data:Workspace){
  return holder.kind==='closed'?'No active holder':`${holderLabel(holder,data)} holds this case`;
}

function holderMeta(holder:CaseHolder){
  if(holder.kind==='institution')return 'Institution owner';
  if(holder.kind==='closed')return 'Record closed';
  return holder.region?`${roleText(holder.role)} · ${holder.region}`:roleText(holder.role);
}

function why(holder:CaseHolder,status:Application['status']){
  if(holder.kind==='institution')return status==='deficiency_raised'?'A correction has been returned to the institution for response.':'The institution owns the draft before submission.';
  if(holder.kind==='closed')return 'No further action is held by this record.';
  if(holder.kind==='role')return holder.role==='regional_officer'?'Scrutiny is complete; the regional officer role records the final decision.':`No individual ${roleText(holder.role).toLowerCase()} is recorded, so the role holds the next step.`;
  if(holder.role==='evc_coordinator')return 'This coordinator owns the recorded visit for the case.';
  return 'The case is assigned to this officer for scrutiny.';
}

function grantState(grant:CaseGrant){
  const role=roleText(grant.role).toLowerCase();
  if(grant.state==='active')return `Active ${role} grant for ${grant.region??'this workspace'}.`;
  if(grant.state==='expired')return `Expired ${role} grant for ${grant.region??'this workspace'}.`;
  if(grant.state==='revoked')return `Revoked ${role} grant for ${grant.region??'this workspace'}.`;
  if(grant.state==='inactive')return `Inactive ${role} grant for ${grant.region??'this workspace'}.`;
  return `No matching ${role} grant for ${grant.region??'this workspace'} is included in this workspace view.`;
}

function grantNotes(grant:CaseGrant){
  const notes:string[]=[];
  if(grant.grant_reason)notes.push(neutralCopy(grant.grant_reason));
  if(grant.granted_by)notes.push(`Granted by ${person(grant.granted_by)}.`);
  if(grant.expires_at)notes.push(`${grant.state==='expired'?'Expired':'Expires'} ${day(grant.expires_at)}.`);
  else if(grant.state==='active')notes.push('No expiry recorded.');
  if(grant.revoked_at)notes.push(`Revoked ${day(grant.revoked_at)}.`);
  return notes;
}

function handoffLabel(handoff:CaseHandoff){
  const labels:Record<string,string>={
    operations_assign_case:'Allocated to this officer',
    start_scrutiny:'Started by this officer',
    raise_deficiency:'Returned to the institution',
    schedule_evc:'Visit scheduled by this coordinator',
    inspection_plan:'Visit planned by this coordinator',
    inspection_reassign:'Visit reassigned'
  };
  return labels[handoff.action]??handoff.action.replaceAll('_',' ');
}

function handoffFallback(holder:CaseHolder,status:Application['status']){
  if(holder.kind==='institution')return status==='deficiency_raised'?'No return event is included in this history; the institution is recorded as the holder.':'The institution owns the draft; no handoff is recorded.';
  if(holder.kind==='person')return 'No assignment event is included in this history; the holder is recorded on the case.';
  if(holder.kind==='role')return 'No individual assignment is included in this history; the role holds the next step.';
  return 'The record is closed; no active handoff is recorded.';
}

export function CaseCustody({app,data}:{app:Application;data:Workspace}){
  const authority=caseAuthority(app,data);
  return <details className="due-explain custody-explain">
    <summary><ShieldCheck size={13}/><span>{summaryText(authority.holder,data)}</span><ChevronDown className="due-explain-caret" size={12}/></summary>
    <div className="due-explain-panel custody-panel">
      <strong>Custody derivation</strong>
      <dl>
        <div><dt>Current holder</dt><dd>{holderLabel(authority.holder,data)}<small>{holderMeta(authority.holder)}</small></dd></div>
        <div><dt>Why</dt><dd>{why(authority.holder,app.status)}</dd></div>
        {authority.grant&&<div><dt>Grant</dt><dd>{grantState(authority.grant)}{grantNotes(authority.grant).map(note=><small key={note}>{note}</small>)}</dd></div>}
        <div><dt>Recorded handoff</dt><dd>{authority.handoff?<><strong>{handoffLabel(authority.handoff)}</strong> by {person(authority.handoff.actor_id)} on {moment(authority.handoff.created_at)}{authority.handoff.reason&&<small>{neutralCopy(authority.handoff.reason)}</small>}</>:handoffFallback(authority.holder,app.status)}</dd></div>
      </dl>
      {authority.warnings.length>0&&<div className="custody-warnings" aria-label="Custody checks"><strong>Checks</strong><ul>{authority.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></div>}
      <p>Derived only from the loaded case, grants, visits and events. Opening this explanation changes nothing.</p>
    </div>
  </details>;
}
