import {describe,expect,it} from 'vitest';
import {seed} from '../src/data/demo';
import type {AuditEvent} from '../src/domain/model';
import type {DeadlineNotice} from '../src/domain/approvals';
import {policyChangesSince} from '../src/domain/policyChanges';

const workspace=seed();
const draft=workspace.notices![0];

function notice(id:string,code:string):DeadlineNotice{
  return {...draft,id,code,title:`${code} title`,status:'adopted'};
}

function adopted(id:number,noticeId:string,applicationId:string,createdAt:string,action='deadline_adopted'):AuditEvent{
  return {id,application_id:applicationId,actor_id:'demo-national',actor_role:'national_admin',action,from_status:null,to_status:null,reason:'Synthetic adoption.',created_at:createdAt,payload:{notice_id:noticeId,adoption_id:'adoption-'+id}};
}

describe('policy changes since last visit',()=>{
  it('counts each adopted notice and each visible case once',()=>{
    const row=notice('notice-a','DEMO-A');
    const changes=policyChangesSince({notices:[row],events:[
      adopted(1,row.id,'demo-app-0','2026-10-27T10:00:00.000Z'),
      adopted(2,row.id,'demo-app-1','2026-10-27T10:05:00.000Z'),
      adopted(3,row.id,'demo-app-0','2026-10-27T10:06:00.000Z'),
    ]},'2026-10-27T09:00:00.000Z');
    expect(changes).toEqual([{noticeId:row.id,code:'DEMO-A',title:'DEMO-A title',adoptedAt:'2026-10-27T10:06:00.000Z',caseCount:2}]);
  });

  it('ignores events at or before the visit boundary and events without an adopted notice',()=>{
    const row=notice('notice-a','DEMO-A');
    const since='2026-10-27T09:00:00.000Z';
    const changes=policyChangesSince({notices:[row],events:[
      adopted(1,row.id,'demo-app-0',since),
      adopted(2,row.id,'demo-app-1','2026-10-27T08:59:59.000Z'),
      adopted(3,row.id,'demo-app-1','2026-10-27T10:00:00.000Z','deadline_revised'),
      adopted(4,'missing-notice','demo-app-1','2026-10-27T10:00:00.000Z'),
      {...adopted(5,row.id,'demo-app-1','2026-10-27T10:00:00.000Z'),payload:{}},
    ]},since);
    expect(changes).toEqual([]);
  });

  it('orders notices by latest adoption and then code',()=>{
    const a=notice('notice-a','DEMO-A'),b=notice('notice-b','DEMO-B'),c=notice('notice-c','DEMO-C');
    const changes=policyChangesSince({notices:[a,b,c],events:[
      adopted(1,a.id,'demo-app-0','2026-10-27T10:00:00.000Z'),
      adopted(2,b.id,'demo-app-0','2026-10-27T10:10:00.000Z'),
      adopted(3,c.id,'demo-app-0','2026-10-27T10:10:00.000Z'),
    ]},'2026-10-27T09:00:00.000Z');
    expect(changes.map(change=>change.code)).toEqual(['DEMO-B','DEMO-C','DEMO-A']);
  });

  it('shows nothing without a previous visit timestamp',()=>{
    const row=notice('notice-a','DEMO-A');
    const events=[adopted(1,row.id,'demo-app-0','2026-10-27T10:00:00.000Z')];
    expect(policyChangesSince({notices:[row],events},null)).toEqual([]);
    expect(policyChangesSince({notices:[row],events},'not-a-time')).toEqual([]);
  });
});
