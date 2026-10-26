import {describe,expect,it} from 'vitest';
import {seed} from '../src/data/demo';
import {explainDeadline} from '../src/domain/deadline';
import type {DeadlineRevision} from '../src/domain/approvals';

describe('deadline derivation',()=>{
  const workspace=seed();

  it('explains a recorded target with the declared calendar rule',()=>{
    const app=workspace.applications[0];
    const result=explainDeadline(app);
    expect(result.target).toBe(app.sla_due_at);
    expect(result.workingDays).toBeTypeOf('number');
    expect(result.source).toEqual({kind:'record'});
    expect(result.holidayDates).toBe(0);
    expect(result.pause).toBeNull();
  });

  it('names an adopted notice and the target it moved from',()=>{
    const app=workspace.applications[0];
    const notice=workspace.notices![0];
    const revision:DeadlineRevision={id:'demo-deadline-test',application_id:app.id,obligation_id:null,notice_id:notice.id,adoption_id:'demo-adoption-test',subject_key:'application:'+app.id,subject_revision:2,old_due_at:'2026-10-20T09:30:00.000Z',new_due_at:app.sla_due_at!,trigger_at:app.submitted_at,calendar_basis:notice.calendar_basis,source_version:notice.source_version,status:'active',created_at:'2026-10-21T04:00:00.000Z'};
    const result=explainDeadline(app,{deadlines:[revision],notices:workspace.notices});
    expect(result.source).toMatchObject({kind:'notice',code:notice.code,title:notice.title,oldDueAt:'2026-10-20T09:30:00.000Z',newDueAt:app.sla_due_at,sourceVersion:notice.source_version,calendarBasis:notice.calendar_basis});
  });

  it('retains the pause snapshot when a correction is with the institution',()=>{
    const app={...workspace.applications[0],paused_remaining_working_days:4,paused_at:'2026-10-24T04:00:00.000Z',pause_reason:'Correction requested with a recorded reason.'};
    const result=explainDeadline(app);
    expect(result.pause).toEqual({remainingWorkingDays:4,pausedAt:'2026-10-24T04:00:00.000Z',reason:'Correction requested with a recorded reason.'});
  });

  it('returns no target when none is recorded',()=>{
    const app={...workspace.applications[0],sla_due_at:null};
    const result=explainDeadline(app);
    expect(result.target).toBeNull();
    expect(result.workingDays).toBeNull();
    expect(result.source).toEqual({kind:'none'});
  });
});
