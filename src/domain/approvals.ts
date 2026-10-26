import type {Application,AppType,DocumentRecord,Workspace} from './model';

export interface ScopeRequest {
  id:string;application_id:string;course_key:string;programme:string;course_name:string;level:string;
  requested_intake:number;previous_scope_item_id:string|null;previous_approved_intake:number|null;
}
export type ScopeInput=Omit<ScopeRequest,'id'|'application_id'|'previous_approved_intake'>;
export interface ApprovalRecord {
  id:string;application_id:string|null;institution_id:string;decision_event_id:number|null;
  approval_type:string;academic_year_start:number;academic_year_end:number;valid_from:string;valid_to:string;
  conditions:string[];source_ref:string;provenance:'recorded_decision'|'seeded_demo';created_at:string;created_by:string|null;
}
export interface ApprovalScopeItem {
  id:string;approval_id:string;request_item_id:string|null;course_key:string;programme:string;course_name:string;level:string;
  previous_approved_intake:number|null;requested_intake:number;approved_intake:number;
}
export interface ScopedDecision {
  approval_type:string;academic_year_start:number;academic_year_end:number;valid_from:string;valid_to:string;
  items:{request_item_id:string;approved_intake:number}[];
  conditions:{title:string;due_date:string;required_evidence:string[]}[];
}
export type ValidityMode='unknown'|'dated'|'no_stated_expiry'|'not_applicable';
export interface ValidityInput {validity_mode:ValidityMode;issue_date:string|null;expires_on:string|null;issuer:string;document_number:string;supersedes_document_id:string|null;note:string}
export type CalendarBasis='calendar_days'|'weekdays';
export interface DeadlineNotice {
  id:string;code:string;title:string;issuer:string;source_url:string;source_version:string;source_hash:string;
  publication_date:string;effective_date:string;academic_year_start:number;application_type:AppType|null;
  institution_id:string|null;region:string|null;deadline_kind:'application_sla'|'obligation';
  obligation_kind:'undertaking'|'renewal'|'document_expiry'|null;
  trigger_type:'fixed_date'|'application_submitted'|'document_expiry';calendar_basis:CalendarBasis;
  duration_days:number|null;fixed_date:string|null;supersedes_notice_id:string|null;
  status:'draft'|'reviewed'|'adopted';revision:number;created_by:string;created_at:string;
  reviewed_by:string|null;reviewed_at:string|null;review_note:string|null;
}
export type NoticeInput=Omit<DeadlineNotice,'id'|'status'|'revision'|'created_by'|'created_at'|'reviewed_by'|'reviewed_at'|'review_note'>;
export interface DeadlineRevision {
  id:string;application_id:string;obligation_id:string|null;notice_id:string;adoption_id:string;
  subject_key:string;subject_revision:number;old_due_at:string|null;new_due_at:string;trigger_at:string|null;
  calendar_basis:CalendarBasis;source_version:string;status:'active'|'superseded'|'closed';created_at:string;
}
export interface ReminderIntent {
  id:string;deadline_id:string;application_id:string;recipient_id:string;scheduled_for:string;
  status:'pending'|'sent'|'superseded'|'cancelled'|'retry_wait'|'exhausted';sent_at:string|null;attempts?:number;next_attempt_at?:string;last_error?:string|null;
}
export interface NoticeImpactItem {subject_key:string;application_id:string;obligation_id:string|null;reference:string;old_due_at:string|null;new_due_at:string;trigger_at:string|null;revision:number}
export interface NoticeImpact {notice_id:string;notice_revision:number;items:NoticeImpactItem[];impact_hash:string}

export function deadlineRelaxed(oldDue:string|null,newDue:string){
  if(!oldDue)return true;
  const oldTime=Date.parse(oldDue),newTime=Date.parse(newDue);
  return Number.isFinite(oldTime)&&Number.isFinite(newTime)&&newTime>=oldTime;
}

