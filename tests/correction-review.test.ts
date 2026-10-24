import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {as,database,draft,failure,ids,readyClaims,scalar,upload} from './database';
import type {AuditEvent} from '../src/domain/model';
import type {HistoryPage} from '../src/domain/review';
import {reviewTimeline,replayClaimState,historyCoverage} from '../src/domain/review';

let db:PGlite;
beforeAll(async()=>{db=await database();},60000);
afterAll(async()=>db?.close());
beforeEach(async()=>db.exec('begin'));
afterEach(async()=>db.exec('reset role; rollback'));
const version=(app:string)=>scalar<number>(db,'select version from public.applications where id=$1',[app]);
async function command(app:string,resource:string,action:string,payload:Record<string,unknown>,expected?:number,request=crypto.randomUUID()){
  return scalar(db,'select fp_private.review_command($1,$2,$3,$4,$5)',[resource,action,payload,expected??await version(app),request]);
}
const verify=(app:string,claim:string)=>command(app,claim,'verify_claim',{result:'verified',note:'Synthetic evidence reviewed against its exact version.'});
// Use explicit command payloads below so stale/duplicate requests remain visible in each regression.
async function requestCorrection(app:string,claim:string){
  const result=await command(app,claim,'raise_deficiency',{observation:'Please correct the synthetic certificate.',remedy:'Provide corrected current synthetic evidence.',due:new Date(Date.now()+86400000).toISOString()}) as {id:string};return result.id;
}
const row=(claim:string)=>scalar<Record<string,unknown>>(db,'select to_jsonb(c) from public.application_claims c where id=$1',[claim]);
async function currentBasis(app:string,claim:string){const page=await scalar<HistoryPage>(db,'select public.fp_case_history($1,0,null,200)',[app]);const snapshot=page.events.at(-1)?.payload.review_snapshot as {claims:(Record<string,unknown>)[]};return snapshot.claims.find(item=>item.id===claim)?.basis_current;}

