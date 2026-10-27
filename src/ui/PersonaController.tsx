import type {Action,Application} from '../domain/model';
import {actionLabels,nextAuthority} from '../domain/model';
import type {CaseNextStep} from '../domain/nextStep';

export function PersonaController({app,actions,caseNextStep}:{app:Application;actions:Action[];caseNextStep:CaseNextStep}){
  if(caseNextStep.kind==='closed')return null;
  const holder=caseNextStep.owner??nextAuthority(app.status);
  const held=actions.length>0;
  const statutory=caseNextStep.kind==='decision'||(caseNextStep.kind==='obligation'&&caseNextStep.owner==='Authorised reviewer');
  return <section className="persona-controller" aria-label="Step controller"><span className="persona-label">{holder} holds this step.</span>{held?<><span className="quiet-label">Permitted action</span><p className="persona-action">{actionLabels[actions[0]]}</p></>:<><span className="quiet-label">Your role holds no action at this gate</span><p>{holder} holds this step.</p></>}{statutory&&<p className="persona-note">Statutory decisions can never be taken by automated system actors. A human {holder} must record this decision.</p>}</section>;
}
