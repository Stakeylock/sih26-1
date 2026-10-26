import {describe,expect,it} from 'vitest';
import {recommendPanel,type ExpertAvailability,type ExpertReservation,type InspectionExpert} from '../src/domain/planning';

const start='2026-11-02T04:30:00.000Z',end='2026-11-02T06:30:00.000Z';
const expert=(id:string,name:string,discipline:string,extra:Partial<InspectionExpert>={}):InspectionExpert=>({id,name,organisation:'Demo partner institute',discipline,region:'South',affiliated_institution_id:null,active:true,version:1,created_by:'demo-national',created_at:'2026-10-01T00:00:00.000Z',...extra});
const availability=(id:string):ExpertAvailability=>({id:'avail-'+id,expert_id:id,starts_at:'2026-11-01T00:00:00.000Z',ends_at:'2026-11-05T00:00:00.000Z',note:'Recorded availability for the review week.',recorded_by:'demo-national',created_at:'2026-10-01T00:00:00.000Z'});
const reservation=(id:string,expertId:string):ExpertReservation=>({id,expert_id:expertId,visit_id:'visit-other',application_id:'demo-app-2',starts_at:'2026-11-02T05:00:00.000Z',ends_at:'2026-11-02T07:00:00.000Z',active:true});

describe('panel recommendation',()=>{
  const experts=[expert('b','Demo expert B','Facilities review'),expert('a','Demo expert A','Academic review'),expert('c','Demo expert C','Operational coordination')];

  it('is deterministic and covers distinct disciplines first',()=>{
    const first=recommendPanel(experts,'demo-inst-0',start,end,experts.map(item=>availability(item.id)),[],[],null);
    const second=recommendPanel([...experts].reverse(),'demo-inst-0',start,end,experts.map(item=>availability(item.id)),[],[],null);
    expect(second).toEqual(first);
    expect(first.recommended.map(item=>item.expert.id)).toEqual(['a','b','c']);
    expect(first.excluded).toEqual([]);
    for(const item of first.recommended)expect(item.reasons).toHaveLength(2);
  });

  it('respects the panel limit without duplicating a member',()=>{
    const result=recommendPanel([...experts,expert('a','Demo expert A','Academic review')],'demo-inst-0',start,end,experts.map(item=>availability(item.id)),[],[],null,2);
    expect(result.recommended).toHaveLength(2);
    expect(new Set(result.recommended.map(item=>item.expert.id)).size).toBe(2);
  });

  it('excludes experts using the recorded reasons',()=>{
    const roster=[expert('inactive','Demo inactive','Academic review',{active:false}),expert('affiliated','Demo affiliated','Academic review',{affiliated_institution_id:'demo-inst-0'}),expert('unavailable','Demo unavailable','Facilities review'),expert('reserved','Demo reserved','Operational coordination'),expert('clear','Demo clear','Operational coordination')];
    const result=recommendPanel(roster,'demo-inst-0',start,end,[availability('inactive'),availability('affiliated'),availability('reserved'),availability('clear')],[{id:'conflict-1',expert_id:'reserved',institution_id:'demo-inst-0',reason:'Recorded conflict.',active:true,recorded_by:'demo-national',created_at:'2026-10-01T00:00:00.000Z'}],[reservation('reservation-1','reserved')],null);
    const reasons=Object.fromEntries(result.excluded.map(item=>[item.expert.id,item.reasons]));
    expect(reasons.inactive).toContain('Expert is inactive.');
    expect(reasons.affiliated).toContain('Affiliation with this institution requires a different panel member.');
    expect(reasons.unavailable).toContain('No recorded availability covers the full window.');
    expect(reasons.reserved).toContain('An active declared conflict exists.');
    expect(reasons.reserved).toContain('Another visit reserves an overlapping window.');
    expect(result.recommended.map(item=>item.expert.id)).toEqual(['clear']);
  });
});
