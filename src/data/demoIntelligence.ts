import {demoReviewContent} from './demoOperations';
import type {Application,Identity,Repository,Workspace} from '../domain/model';
import type {CaseHistory} from '../domain/review';
import {ANALYSIS_ENGINE,captureAnalysis,runScenario,scenarioSchema,type AnalysisSnapshot,type SavedScenario} from '../domain/intelligence';
import {sha256Hex,stableJson} from '../domain/integrity';

export function demoIntelligence(options:{state:()=>Workspace;actor:Identity;find:(id:string)=>Application;persist:()=>void;history:(app:Application)=>Promise<CaseHistory>}):Pick<Repository,'captureAnalysis'|'saveScenario'> {
  async function facts(app:Application){const state=options.state(),basis=await demoReviewContent(state,app);return {...state,case_reviews:(state.case_reviews??[]).map(item=>item.application_id===app.id?{...item,basis_current:item.basis_hash===basis}:item)};}
  const receipts=new Map<string,{input:string;result:AnalysisSnapshot|SavedScenario}>();
  return {
    async captureAnalysis(application,requestId=crypto.randomUUID()){
      const app=options.find(application.id),input=stableJson({actor:options.actor.id,action:'capture',id:app.id,version:application.version});
      const receipt=receipts.get(requestId);if(receipt){if(receipt.input!==input)throw new Error('Request ID already used.');return structuredClone(receipt.result as AnalysisSnapshot);}
      if(app.version!==application.version)throw new Error('Case changed; reload before capturing.');
      const snapshot=await captureAnalysis(await facts(app),app,await options.history(app),options.actor.id);
      options.state().analysis_snapshots??=[];options.state().analysis_snapshots!.push(snapshot);receipts.set(requestId,{input,result:snapshot});options.persist();return structuredClone(snapshot);
    },
    async saveScenario(snapshot,parameters,requestId=crypto.randomUUID()){
      const app=options.find(snapshot.application_id),captured=options.state().analysis_snapshots?.find(item=>item.id===snapshot.id);
      if(!captured)throw new Error('Captured analysis unavailable.');
      const parsed=scenarioSchema.parse(parameters),input=stableJson({actor:options.actor.id,action:'save',snapshot:snapshot.id,parameters:parsed});
      const receipt=receipts.get(requestId);if(receipt){if(receipt.input!==input)throw new Error('Request ID already used.');return structuredClone(receipt.result as SavedScenario);}
      const fresh=await captureAnalysis(await facts(app),app,await options.history(app),options.actor.id);
      if(captured.app_version!==app.version||captured.source_hash!==fresh.source_hash)throw new Error('Captured case changed; capture a fresh analysis snapshot.');
      runScenario(captured,parsed);
      const row:SavedScenario={id:'scenario-'+crypto.randomUUID(),application_id:app.id,snapshot_id:snapshot.id,created_by:options.actor.id,created_at:new Date().toISOString(),engine_version:ANALYSIS_ENGINE,parameters:parsed,source_hash:captured.source_hash,parameter_hash:await sha256Hex(stableJson(parsed)),name:parsed.name};
      options.state().analysis_scenarios??=[];options.state().analysis_scenarios!.push(row);receipts.set(requestId,{input,result:row});options.persist();return structuredClone(row);
    },
  };
}
