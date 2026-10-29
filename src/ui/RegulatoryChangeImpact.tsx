import {useEffect,useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {type AppType,type Identity,type RegulatoryChange,RegulatoryChangeImpact,RegulatoryChangeStatus,RegulatoryChangeVersion,type Repository,type Workspace} from '../domain/model';
import {Empty,ViewHeader} from './common';
import type {Run} from './Applications';
import './intelligence.css';

const statusLabel:(status:RegulatoryChangeStatus)=>string=(s)=>s==='draft'?'Draft':s==='reviewed'?'Reviewed':s==='activated'?'Activated':'Superseded';
const statusTag:(status:RegulatoryChangeStatus)=>string=(s)=>s==='draft'?'document-tag pending':s==='reviewed'?'document-tag':s==='activated'?'document-tag clean':'document-tag';
const impactLabel:(i:string)=>string=(i)=>i==='none'?'No change':i==='minor'?'Minor':i==='major'?'Major':'None';

export function RegulatoryChangeImpact({identity,repo,run}:{identity:Identity;repo:Repository;run:Run;busy:boolean;data:Workspace}){
  const demo=repo.mode==='demo';
  const admin=identity.roles.some(role=>role.role==='national_admin');
  const [changes,setChanges]=useState<RegulatoryChange[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [version,setVersion]=useState<number|null>(null);
  const [versions,setVersions]=useState<RegulatoryChangeVersion[]>([]);
  const [impact,setImpact]=useState<RegulatoryChangeImpact|null>(null);
  const [reviewNote,setReviewNote]=useState('');
  const [activateNote,setActivateNote]=useState('');
  const [newStatement,setNewStatement]=useState('');
  const [newSummary,setNewSummary]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const change=changes.find(item=>item.id===selected)??null;
  const ver=versions.find(item=>item.version===version)??null;

  useEffect(()=>{
    void repo.getRegulatoryChanges().then(list=>setChanges(list)).catch(()=>setChanges([]));
  },[repo]);

  useEffect(()=>{
    if(!selected)return;
    void repo.getRegulatoryChangeVersions(selected).then(list=>setVersions(list)).catch(()=>setVersions([]));
  },[repo,selected]);

  useEffect(()=>{
    if(!selected||version===null)return;
    void repo.previewRegulatoryChangeImpact(selected,version).then(list=>setImpact(list)).catch(()=>setImpact(null));
  },[repo,selected,version]);

  const recordVersion=async()=>{
    if(!change)return;
    setSubmitting(true);setError(null);
    try{
      let versionResult:number|null=null;
      const ok=await run(async()=>{
        const result=await repo.recordRegulatoryChangeVersion(change.id,{
          requirement_code:change.requirement_code,requirement_app_type:change.requirement_app_type as AppType,
          clause:null,statement:newStatement.trim()||null,evidence_types:null,
          verification_method:null,is_mandatory:null,
          source_url:change.source_url,source_version:change.source_version,source_hash:change.source_hash,
          publication_date:change.publication_date,effective_date:change.effective_date,
          academic_year_start:change.academic_year_start,change_summary:newSummary.trim(),
        });
        versionResult=result.version;
      },'Regulatory change version recorded.');
      if(!ok||versionResult===null)throw new Error('Version could not be recorded.');
      const fresh=await repo.getRegulatoryChangeVersions(change.id);
      setVersions(fresh);setVersion(versionResult);setNewStatement('');setNewSummary('');
    }catch(err){
      setError(err instanceof Error?err.message:'Version could not be recorded.');
    }finally{setSubmitting(false);}
  };

  const reviewChange=async()=>{
    if(!change)return;
    setSubmitting(true);setError(null);
    try{
      await run(async()=>await repo.reviewRegulatoryChange(change.id,reviewNote.trim()),'Source review recorded.');
      const fresh=await repo.getRegulatoryChanges();
      setChanges(fresh);setReviewNote('');
    }catch(err){
      setError(err instanceof Error?err.message:'Review could not be recorded.');
    }finally{setSubmitting(false);}
  };

  const activateChange=async()=>{
    if(!change)return;
    setSubmitting(true);setError(null);
    try{
      await run(async()=>await repo.activateRegulatoryChange(change.id,activateNote.trim()),'Regulatory change activated and applied to the registry.');
      const fresh=await repo.getRegulatoryChanges();
      setChanges(fresh);setActivateNote('');
    }catch(err){
      setError(err instanceof Error?err.message:'Change could not be activated.');
    }finally{setSubmitting(false);}
  };

  const header=change?<><div className="inline"><span className="document-tag">{change.requirement_code}</span><span className={statusTag(change.status)}>{statusLabel(change.status)}</span>{change.academic_year_start&&<span className="document-tag">AY {change.academic_year_start}</span>}</div><p className="muted">{change.requirement_app_type} · {change.source_version} · {change.source_hash.slice(0,12)}…</p></> : null;

  return (
    <div>
      <ViewHeader title="Regulatory change impact" summary="Version regulatory requirements, compare changes, and map their impact on affected requirements, evidence checks, workflows and applications before activation." count={String(changes.length).padStart(2,'0')} label="regulatory changes" level="h2"/>
      <section className="dossier-paper intelligence-panel">
        {!demo&&<div className="callout warning"><strong>Connected workspace</strong><p>Regulatory change impact analysis is available in the isolated demo workspace only. This screen shows recorded changes and does not offer write actions.</p></div>}
        <div className="form-grid"><label className="field">Change<select value={selected??''} onChange={event=>{setSelected(event.target.value||null);setVersion(null);setImpact(null);}}>{changes.map(item=><option key={item.id} value={item.id}>{item.requirement_code} · v{item.latest_version} · {statusLabel(item.status)}</option>)}</select></label></div>
        {!changes.length&&<Empty title="No regulatory changes">No regulatory change records exist yet. Add one to track a versioned rule update.</Empty>}
        {change&&(
          <div>
            {header}
            {change.status==='draft'&&admin&&<div className="scope-editor"><h3>Record version</h3><p className="muted">Record a new version of this requirement, describing what changed versus the previous version.</p>
              <div className="form-grid"><label className="field">New statement<textarea value={newStatement} onChange={event=>setNewStatement(event.target.value)} rows={2} required/></label></div>
              <div className="form-grid"><label className="field">Change summary<input value={newSummary} onChange={event=>setNewSummary(event.target.value)} required/></label></div>
              <button className="button" type="button" disabled={submitting||!newStatement.trim()||!newSummary.trim()} onClick={recordVersion}>Record version</button>
            </div>}
            {version&&ver&&<div className="scope-editor"><h3>Version {ver.version} diff</h3><p className="muted">Field-level comparison against the prior version.</p>
              <div className="table-wrap"><table><caption>Field changes</caption><thead><tr><th scope="col">Field</th><th scope="col">Previous</th><th scope="col">Proposed</th></tr></thead><tbody>
                {[['clause','Clause'],['statement','Statement'],['evidence_types','Evidence types'],['verification_method','Verification method'],['is_mandatory','Mandatory']].map(([name,label])=>{
                  const old=version>1?versions.find(v=>v.version===version-1)?.[name as keyof RegulatoryChangeVersion]:null;
                  const cur=ver[name as keyof RegulatoryChangeVersion];
                  const changed=JSON.stringify(old)!==JSON.stringify(cur);
                  return changed?<tr key={name}><td>{label}</td><td>{old==null?'—':Array.isArray(old)?old.join(', '):String(old)}</td><td>{cur==null?'—':Array.isArray(cur)?cur.join(', '):String(cur)}</td></tr>:null;
                })}
              </tbody></table></div>
            </div>}
            {impact&&<div className="scope-editor"><h3>Impact analysis · version {impact.change_version}</h3><p className="muted">Requirements, evidence checks and applications affected by this change.</p>
              <div className="table-wrap"><table><caption>Affected items</caption><thead><tr><th scope="col">Target</th><th scope="col">Field</th><th scope="col">Impact</th><th scope="col">Previous value</th><th scope="col">New value</th></tr></thead><tbody>{impact.items.map(item=>{const impactClass=item.impact==='major'?'document-tag pending':item.impact==='minor'?'document-tag':'document-tag clean';return <tr key={item.subject_key}><td>{item.reference}</td><td>{item.field??'—'}</td><td><span className={impactClass}>{impactLabel(item.impact)}</span></td><td>{item.old_value??'—'}</td><td>{item.new_value??'—'}</td></tr>;})}</tbody></table></div>
            </div>}
            {change&&change.status==='draft'&&admin&&<div className="scope-editor"><h3>Source review</h3><p className="muted">Record your review of the supplied source before a preview can be generated.</p>
              <label className="field">Review explanation<textarea value={reviewNote} onChange={event=>setReviewNote(event.target.value)} rows={2} required minLength={10} maxLength={1000}/></label>
              <button className="button" type="button" disabled={submitting||reviewNote.trim().length<10} onClick={reviewChange}>Record source review</button>
            </div>}
            {change&&change.status==='reviewed'&&admin&&<div className="scope-editor"><h3>Preview &amp; activate</h3><p className="muted">Preview the impact, then activate only when authorized. Activation applies the latest version to the requirement registry.</p>
              <button className="button secondary" type="button" disabled={submitting} onClick={()=>setVersion(change.latest_version)}>Preview impact · v{change.latest_version}</button>
              {impact&&<div className="form-grid"><label className="field">Activation rationale<input value={activateNote} onChange={event=>setActivateNote(event.target.value)} required minLength={10} maxLength={1000}/></label><button className="button" type="button" disabled={submitting||activateNote.trim().length<10} onClick={activateChange}>Activate change</button></div>}
            </div>}
            {error&&<div className="callout warning" role="alert">{error}</div>}
          </div>
        )}
      </section>
      <div className="support-footnote"><ShieldCheck size={14}/>Regulatory change records are synthetic demonstration records. A source fingerprint is provenance metadata, not an authenticated signature.</div>
    </div>
  );
}