export function academicYear(start:number){return `${start}–${String(start+1).slice(-2)}`;}
export function documentEligible(document:Pick<DocumentRecord,'scan_status'|'sha256'|'subject_institution_id'|'validity_reviewed_at'|'validity_reviewed_by'|'issue_date'|'validity_mode'|'expires_on'>,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now())){
  if(document.scan_status!=='clean'||!document.sha256||!document.subject_institution_id||!document.validity_reviewed_at||!document.validity_reviewed_by)return false;
  if(document.issue_date&&document.issue_date>today)return false;
  return (document.validity_mode==='no_stated_expiry'&&!document.expires_on)||(document.validity_mode==='dated'&&Boolean(document.expires_on&&document.expires_on>=today));
}
export function validityLabel(document:DocumentRecord){
  if(document.scan_status!=='clean')return document.scan_status==='pending'?'Quarantined':'Rejected file';
  if(document.validity_mode==='unknown'||!document.validity_mode)return 'Validity unknown';
  if(document.validity_mode==='not_applicable')return 'Not applicable';
  if(!document.validity_reviewed_at||!document.validity_reviewed_by)return 'Validity review pending';
  if(document.validity_mode==='no_stated_expiry'&&document.expires_on)return 'Inconsistent validity metadata · review required';
  if(document.validity_mode==='no_stated_expiry')return 'No stated expiry · reviewed';
  return documentEligible(document)?`Current through ${document.expires_on}`:`Expired or not yet effective · ${document.expires_on??'date missing'}`;
}
const DAY=86400000,IST=19800000;
export function noticeDue(notice:Pick<DeadlineNotice,'trigger_type'|'fixed_date'|'duration_days'|'calendar_basis'>,anchor:string|null){
  if(notice.trigger_type==='fixed_date')return notice.fixed_date?new Date(notice.fixed_date+'T23:59:59.999+05:30').toISOString():null;
  if(!anchor||notice.duration_days===null)return null;
  let value=Date.parse(anchor);if(!Number.isFinite(value))return null;
  if(notice.calendar_basis==='calendar_days')value+=notice.duration_days*DAY;
  else for(let count=0;count<notice.duration_days;){value+=DAY;const day=new Date(value+IST).getUTCDay();if(day!==0&&day!==6)count++;}
  return new Date(value).toISOString();
}
export function noticeItems(data:Workspace,notice:DeadlineNotice):NoticeImpactItem[]{
  const matches=(app:Application)=>app.academic_year_start===notice.academic_year_start&&(!notice.application_type||app.app_type===notice.application_type)&&(!notice.institution_id||app.institution_id===notice.institution_id)&&(!notice.region||app.region===notice.region);
  const rows:NoticeImpactItem[]=[];
  for(const app of data.applications.filter(matches)){
    if(notice.deadline_kind==='application_sla'){
      if(['draft','approved','rejected'].includes(app.status))continue;
      const anchor=app.submitted_at,due=noticeDue(notice,anchor);if(!due)continue;
      rows.push({subject_key:'application:'+app.id,application_id:app.id,obligation_id:null,reference:app.ref_no,old_due_at:app.sla_due_at,new_due_at:due,trigger_at:anchor,revision:app.version});
    }else for(const obligation of data.obligations.filter(item=>item.application_id===app.id&&item.status!=='fulfilled'&&(!notice.obligation_kind||item.kind===notice.obligation_kind))){
      const doc=data.documents.find(item=>item.id===obligation.document_id);
      const anchor=notice.trigger_type==='document_expiry'?(doc?.expires_on?new Date(doc.expires_on+'T23:59:59.999+05:30').toISOString():null):app.submitted_at;
      const due=noticeDue(notice,anchor);if(!due)continue;
      rows.push({subject_key:'obligation:'+obligation.id,application_id:app.id,obligation_id:obligation.id,reference:app.ref_no+' · '+obligation.title,
        old_due_at:new Date(obligation.due_date+'T23:59:59.999+05:30').toISOString(),new_due_at:due,trigger_at:anchor,revision:obligation.deadline_revision??1});
    }
  }
  return rows.sort((a,b)=>a.subject_key.localeCompare(b.subject_key));
}
