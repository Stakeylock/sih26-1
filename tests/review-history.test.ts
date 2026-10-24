import {describe,expect,it} from 'vitest';
import {seed} from '../src/data/demo';
import type {AuditEvent} from '../src/domain/model';
import {captureReviewSnapshot,historyCoverage,recordedSnapshot,type CaseHistory} from '../src/domain/review';
import {computeDualClock,workingDaysUntil} from '../src/domain/clock';
import {allowedActions} from '../src/domain/model';

const data=seed(),app=data.applications[0];
function event(sequence:number,at:string,waiting:boolean,id='def-a'):AuditEvent{
  const snapshot=captureReviewSnapshot(data,app);
  snapshot.deficiencies=waiting?[{...data.deficiencies[0],id,status:'open'}]:[];
  return {id:sequence,sequence,application_id:app.id,actor_id:null,actor_role:'system',action:sequence===1?'created':'synthetic_review_step',from_status:null,to_status:null,reason:null,created_at:at,payload:{review_snapshot:snapshot}};
}
const history=(events:AuditEvent[],complete=true):CaseHistory=>({events,complete,through:events.length,head_hash:null});
describe('honest snapshot coverage',()=>{
  it('detects missing sequences and unsupported snapshot versions',()=>{
    const events=[event(1,'2026-10-19T00:00:00+05:30',false),event(2,'2026-10-20T00:00:00+05:30',false)];
    expect(historyCoverage(history(events)).complete).toBe(true);
    expect(historyCoverage({...history(events),events:[events[1]]}).complete).toBe(false);
    const unsupported={...events[1],payload:{review_snapshot:{schema:99}}};
    expect(recordedSnapshot(unsupported)).toBeNull();
    expect(historyCoverage(history([events[0],unsupported]))).toMatchObject({complete:false,unsupported:true});
  });
  it('retains a deep copy of historical evidence and current-state labels',()=>{
    const snapshot=captureReviewSnapshot(data,app),note=snapshot.claims[0].verification_note;
    const modified=structuredClone(data);modified.claims[0].verification_note='Later changed note';modified.documents[0].sha256='0'.repeat(64);
    expect(snapshot.claims[0].verification_note).toBe(note);expect(snapshot.documents[0].sha256).not.toBe(modified.documents[0].sha256);
  });
  it('keeps unsupported appeals out of connected action lists',()=>{
    const rejected={...app,status:'rejected' as const,owner_id:'demo-institution'};
    const identity={id:'demo-institution',name:'Synthetic owner',email:'owner@demo.invalid',roles:[{role:'institution' as const,region:null}]};
    expect(allowedActions(rejected,identity,'connected')).toEqual([]);
    expect(allowedActions(rejected,identity,'demo')).toEqual(['request_shc']);
  });
});
describe('event-based response clocks',()=>{
  it('counts two separate institution windows and leaves reviewer time between them',()=>{
    const events=[event(1,'2026-10-19T00:00:00+05:30',false),event(2,'2026-10-19T00:00:00+05:30',true),
      event(3,'2026-10-20T00:00:00+05:30',false),event(4,'2026-10-21T00:00:00+05:30',true),event(5,'2026-10-22T00:00:00+05:30',false)];
    const clock=computeDualClock({startAt:events[0].created_at,events,historyComplete:true},Date.parse('2026-10-23T00:00:00+05:30'));
    expect(clock).toMatchObject({institutionDays:2,officerDays:2,totalWorkingDays:4,paused:false,complete:true});
  });
  it('unions simultaneous open deficiencies instead of charging time twice',()=>{
    const first=event(1,'2026-10-19T00:00:00+05:30',true),second=event(2,'2026-10-20T00:00:00+05:30',true);
    const snapshot=recordedSnapshot(second)!;snapshot.deficiencies.push({...snapshot.deficiencies[0],id:'def-b'});
    const closed=event(3,'2026-10-21T00:00:00+05:30',false);
    const clock=computeDualClock({startAt:first.created_at,events:[first,second,closed],historyComplete:true},Date.parse('2026-10-22T00:00:00+05:30'));
    expect(clock).toMatchObject({institutionDays:2,officerDays:1,totalWorkingDays:3});
  });
  it('does not round each same-day response window separately',()=>{
    const events=[event(1,'2026-10-19T00:00:00+05:30',true),event(2,'2026-10-19T06:00:00+05:30',false),
      event(3,'2026-10-19T12:00:00+05:30',true),event(4,'2026-10-19T18:00:00+05:30',false)];
    const clock=computeDualClock({startAt:events[0].created_at,events,historyComplete:true},Date.parse('2026-10-20T00:00:00+05:30'));
    expect(clock).toMatchObject({institutionDays:0.5,officerDays:0.5,totalWorkingDays:1});
  });
  it('excludes weekends, freezes at closure, and does not attribute draft age',()=>{
    const events=[event(1,'2026-10-23T00:00:00+05:30',true)];
    const input={startAt:events[0].created_at,events,historyComplete:true,closedAt:'2026-10-26T00:00:00+05:30'};
    expect(computeDualClock(input,Date.parse('2026-10-30T00:00:00+05:30'))).toMatchObject({institutionDays:1,officerDays:0,totalWorkingDays:1,paused:false});
    expect(computeDualClock({...input,startAt:null})).toMatchObject({totalWorkingDays:0,complete:false});
  });
  it('labels baseline-only and interrupted history as partial',()=>{
    const legacy={...event(1,'2026-10-19T00:00:00+05:30',false),payload:{}};
    const baseline={...event(2,'2026-10-21T00:00:00+05:30',true),action:'review_baseline'};
    expect(computeDualClock({startAt:'2026-10-19T00:00:00+05:30',events:[legacy,baseline],historyComplete:true},Date.parse('2026-10-22T00:00:00+05:30'))).toMatchObject({complete:false,institutionDays:1});
    expect(computeDualClock({startAt:legacy.created_at,events:[legacy,baseline],historyComplete:false},Date.parse('2026-10-22T00:00:00+05:30'))).toMatchObject({complete:false,institutionDays:0,coverageStart:null});
  });
  it('uses the synthetic IST day boundary independent of host timezone',()=>{
    expect(workingDaysUntil('2026-10-20T00:00:00+05:30',Date.parse('2026-10-19T23:30:00+05:30'))).toBe(1);
    expect(workingDaysUntil('2026-10-19T00:00:00+05:30',Date.parse('2026-10-19T23:30:00+05:30'))).toBe(0);
  });
});
