import {describe,expect,it} from 'vitest';
import {seed} from '../src/data/demo';
import {nextStep,type NextStepContext} from '../src/domain/nextStep';
import type {Application,Obligation} from '../src/domain/model';

const workspace=seed();
const app=(id:string,extra:Partial<Application>={}):Application=>{
  const found=workspace.applications.find(item=>item.id===id);
  if(!found)throw new Error(`Missing demo application ${id}`);
  return {...found,...extra};
};
const context=(application:Application,extra:Partial<NextStepContext>={}):NextStepContext=>({
  documents:workspace.documents.filter(item=>item.application_id===application.id),
  deficiencies:workspace.deficiencies.filter(item=>item.application_id===application.id),
  obligations:workspace.obligations.filter(item=>item.application_id===application.id),
  visits:workspace.visits.filter(item=>item.application_id===application.id),
  ...extra,
});

describe('next step',()=>{
  it('keeps an incomplete draft with the institution and names missing inputs',()=>{
    const draft=app('demo-app-11');
    const requiredField=draft.template_snapshot.required_fields[0];
    const result=nextStep({...draft,form_data:{}},context(draft));
    expect(result.kind).toBe('submission');
    expect(result.owner).toBe('Institution');
    expect(result.action).toContain('Complete');
    expect(result.detail).toContain(requiredField.label);
    expect(result.due).toBeNull();
  });

  it('asks for explicit submission when the draft has no blockers',()=>{
    const draft=app('demo-app-11');
    const result=nextStep(draft,context(draft));
    expect(result.kind).toBe('submission');
    expect(result.action).toBe('Submit the draft for scrutiny.');
  });

  it('routes an open correction to the institution even when the status is still under scrutiny',()=>{
    const application=app('demo-app-0');
    const deficiency=workspace.deficiencies.find(item=>item.application_id===application.id&&item.status==='open');
    const result=nextStep(application,context(application));
    expect(result.kind).toBe('correction');
    expect(result.owner).toBe('Institution');
    expect(result.source).toBe('Recorded correction request');
    expect(result.due).toBe(deficiency?.due_at);
    expect(result.detail).toContain('Upload a Fire Safety Certificate');
  });

  it('places a submitted case with scrutiny and preserves the recorded deadline',()=>{
    const application=app('demo-app-4');
    const result=nextStep(application,context(application));
    expect(result.kind).toBe('scrutiny');
    expect(result.owner).toBe('Scrutiny officer');
    expect(result.action).toBe('Assign a scrutiny officer and start review.');
    expect(result.due).toBe(application.sla_due_at);
  });

  it('routes visit preparation and report completion to the EVC coordinator',()=>{
    const pending=app('demo-app-2');
    const scheduled=app('demo-app-7');
    expect(nextStep(pending,context(pending))).toMatchObject({kind:'visit',owner:'EVC coordinator',source:'Recorded visit plan'});
    expect(nextStep(scheduled,context(scheduled))).toMatchObject({kind:'visit',owner:'EVC coordinator',source:'Recorded visit plan'});
    expect(nextStep(scheduled,context(scheduled)).action).toBe('Complete the visit and record its report.');
  });

  it('surfaces a continuing condition after approval instead of treating the case as fully closed',()=>{
    const application=app('demo-app-5');
    const obligation=workspace.obligations.find(item=>item.application_id===application.id&&item.status==='open');
    const result=nextStep(application,context(application));
    expect(result.kind).toBe('obligation');
    expect(result.owner).toBe('Institution');
    expect(result.obligationId).toBe(obligation?.id);
    expect(result.action).toContain('Synthetic post-approval faculty condition');
    expect(result.detail).toBe('Faculty List');
    expect(result.due).toBe(obligation?.due_date);
  });

  it('distinguishes submitted obligation evidence from a closed condition',()=>{
    const application=app('demo-app-5');
    const submitted:Obligation={...workspace.obligations[2],id:'demo-obligation-submitted',status:'submitted'};
    const result=nextStep(application,context(application,{obligations:[submitted]}));
    expect(result.kind).toBe('obligation');
    expect(result.owner).toBe('Authorised reviewer');
    expect(result.action).toContain('submission alone does not close the condition');
  });

  it('records closure only when no continuing obligation is open',()=>{
    const approved=app('demo-app-8');
    const rejected=app('demo-app-10');
    expect(nextStep(approved,context(approved))).toMatchObject({kind:'closed',owner:'No workflow transition',due:null});
    expect(nextStep(rejected,context(rejected))).toMatchObject({kind:'closed',owner:'No workflow transition',due:null});
  });
});
