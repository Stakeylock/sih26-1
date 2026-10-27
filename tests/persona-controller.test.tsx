// @vitest-environment happy-dom
import {describe,expect,it} from 'vitest';
import {renderToString} from 'react-dom/server';
import {seed} from '../src/data/demo';
import {PersonaController} from '../src/ui/PersonaController';
import type {Action,Application} from '../src/domain/model';
import {nextStep,type CaseNextStep,type NextStepContext} from '../src/domain/nextStep';

const workspace=seed();
const app=(id:string,extra:Partial<Application>={}):Application=>{
  const found=workspace.applications.find(item=>item.id===id);
  if(!found)throw new Error(`Missing demo application ${id}`);
  return {...found,...extra};
};
const context=(application:Application):NextStepContext=>({
  documents:workspace.documents.filter(item=>item.application_id===application.id),
  deficiencies:workspace.deficiencies.filter(item=>item.application_id===application.id),
  obligations:workspace.obligations.filter(item=>item.application_id===application.id),
  visits:workspace.visits.filter(item=>item.application_id===application.id),
});

const holderOf=(application:Application):CaseNextStep=>nextStep(application,context(application));
const renderOf=(application:Application,actions:Action[]):string=>renderToString(<PersonaController app={application} actions={actions} caseNextStep={holderOf(application)}/>);

describe('persona controller',()=>{
  it('renders nothing for a closed step',()=>{
    const closed=app('demo-app-8',{status:'approved'});
    expect(renderOf(closed,[])).toBe('');
  });

  it('names the holder and reports no permitted action when the viewer holds nothing',()=>{
    const submitted=app('demo-app-4');
    const html=renderOf(submitted,[]);
    expect(submitted.status).toBe('submitted');
    expect(holderOf(submitted).kind).toBe('scrutiny');
    expect(holderOf(submitted).owner).toBe('Scrutiny officer');
    expect(html).toContain('Scrutiny officer');
    expect(html).toContain('holds this step.');
    expect(html).toContain('Your role holds no action at this gate');
    expect(html).not.toContain('Permitted action');
  });

  it('renders the single permitted action when the viewer holds the step',()=>{
    const draft=app('demo-app-11');
    const html=renderOf(draft,['submit']);
    expect(holderOf(draft).kind).toBe('submission');
    expect(holderOf(draft).owner).toBe('Institution');
    expect(html).toContain('Institution');
    expect(html).toContain('holds this step.');
    expect(html).toContain('Permitted action');
    expect(html).toContain('Submit application');
  });

  it('adds the human-oversight sentence for a statutory decision step',()=>{
    const decision=app('demo-app-8',{status:'pending_decision'});
    const html=renderOf(decision,['approve','reject']);
    expect(holderOf(decision).kind).toBe('decision');
    expect(holderOf(decision).owner).toBe('Regional officer');
    expect(html).toContain('Regional officer');
    expect(html).toContain('holds this step.');
    expect(html).toContain('Record demo approval');
    expect(html).toContain('Statutory decisions can never be taken by automated system actors.');
    expect(html).toContain('must record this decision.');
  });

  it('omits the oversight sentence for non-statutory steps',()=>{
    const submitted=app('demo-app-4');
    const html=renderOf(submitted,['start_scrutiny']);
    expect(html).not.toContain('Statutory decisions can never be taken by automated system actors.');
  });
});
