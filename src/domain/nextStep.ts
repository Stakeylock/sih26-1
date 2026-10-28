import {expiryState} from './expiry';
import {missingInputs,roleLabels,type Application,type Deficiency,type DocumentRecord,type Obligation,type Visit} from './model';

export type NextStepKind='submission'|'correction'|'scrutiny'|'visit'|'decision'|'obligation'|'renewal'|'closed';

export interface NextStepContext {
  documents:DocumentRecord[];
  deficiencies:Deficiency[];
  obligations:Obligation[];
  visits:Visit[];
}

export interface CaseNextStep {
  kind:NextStepKind;
  owner:string;
  action:string;
  due:string|null;
  source:string;
  detail:string|null;
  obligationId?:string;
  documentId?:string;
}

const inactiveObligationStatuses=new Set(['fulfilled','accepted','waived','closed','cancelled']);

function dateValue(value:string|null|undefined){
  if(!value)return Number.POSITIVE_INFINITY;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?parsed:Number.POSITIVE_INFINITY;
}

function openDeficiency(app:Application,context:NextStepContext){
  return context.deficiencies
    .filter(item=>item.application_id===app.id&&['open','escalated'].includes(item.status))
    .sort((left,right)=>dateValue(left.due_at)-dateValue(right.due_at))[0]??null;
}

function openObligation(app:Application,context:NextStepContext){
  return context.obligations
    .filter(item=>item.application_id===app.id&&item.kind!=='renewal'&&!inactiveObligationStatuses.has(item.status.toLowerCase()))
    .sort((left,right)=>dateValue(left.due_date)-dateValue(right.due_date))[0]??null;
}

function currentVisit(app:Application,context:NextStepContext){
  return context.visits
    .filter(item=>item.application_id===app.id&&item.planning_state!=='cancelled')
    .sort((left,right)=>dateValue(right.scheduled_for)-dateValue(left.scheduled_for))[0]??null;
}

function renewalDocument(app:Application,context:NextStepContext){
  const documents=context.documents.filter(item=>item.application_id===app.id);
  const currentTypes=new Set(documents.filter(item=>expiryState(item.expires_on)!=='expired').map(item=>item.doc_type));
  return documents
    .filter(item=>expiryState(item.expires_on)==='expired'&&!currentTypes.has(item.doc_type))
    .sort((left,right)=>dateValue(left.expires_on)-dateValue(right.expires_on))[0]??null;
}

export function nextStep(app:Application,context:NextStepContext):CaseNextStep {
  if(app.status==='draft'){
    const missing=missingInputs(app,context.documents);
    return {
      kind:'submission',
      owner:roleLabels.institution,
      action:missing.length?`Complete ${missing.length} required submission item${missing.length===1?'':'s'} before submitting.`:'Submit the draft for scrutiny.',
      due:null,
      source:'Captured submission requirements',
      detail:missing.length?missing.slice(0,3).join(', '):null,
    };
  }

  const deficiency=openDeficiency(app,context);
  if(app.status==='deficiency_raised'||deficiency){
    return {
      kind:'correction',
      owner:roleLabels.institution,
      action:deficiency?'Respond to the recorded correction with evidence for official re-scrutiny.':'Respond to the scrutiny correction and resubmit the case.',
      due:deficiency?.due_at??app.sla_due_at,
      source:deficiency?'Recorded correction request':'Recorded case deadline',
      detail:deficiency?.remedy??null,
    };
  }

  if(app.status==='submitted'||app.status==='resubmitted'){
    return {
      kind:'scrutiny',
      owner:roleLabels.scrutiny_officer,
      action:app.assigned_officer?'Start scrutiny under the recorded officer assignment.':'Assign a scrutiny officer and start review.',
      due:app.sla_due_at,
      source:'Recorded case deadline',
      detail:app.assigned_officer?'An individual officer is recorded.':null,
    };
  }

  if(app.status==='under_scrutiny'){
    return {
      kind:'scrutiny',
      owner:roleLabels.scrutiny_officer,
      action:'Resolve open claims and record review checks before accepting scrutiny.',
      due:app.sla_due_at,
      source:'Recorded case deadline',
      detail:app.assigned_officer?'An individual officer is recorded.':null,
    };
  }

  if(app.status==='evc_pending'||app.status==='evc_scheduled'){
    const visit=currentVisit(app,context);
    if(app.status==='evc_pending'){
      return {
        kind:'visit',
        owner:roleLabels.evc_coordinator,
        action:visit?'Confirm or reschedule the proposed expert visit.':'Schedule and confirm an expert visit.',
        due:visit?.scheduled_for??app.sla_due_at,
        source:visit?'Recorded visit plan':'Recorded case deadline',
        detail:visit?'A visit record exists; confirmation is not completion.':null,
      };
    }
    return {
      kind:'visit',
      owner:roleLabels.evc_coordinator,
      action:visit?.report?'Review the recorded visit report and complete the stage.':'Complete the visit and record its report.',
      due:visit?.report_due_at??visit?.scheduled_for??app.sla_due_at,
      source:visit?.report?'Recorded visit report':'Recorded visit plan',
      detail:visit?.report?'A report is on file; the recorded stage still needs its owning authority.':null,
    };
  }

  if(app.status==='pending_decision'){
    return {
      kind:'decision',
      owner:roleLabels.regional_officer,
      action:'Record an explicit human decision after the required review guards.',
      due:app.sla_due_at,
      source:'Recorded case deadline',
      detail:null,
    };
  }

  const obligation=openObligation(app,context);
  if(obligation){
    const submitted=obligation.status.toLowerCase()==='submitted';
    return {
      kind:'obligation',
      owner:submitted?'Authorised reviewer':roleLabels.institution,
      action:submitted?`Review the submitted evidence for "${obligation.title}"; submission alone does not close the condition.`:`Submit evidence for the continuing decision condition: ${obligation.title}.`,
      due:obligation.due_date,
      source:'Recorded continuing obligation',
      detail:obligation.required_evidence?.join(', ')??null,
      obligationId:obligation.id,
    };
  }

  const expired=app.status==='approved'?renewalDocument(app,context):null;
  if(expired){
    return {
      kind:'renewal',
      owner:roleLabels.institution,
      action:`Renew the expired ${expired.doc_type}. Submit one replacement for reviewer verification; the recorded decision is unchanged.`,
      due:null,
      source:'Recorded document validity',
      detail:`Expired on ${expired.expires_on}. No renewal deadline is recorded.`,
      documentId:expired.id,
    };
  }

  return {
    kind:'closed',
    owner:'No workflow transition',
    action:'The human decision is recorded. No continuing obligation is open.',
    due:null,
    source:'Recorded decision',
    detail:null,
  };
}