describe('correction review boundary',()=>{
  it('preserves the original review and both responses, while unrelated review bases stay unchanged',async()=>{
    const {id,claims,docs}=await readyClaims(db);
    await verify(id,claims.INSTITUTION_IDENTITY);await verify(id,claims.FIRE_SAFETY);
    const original=await row(claims.FIRE_SAFETY),unrelated=await row(claims.INSTITUTION_IDENTITY);
    const deficiency=await requestCorrection(id,claims.FIRE_SAFETY);
    const replacement=await upload(db,id,'Fire Safety Certificate','fa'.repeat(32));
    await command(id,deficiency,'resolve_deficiency',{evidence:replacement,note:'First response with the synthetic replacement.'});
    await as(db,ids.scrutiny);
    await command(id,deficiency,'recheck_deficiency',{result:'reopened',note:'Clarify the synthetic certificate registration.'});
    await as(db,ids.institution);
    await command(id,deficiency,'resolve_deficiency',{evidence:replacement,note:'Second response clarifies the registration.'});
    expect(await scalar(db,'select response_revision from public.deficiencies where id=$1',[deficiency])).toBe(2);
    expect(await scalar(db,'select rechecked_at from public.deficiencies where id=$1',[deficiency])).toBeNull();
    await as(db,ids.scrutiny);
    await command(id,deficiency,'recheck_deficiency',{result:'accepted',note:'The clarified replacement response is accepted.'});
    expect(await row(claims.INSTITUTION_IDENTITY)).toEqual(unrelated);
    const page=await scalar<HistoryPage>(db,'select public.fp_case_history($1,0,null,200)',[id]);
    const responses=page.events.filter(event=>event.action==='deficiency_resolved');
    expect(responses).toHaveLength(2);
    expect(responses[0].payload.review_snapshot).toMatchObject({deficiencies:[{response_revision:1,resolution_note:'First response with the synthetic replacement.'}]});
    expect(responses[1].payload.review_snapshot).toMatchObject({deficiencies:[{response_revision:2,rechecked_at:null}]});
    const firstReview=page.events.find(event=>event.action==='claim_verified'&&event.payload.claim_id===claims.FIRE_SAFETY)!;
    expect(JSON.stringify(firstReview.payload.review_snapshot)).toContain(docs['Fire Safety Certificate']);
    expect((firstReview.payload.review_snapshot as {claims:Record<string,unknown>[]}).claims.find(claim=>claim.id===claims.FIRE_SAFETY)?.verification_basis).toEqual(original.verification_basis);
    const entries=reviewTimeline(page.events),firstIndex=entries.findIndex(entry=>entry.sequence===firstReview.sequence);
    expect(replayClaimState([],entries,firstIndex)?.statuses[claims.FIRE_SAFETY]).toBe('verified');
    expect(await currentBasis(id,claims.FIRE_SAFETY)).toBe(true);
    expect(await scalar<{intact:boolean}>(db,'select public.fp_verify_audit_chain($1)',[id])).toMatchObject({intact:true});
    expect(historyCoverage({events:page.events,through:page.through,head_hash:page.head_hash,complete:page.complete}).complete).toBe(true);
    expect(JSON.stringify(page.events)).not.toContain('file_path');
  });

  it('invalidates an actual link-set change only on its claim, and a repeated identical link preserves its review',async()=>{
    const {id,claims,docs,extraDocuments}=await readyClaims(db,['Fire Safety Certificate']);
    await verify(id,claims.INSTITUTION_IDENTITY);await verify(id,claims.FIRE_SAFETY);
    const unrelated=await row(claims.INSTITUTION_IDENTITY);
    await command(id,claims.FIRE_SAFETY,'link_claim_evidence',{document:docs['Fire Safety Certificate'],note:'Same evidence; a new explanatory note.'});
    expect((await row(claims.FIRE_SAFETY)).status).toBe('verified');
    await command(id,claims.FIRE_SAFETY,'link_claim_evidence',{document:extraDocuments[0],note:'New evidence must require another review.'});
    expect((await row(claims.FIRE_SAFETY)).status).toBe('unverified');
    expect(await row(claims.INSTITUTION_IDENTITY)).toEqual(unrelated);
    expect(await currentBasis(id,claims.FIRE_SAFETY)).toBe(false);
    await verify(id,claims.FIRE_SAFETY);
    expect(await currentBasis(id,claims.FIRE_SAFETY)).toBe(true);
  });

  it('rejects an expired response itself, even while a different linked certificate is valid',async()=>{
    const {id,claims,extraDocuments}=await readyClaims(db,['Fire Safety Certificate']);
    const deficiency=await requestCorrection(id,claims.FIRE_SAFETY);
    await as(db,ids.institution);await command(id,deficiency,'resolve_deficiency',{evidence:extraDocuments[0],note:'The renewal is submitted for human review.'});
    await db.exec('reset role');await db.query("update public.application_documents set expires_on=current_date-1 where id=$1",[extraDocuments[0]]);
    await as(db,ids.scrutiny);
    expect(await failure(db,"select fp_private.review_command($1,'recheck_deficiency',$2,$3,$4)",[deficiency,{result:'accepted',note:'Another certificate must not stand in for this response.'},await version(id),crypto.randomUUID()])).toContain('response evidence');
    expect(await failure(db,"select fp_private.review_command($1,'verify_claim',$2,$3,$4)",[claims.FIRE_SAFETY,{result:'verified',note:'Direct verification must not bypass pending recheck.'},await version(id),crypto.randomUUID()])).toContain('re-check');
  });

  it('uses version checks, duplicate-request receipts and live permissions',async()=>{
    const {id,claims}=await readyClaims(db);const before=await version(id),request=crypto.randomUUID();
    const payload={result:'verified',note:'A version-bound synthetic review command.'};
    await command(id,claims.INSTITUTION_IDENTITY,'verify_claim',payload,before,request);
    const count=await scalar<number>(db,'select count(*)::int from public.application_events where application_id=$1',[id]);
    await command(id,claims.INSTITUTION_IDENTITY,'verify_claim',payload,before,request);
    expect(await scalar(db,'select count(*)::int from public.application_events where application_id=$1',[id])).toBe(count);
    expect(await failure(db,"select fp_private.review_command($1,'verify_claim',$2,$3,$4)",[claims.INSTITUTION_IDENTITY,{...payload,note:'Changed request body.'},before,request])).toContain('different input');
    expect(await failure(db,"select fp_private.review_command($1,'verify_claim',$2,$3,$4)",[claims.INSTITUTION_IDENTITY,payload,before,crypto.randomUUID()])).toContain('reload');
    await as(db,ids.admin);await db.query("select public.fp_revoke_role($1,'scrutiny_officer','Synthetic reviewer access was revoked.')",[ids.scrutiny]);
    await as(db,ids.scrutiny);
    expect(await failure(db,"select fp_private.review_command($1,'verify_claim',$2,$3,$4)",[claims.INSTITUTION_IDENTITY,payload,before,request])).toMatch(/unavailable|required/);
  });

  it('rolls back the projection and case version if event insertion fails',async()=>{
    const {id,claims}=await readyClaims(db);const before=await row(claims.INSTITUTION_IDENTITY),revision=await version(id);
    await db.exec(`reset role; create function public.reject_test_review_event() returns trigger language plpgsql as $$ begin raise exception 'Synthetic event insertion failed'; end $$;
      create trigger reject_test_review_event before insert on public.application_events for each row when (new.action='claim_verified') execute function public.reject_test_review_event();`);
    await as(db,ids.scrutiny);
    expect(await failure(db,"select fp_private.review_command($1,'verify_claim',$2,$3,$4)",[claims.INSTITUTION_IDENTITY,{result:'verified',note:'This projection must roll back.'},revision,crypto.randomUUID()])).toContain('Synthetic event');
    expect(await row(claims.INSTITUTION_IDENTITY)).toEqual(before);expect(await version(id)).toBe(revision);
  });

  it('invalidates configured input dependencies while preserving unrelated reviews and pinned requirements',async()=>{
    const {id,claims}=await readyClaims(db);await verify(id,claims.INSTITUTION_IDENTITY);await verify(id,claims.FACULTY_STRENGTH);await verify(id,claims.STUDENT_FACULTY_RATIO);
    const unrelated=await row(claims.INSTITUTION_IDENTITY),ratio=await row(claims.STUDENT_FACULTY_RATIO);
    await db.exec('reset role');await db.query(`update public.applications set form_data=form_data||'{"academic_year":"2027-28"}' where id=$1`,[id]);
    expect((await row(claims.STUDENT_FACULTY_RATIO)).verification_basis).toEqual(ratio.verification_basis);
    expect((await row(claims.STUDENT_FACULTY_RATIO)).status).toBe('verified');
    await db.query(`update public.applications set form_data=form_data||'{"faculty_count":"30"}' where id=$1`,[id]);
    expect((await row(claims.STUDENT_FACULTY_RATIO)).status).toBe('unverified');expect((await row(claims.FACULTY_STRENGTH)).status).toBe('unverified');
    expect(await row(claims.INSTITUTION_IDENTITY)).toEqual(unrelated);
    await db.query('update public.requirements set is_mandatory=false,version=99 where id=(select requirement_id from public.application_claims where id=$1)',[claims.FIRE_SAFETY]);
    expect(await row(claims.FIRE_SAFETY)).toMatchObject({requirement_version_snapshot:1,is_mandatory_snapshot:true});
  });

  it('requires reconsideration of a not-applicable exemption after its scoped evidence changes',async()=>{
    const {id,claims,extraDocuments}=await readyClaims(db,['Fire Safety Certificate']);
    await command(id,claims.FIRE_SAFETY,'verify_claim',{result:'not_applicable',note:'Synthetic exemption explicitly recorded by the reviewer.'});
    await command(id,claims.FIRE_SAFETY,'link_claim_evidence',{document:extraDocuments[0],note:'Additional evidence changes the recorded applicability basis.'});
    expect((await row(claims.FIRE_SAFETY)).status).toBe('unverified');
  });

  it('pages a complete case history beyond the old global 500-event limit and keeps a captured checkpoint',async()=>{
    const {id}=await readyClaims(db);await db.exec('reset role');
    await db.query(`do $$ begin for i in 1..505 loop perform fp_private.append_event('${id}',null,'system','synthetic_history_probe',null,null,null,'{}'); end loop; end $$;`);
    await as(db,ids.institution);
    let after=0,through:number|null=null,head:string|null=null;const events:AuditEvent[]=[];
    for(let page=0;page<10;page++){
      const result=await scalar<HistoryPage>(db,'select public.fp_case_history($1,$2,$3,100)',[id,after,through]);
      through??=result.through;head??=result.head_hash;events.push(...result.events);after=result.next_after;
      if(result.complete)break;
    }
    expect(events.length).toBeGreaterThan(500);expect(events.every((event,index)=>event.sequence===index+1)).toBe(true);expect(after).toBe(through);
    await db.exec('reset role');await db.query("select fp_private.append_event($1,null,'system','later_event',null,null,null,'{}')",[id]);
    await as(db,ids.institution);const tail=await scalar<HistoryPage>(db,'select public.fp_case_history($1,$2,$3,100)',[id,after,through]);
    expect(tail.events).toHaveLength(0);expect(tail.head_hash).toBe(head);
    await as(db,ids.other);expect(await failure(db,'select public.fp_case_history($1,0,null,100)',[id])).toContain('unavailable');
  },30000);

  it('atomically saves wizard fields and leaves no draft behind when validation fails',async()=>{
    await draft(db);const id=await scalar<string>(db,"select public.fp_create_application_draft('new_programme','Synthetic saved intake draft','{\"intake\":\"120\"}')");
    expect(await scalar(db,"select form_data->>'intake' from public.applications where id=$1",[id])).toBe('120');
    const before=await scalar(db,'select count(*)::int from public.applications');
    expect(await failure(db,"select public.fp_create_application_draft('new_programme','Invalid synthetic intake draft','{\"intake\":\"-1\"}')")).toContain('positive');
    expect(await failure(db,"select public.fp_create_application_draft('new_programme','Invalid synthetic field draft','{\"owner_id\":\"forged\"}')")).toContain('Unknown field');
    expect(await scalar(db,'select count(*)::int from public.applications')).toBe(before);
  });

  it('retires unversioned mutation endpoints and does not expose snapshot helpers',async()=>{
    const {claims}=await readyClaims(db);
    expect(await failure(db,"select public.fp_verify_claim($1,'verified','Unversioned requests are unavailable.')",[claims.INSTITUTION_IDENTITY])).toContain('permission denied');
    expect(await failure(db,'select fp_private.review_snapshot($1)',[claims.INSTITUTION_IDENTITY])).toContain('permission denied');
  });
});
