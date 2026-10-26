import {workingDaysUntil} from './clock';
import {workspaceHolidays} from './calendar';
import type {DeadlineRevision} from './approvals';
import type {Application,Workspace} from './model';

export type DeadlineContext=Pick<Workspace,'deadlines'|'notices'>;

export interface DeadlineNoticeSource {
  kind:'notice';
  code:string;
  title:string;
  sourceVersion:string;
  oldDueAt:string|null;
  newDueAt:string;
  calendarBasis:DeadlineRevision['calendar_basis'];
  adoptedAt:string;
}

export interface DeadlinePauseSource {
  remainingWorkingDays:number;
  pausedAt:string|null;
  reason:string|null;
}

export interface DeadlineDerivation {
  target:string|null;
  workingDays:number|null;
  source:DeadlineNoticeSource|{kind:'record'}|{kind:'none'};
  pause:DeadlinePauseSource|null;
  holidayDates:number;
}

export function explainDeadline(app:Application,context?:DeadlineContext):DeadlineDerivation {
  const holidays=workspaceHolidays();
  const active=context?.deadlines?.find(row=>row.application_id===app.id&&row.obligation_id===null&&row.subject_key==='application:'+app.id&&row.status==='active');
  const notice=active?context?.notices?.find(row=>row.id===active.notice_id):undefined;
  const paused=app.paused_remaining_working_days!==null&&app.paused_remaining_working_days!==undefined;
  const source:DeadlineDerivation['source']=active&&notice
    ?{kind:'notice',code:notice.code,title:notice.title,sourceVersion:active.source_version,oldDueAt:active.old_due_at,newDueAt:active.new_due_at,calendarBasis:active.calendar_basis,adoptedAt:active.created_at}
    :app.sla_due_at?{kind:'record'}:{kind:'none'};
  return {
    target:app.sla_due_at??null,
    workingDays:workingDaysUntil(app.sla_due_at,undefined,holidays),
    source,
    pause:paused?{remainingWorkingDays:app.paused_remaining_working_days??0,pausedAt:app.paused_at??null,reason:app.pause_reason??null}:null,
    holidayDates:holidays.length,
  };
}
