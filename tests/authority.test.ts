import {describe,expect,it} from 'vitest';
import {seed} from '../src/data/demo';
import {caseAuthority,type AuthorityContext} from '../src/domain/authority';
import type {AccessAssignment} from '../src/domain/integrity';
import type {Application,AuditEvent} from '../src/domain/model';

const workspace=seed();
const base=workspace.applications[0];
const now=Date.parse('2026-10-27T04:00:00.000Z');
const app=(extra:Partial<Application>={}):Application=>({...base,...extra});
const grant=(extra:Partial<AccessAssignment>={}):AccessAssignment=>({user_id:'demo-scrutiny',role:'scrutiny_officer',region:'South',active:true,expires_at:'2026-11-30T00:00:00.000Z',revoked_at:null,granted_by:'demo-national',grant_reason:'Temporary South scrutiny coverage.',...extra});
const event=(extra:Partial<AuditEvent>={}):AuditEvent=>({id:1,application_id:base.id,actor_id:'demo-national',actor_role:'national_admin',action:'operations_assign_case',from_status:'submitted',to_status:'submitted',reason:'Allocated to cover the South queue.',created_at:'2026-10-20T04:00:00.000Z',payload:{},...extra});
const context=(extra:Partial<AuthorityContext>={}):AuthorityContext=>({events:[],access_assignments:[],visits:[],...extra});

describe('case authority',()=>{
  it('places an assigned scrutiny case with its officer, active grant and recorded allocation',()=>{
    const result=caseAuthority(app({assigned_officer:'demo-scrutiny'}),context({events:[event({payload:{assigned_to:'demo-scrutiny'}}),event({id:2,created_at:'2026-10-21T04:00:00.000Z',reason:'Allocated elsewhere.',payload:{assigned_to:'demo-other'}})],access_assignments:[grant()]}),now);
    expect(result.holder).toMatchObject({kind:'person',user_id:'demo-scrutiny',role:'scrutiny_officer',region:'South'});
    expect(result.grant).toMatchObject({state:'active',grant_reason:'Temporary South scrutiny coverage.'});
    expect(result.handoff).toMatchObject({action:'operations_assign_case',actor_id:'demo-national',reason:'Allocated to cover the South queue.'});
    expect(result.warnings).toEqual([]);
  });

  it('does not invent an individual holder when scrutiny has no assigned officer',()=>{
    const result=caseAuthority(app({status:'under_scrutiny',assigned_officer:null}),context(),now);
    expect(result.holder).toMatchObject({kind:'role',user_id:null,role:'scrutiny_officer',region:'South'});
    expect(result.grant).toBeNull();
    expect(result.warnings).toContain('The case is under scrutiny but no individual officer is recorded.');
  });

  it('ignores an allocation recorded for another case',()=>{
    const result=caseAuthority(app({assigned_officer:'demo-scrutiny'}),context({events:[event({id:2,application_id:'demo-app-1',payload:{assigned_to:'demo-scrutiny'}})],access_assignments:[grant()]}),now);
    expect(result.handoff).toBeNull();
  });

  it('reports an expired grant rather than claiming current authority',()=>{
    const result=caseAuthority(app({assigned_officer:'demo-scrutiny'}),context({access_assignments:[grant({expires_at:'2026-10-26T00:00:00.000Z'})]}),now);
    expect(result.holder.kind).toBe('person');
    expect(result.grant?.state).toBe('expired');
    expect(result.warnings).toContain('The recorded scrutiny officer grant has expired.');
  });

  it('flags an active grant that runs out before the case deadline',()=>{
    const result=caseAuthority(app({assigned_officer:'demo-scrutiny',sla_due_at:'2026-12-01T00:00:00.000Z'}),context({access_assignments:[grant({expires_at:'2026-11-20T00:00:00.000Z'})]}),now);
    expect(result.grant?.state).toBe('active');
    expect(result.warnings).toContain('The recorded scrutiny officer grant expires before the case deadline.');
  });

  it('keeps a returned case with the institution and names the return event',()=>{
    const result=caseAuthority(app({status:'deficiency_raised',assigned_officer:null}),context({events:[event({action:'raise_deficiency',actor_id:'demo-scrutiny',actor_role:'scrutiny_officer',from_status:'under_scrutiny',to_status:'deficiency_raised',reason:'Affidavit needs a current signature.'})]}),now);
    expect(result.holder).toMatchObject({kind:'institution',user_id:base.owner_id,institution_id:base.institution_id});
    expect(result.grant).toBeNull();
    expect(result.handoff).toMatchObject({action:'raise_deficiency',actor_id:'demo-scrutiny',reason:'Affidavit needs a current signature.'});
    expect(result.warnings).toEqual([]);
  });

  it('names the recorded EVC coordinator and visit handoff',()=>{
    const visit={...workspace.visits[0],application_id:base.id,coordinator_id:'demo-evc',scheduled_for:'2026-11-02T04:30:00.000Z'};
    const result=caseAuthority(app({status:'evc_scheduled',assigned_officer:null}),context({visits:[visit],events:[event({action:'inspection_plan',actor_id:'demo-evc',actor_role:'evc_coordinator',from_status:'evc_pending',to_status:'evc_scheduled',reason:'Visit planned for the recorded window.'})],access_assignments:[grant({user_id:'demo-evc',role:'evc_coordinator',grant_reason:'Seeded South visit coordination.'})]}),now);
    expect(result.holder).toMatchObject({kind:'person',user_id:'demo-evc',role:'evc_coordinator'});
    expect(result.grant).toMatchObject({state:'active',role:'evc_coordinator'});
    expect(result.handoff).toMatchObject({action:'inspection_plan',actor_id:'demo-evc'});
  });

  it('leaves final decisions with the regional role and closes completed records',()=>{
    const decision=caseAuthority(app({status:'pending_decision',assigned_officer:null}),context(),now);
    expect(decision.holder).toMatchObject({kind:'role',role:'regional_officer',region:'South'});
    expect(decision.grant).toBeNull();
    expect(decision.handoff).toBeNull();
    const closed=caseAuthority(app({status:'approved'}),context({events:[event({action:'approve'})]}),now);
    expect(closed).toEqual({holder:{kind:'closed',user_id:null,role:null,region:null,institution_id:null},grant:null,handoff:null,warnings:[]});
  });
});
