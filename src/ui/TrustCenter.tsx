import {useState} from 'react';
import {Activity,AlertTriangle,CheckCircle2,Clock3,FileCheck2,Fingerprint,LockKeyhole,Play,ShieldCheck,ShieldX} from 'lucide-react';
import {daysUntil,roleLabels,type DocumentRecord,type Identity,type Repository,type Workspace} from '../domain/model';
import type {AuditVerification} from '../domain/integrity';
import type {Run} from './Applications';
import {Panel,ViewHeader} from './common';

function roleLabel(role:string){return roleLabels[role as keyof typeof roleLabels]??role.replaceAll('_',' ');}
function shortHash(value:string|null){return value?`${value.slice(0,10)}...${value.slice(-6)}`:'Not available';}
function dateLabel(value:string|null|undefined){return value?new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'No expiry';}

export function TrustCenter({data,identity,repo,run,busy}:{data:Workspace;identity:Identity;repo:Repository;run:Run;busy:boolean}){
  const [verification,setVerification]=useState<AuditVerification|null>(null);
  const [replayResult,setReplayResult]=useState<AuditVerification|null>(null);
  const now=Date.now();
  const reference=data.applications.find(a=>a.ref_no==='DEMO-2026-1001')??data.applications[0];
  const activeGrants=data.access_assignments.filter(g=>g.active&&!g.revoked_at&&(!g.expires_at||Date.parse(g.expires_at)>now));
  const expiringGrants=activeGrants.filter(g=>{const days=daysUntil(g.expires_at,now);return days!==null&&days<=7;});
  const revokedGrants=data.access_assignments.filter(g=>!g.active||g.revoked_at);
  const today=new Date(now).toISOString().slice(0,10);
  const expiredDocuments=data.documents.filter(d=>d.expires_on&&d.expires_on<today);
  const hashGroups=new Map<string,DocumentRecord[]>();
  for(const doc of data.documents){if(!doc.sha256)continue;hashGroups.set(doc.sha256,[...(hashGroups.get(doc.sha256)??[]),doc]);}
  const duplicateGroups=[...hashGroups.values()].filter(group=>group.length>1);
  const pendingScans=data.documents.filter(d=>d.scan_status==='pending');
  const openSignals=data.integrity_signals.filter(s=>s.disposition==='open');
  const enabledAgents=data.agents.filter(a=>a.enabled);
  const approvalAgents=data.agents.filter(a=>a.can_approve);
  const canReplay=repo.mode==='demo'&&identity.roles.some(r=>r.role!=='institution');
  const verify=()=>{if(!reference)return;void run(async()=>{setVerification(await repo.verifyAudit(reference));},`Record ${reference.ref_no} verified.`);};
  const replay=()=>{if(!reference)return;void run(async()=>{setReplayResult(await repo.tamperReplay(reference));},'Tamper replay completed on an isolated copy.');};
  const chainOk=verification?.intact===true;

  return <>
    <ViewHeader index="11" title="Trust Center" summary="Four inspectable boundaries: the record, its evidence, human access, and the agent boundary. No combined trust score." count={String(openSignals.length)} label="open integrity signals"/>
    <div className="trust-grid">
      <Panel className="trust-panel" title="Record integrity" subtitle="Hash-chain verification for a submitted dossier." action={<Fingerprint size={19}/>}>
        <div className="trust-reference">
          <div><span className="quiet-label">REFERENCE RECORD</span><strong>{reference?.ref_no??'No visible record'}</strong><small>{reference?.title??'A submitted record is required for verification.'}</small></div>
          <button className="button outline" disabled={!reference||busy} onClick={verify}><ShieldCheck size={15}/>{busy?'Checking...':'Verify chain'}</button>
        </div>
        <div className={`trust-chain-status ${verification?(chainOk?'ok':'broken'):'idle'}`} role="status">
          {verification?verification.intact?<CheckCircle2 size={22}/>:<ShieldX size={22}/>:<Fingerprint size={22}/>}
          <div>
            <strong>{verification?verification.intact?'Chain verified. Event history intact.':`Integrity mismatch detected at event ${verification.broken_at??'unknown'}`:'Not checked in this view'}</strong>
            <p>{verification?`${verification.checked} chained events checked. Head ${shortHash(verification.head)}.`:'Runs the same canonical payload and SHA-256 verifier used by the audit register.'}</p>
          </div>
        </div>
      </Panel>

      <Panel className="trust-panel" title="Evidence integrity" subtitle="Counts are derived from the visible workspace." action={<FileCheck2 size={19}/>}>
        <div className="trust-metrics">
          <div className={`trust-metric ${expiredDocuments.length?'warning':'ok'}`}><strong>{expiredDocuments.length}</strong><span>Expired documents</span></div>
          <div className={`trust-metric ${duplicateGroups.length?'warning':'ok'}`}><strong>{duplicateGroups.length}</strong><span>Duplicate hash groups</span></div>
          <div className={`trust-metric ${pendingScans.length?'warning':'ok'}`}><strong>{pendingScans.length}</strong><span>Pending scans</span></div>
          <div className={`trust-metric ${openSignals.length?'warning':'ok'}`}><strong>{openSignals.length}</strong><span>Open signals</span></div>
        </div>
        <div className="trust-findings">
          {expiredDocuments.slice(0,2).map(doc=><div key={doc.id}><AlertTriangle size={15}/><span><strong>{doc.doc_type}</strong><small>Expired {dateLabel(doc.expires_on)}</small></span></div>)}
          {duplicateGroups.slice(0,1).map(group=><div key={group[0]?.sha256}><AlertTriangle size={15}/><span><strong>{group[0]?.doc_type??'Evidence'}</strong><small>{group.length} records share hash {shortHash(group[0]?.sha256??null)}</small></span></div>)}
          {!expiredDocuments.length&&!duplicateGroups.length&&<div><CheckCircle2 size={15}/><span><strong>No expired or duplicate evidence</strong><small>Clean does not mean approved; human checks still apply.</small></span></div>}
        </div>
      </Panel>

      <Panel className="trust-panel" title="Access ledger" subtitle="Active grants, expiry, and revocation from assigned roles." action={<LockKeyhole size={19}/>}>
        <div className="trust-access-summary">
          <span><strong>{activeGrants.length}</strong> active</span>
          <span className={expiringGrants.length?'warning':''}><Clock3 size={14}/>{expiringGrants.length} expiring within 7 days</span>
          <span>{revokedGrants.length} revoked</span>
        </div>
        <ul className="trust-ledger">
          {data.access_assignments.map(grant=>{
            const expired=grant.expires_at?Date.parse(grant.expires_at)<=now:false;
            const isActive=grant.active&&!grant.revoked_at&&!expired;
            return <li key={`${grant.user_id}-${grant.role}-${grant.region??'national'}`}>
              <span className={`trust-dot ${isActive?'ok':'off'}`}/>
              <div><strong>{grant.user_id}</strong><small>{roleLabel(grant.role)}{grant.role==='institution'?'':grant.region?` · ${grant.region}`:' · National'} · {isActive?grant.expires_at?`expires ${dateLabel(grant.expires_at)}`:'no expiry':grant.revoked_at?'revoked':'expired'}</small></div>
            </li>;
          })}
        </ul>
        {!data.access_assignments.length&&<p className="trust-empty">No access assignments are visible in this workspace.</p>}
      </Panel>

      <Panel className="trust-panel" title="Agent boundary" subtitle="Advisory automation is read-only and cannot approve." action={<Activity size={19}/>}>
        <div className="trust-agent-summary"><span>{data.agents.length} registered</span><span>{enabledAgents.length} enabled</span><span className={approvalAgents.length?'warning':''}>{approvalAgents.length} with approval authority</span></div>
        <div className="trust-agents">
          {data.agents.map(agent=><article key={agent.id} className="trust-agent">
            <div className="spread"><strong>{agent.name}</strong><span className={`trust-pill ${agent.enabled?'ok':'off'}`}>{agent.enabled?'Enabled':'Disabled'}</span></div>
            <p>{agent.purpose}</p>
            <div className="trust-scopes">{agent.scopes.map(scope=><span key={scope}>{scope}</span>)}</div>
            <small>{agent.can_approve?'Can approve':'Cannot approve'} · {agent.last_run_at?`Last run ${dateLabel(agent.last_run_at)}`:'Never run'}</small>
          </article>)}
        </div>
        {!data.agents.length&&<p className="trust-empty">No agents are registered in this workspace.</p>}
      </Panel>

      <Panel className="trust-panel trust-replay" title="Tamper replay" subtitle="Demonstration only. Runs on a copy and never mutates the workspace." action={<Play size={19}/>}>
        <div className="trust-replay-body">
          <div>
            <strong>{repo.mode==='demo'?'Test the verifier against a deliberately altered event.':'Tamper replay is available in the synthetic demo workspace.'}</strong>
            <p>{replayResult?(replayResult.intact?'Replay returned an intact chain. That is unexpected for a tampered copy.':`Replay detected the alteration at event ${replayResult.broken_at}. The live record was not changed.`):'The verifier must fail closed when history is edited. Replay proves the check can fail, not just pass.'}</p>
          </div>
          <button className="button outline" disabled={!reference||busy||!canReplay} onClick={replay}><ShieldX size={15}/>{busy?'Replaying...':'Run tamper replay'}</button>
        </div>
        {!canReplay&&<p className="trust-empty">{repo.mode==='demo'?'Sign in with a reviewer role to run replay.':'Switch to the demo workspace to run this check.'}</p>}
      </Panel>
    </div>
  </>;
}
