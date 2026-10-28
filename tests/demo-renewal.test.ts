import {describe,expect,it} from 'vitest';
import {createDemoRepository,demoIdentities} from '../src/data/demo';
import type {RenewalInput,Repository} from '../src/domain/model';

// PGlite-based demo repository persists to localStorage; the node test runner has none.
Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},clear:()=>{},length:0,key:()=>null},writable:true});

async function institutionRepo():Promise<{repo:Repository;appId:string;expiredId:string}>{
  const repo=await createDemoRepository('institution');
  const workspace=await repo.workspace();
  const app=workspace.applications.find(item=>item.id==='demo-app-9');
  if(!app)throw new Error('Missing demo-app-9.');
  const expired=workspace.documents.find(item=>item.application_id===app.id&&item.doc_type==='Fire Safety Certificate'&&item.expires_on==='2026-10-15');
  if(!expired)throw new Error('Missing expired Fire Safety Certificate for demo-app-9.');
  return {repo,appId:app.id,expiredId:expired.id};
}

function fileInput(bytes:Uint8Array=new Uint8Array([1,2,3]),name='renewal.pdf',note='Replacement synthetic fire certificate issued after review.'):RenewalInput{
  return {file:new File([bytes],name,{type:'application/pdf'}) as unknown as File,note};
}

describe('demo renewal submission',()=>{
  it('submits a clean replacement, records a submitted renewal, and leaves the decision unchanged',async()=>{
    const {repo,appId,expiredId}=await institutionRepo();
    const workspace=await repo.workspace();
    const app=workspace.applications.find(item=>item.id===appId)!;
    const version=app.version;
    await repo.submitRenewal(app,workspace.documents.find(item=>item.id===expiredId)!,fileInput(),crypto.randomUUID());
    const updated=await repo.workspace();
    const replacement=updated.documents.find(item=>item.supersedes_document_id===expiredId&&item.scan_status==='clean'&&item.sha256);
    expect(replacement).toBeTruthy();
    const obligation=updated.obligations.find(item=>item.application_id===appId&&item.kind==='renewal');
    expect(obligation?.status).toBe('submitted');
    expect(obligation?.document_id).toBe(expiredId);
    expect(obligation?.document_expiry_on).toBe('2026-10-15');
    expect(obligation?.deadline_source).toBe('document_validity');
    expect(obligation?.required_evidence).toEqual(['Fire Safety Certificate']);
    expect(updated.applications.find(item=>item.id===appId)!.status).toBe('approved');
    expect(updated.applications.find(item=>item.id===appId)!.version).toBe(version+1);
    const event=updated.events.find(item=>item.application_id===appId&&item.action==='renewal_submitted');
    expect(event).toBeTruthy();
    expect(event?.payload.obligation_id).toBe(obligation?.id);
    expect(event?.payload.document_id).toBe(replacement?.id);
  });

  it('refuses a second submission while the first renewal is submitted',async()=>{
    const {repo,appId,expiredId}=await institutionRepo();
    const workspace=await repo.workspace();
    const app=workspace.applications.find(item=>item.id===appId)!;
    const expired=workspace.documents.find(item=>item.id===expiredId)!;
    await repo.submitRenewal(app,expired,fileInput(),crypto.randomUUID());
    const updated=await repo.workspace();
    const again=updated.applications.find(item=>item.id===appId)!;
    const expiredAgain=updated.documents.find(item=>item.id===expiredId)!;
    await expect(repo.submitRenewal(again,expiredAgain,fileInput(),crypto.randomUUID())).rejects.toThrow(/already been submitted/);
  });

  it('refuses a non-owner actor',async()=>{
    const repo=await createDemoRepository('national_admin');
    const workspace=await repo.workspace();
    const app=workspace.applications.find(item=>item.id==='demo-app-9')!;
    const expired=workspace.documents.find(item=>item.application_id===app.id&&item.doc_type==='Fire Safety Certificate'&&item.expires_on==='2026-10-15')!;
    await expect(repo.submitRenewal(app,expired,fileInput(),crypto.randomUUID())).rejects.toThrow(/owning institution/);
  });

  it('refuses a non-approved case',async()=>{
    const repo=await createDemoRepository('institution');
    const workspace=await repo.workspace();
    const app=workspace.applications.find(item=>item.id==='demo-app-0')!;
    const expired=workspace.documents.find(item=>item.application_id===app.id&&item.doc_type==='Fire Safety Certificate'&&item.expires_on==='2026-10-15');
    if(!expired)throw new Error('Missing expired fixture.');
    await expect(repo.submitRenewal(app,expired,{documentId:expired.id,note:'Synthetic replacement note for an unapproved case.'},crypto.randomUUID())).rejects.toThrow(/approved case/);
  });
});
