import {useMemo,useState} from 'react';
import {Send,ShieldCheck,TimerReset} from 'lucide-react';
import {getGatewayStatus,type DispatchNotificationParams,type NotificationChannel} from '../domain/notification';
import {type Identity,type Repository,type Workspace} from '../domain/model';
import {Empty,ViewHeader} from './common';
import type {Run} from './Applications';

const KINDS:DispatchNotificationParams['kind'][]=['REMINDER','OVERDUE','ESCALATION','INFO','RETURN'];

function statusChip(status:string){
  if(status==='in_app_delivered')return 'document-tag clean';
  if(status==='pending'||status==='retry_wait')return 'document-tag pending';
  if(status==='failed'||status==='superseded'||status==='exhausted')return 'document-tag';
  return 'document-tag';
}

export function NotificationTester({data,identity,repo,run,busy}:{data:Workspace;identity?:Identity;repo:Repository;run?:Run;busy?:boolean}){
  const demoIdentity={id:'demo',name:'Demo',email:'demo@demo.in',roles:[{role:'national_admin',region:null}]};
  const identityVal=identity??demoIdentity;
  const runVal=run??(async()=>{});
  const busyVal=busy??false;
  const [appId,setAppId]=useState(data.applications[0]?.id??'');
  const [channel,setChannel]=useState<NotificationChannel>('in_app');
  const [kind,setKind]=useState<DispatchNotificationParams['kind']>('REMINDER');
  const [subject,setSubject]=useState('Synthetic test notification');
  const [body,setBody]=useState('This is a test notification dispatched from the demo workspace.');
  const [reason,setReason]=useState('');
  const [gateway,setGateway]=useState<ReturnType<typeof getGatewayStatus>|null>(null);
  useMemo(()=>{setGateway(getGatewayStatus());},[]);
  const app=data.applications.find(item=>item.id===appId);
  const canManage=Boolean(app&&app.owner_id!==identityVal.id&&identityVal.roles.some(role=>role.role==='national_admin'||(role.role==='regional_officer'&&role.region===app.region)));
  const isAdmin=identityVal.roles.some(role=>role.role==='national_admin');
  const deliveries=(data.delivery_outbox??[]).filter(item=>item.application_id===appId).sort((left,right)=>Date.parse(right.created_at)-Date.parse(left.created_at));
  const attempts=(data.delivery_attempts??[]).filter(item=>deliveries.some(d=>d.id===item.outbox_id)).sort((left,right)=>Date.parse(right.happened_at)-Date.parse(left.happened_at));
  const canQueue=Boolean(app&&canManage&&!busyVal&&reason.trim().length>=10&&subject.trim().length>=3&&body.trim().length>=5&&channel==='in_app');
  const canProcess=Boolean(app&&isAdmin&&deliveries.some(item=>item.status==='pending')&&!busyVal);
  const queue=()=>{if(!app||!canQueue)return;void runVal(()=>repo.operationsCommand('outbox_queue',app.id,{channel,kind,subject,body,note:reason.trim()},app.version).then(()=>{}),'Notification queued to the durable outbox.');setReason('');};
  const process=()=>{if(!app||!canProcess)return;void runVal(()=>repo.operationsCommand('process_demo',app.id,{note:'Process pending delivery intents.'},app.version).then(()=>{}),'Pending deliveries processed.');};
  const retry=(id:string)=>{if(!app||busyVal)return;void runVal(()=>repo.operationsCommand('outbox_retry',id,{note:'Retry eligible intent.'},app.version).then(()=>{}),'Delivery intent retried.');};
  const cancel=(id:string)=>{if(!app||busyVal)return;void runVal(()=>repo.operationsCommand('outbox_cancel',id,{note:'Cancel intent.'},app.version).then(()=>{}),'Delivery intent cancelled.');};
  return (
    <section className="page-stack">
      <ViewHeader title="Notification outbox" summary="Durable notification delivery: queue source-bound intents, process them as the national administrator, retry or cancel pending intents. Every state change is audited." count={String(deliveries.length).padStart(2,'0')} label="delivery intents"/>
      {!app&&<Empty title="No application">Choose an application to queue notifications for.</Empty>}
      {app&&<>
        <div className="spread"><div><h2>Gateway state</h2><p className="muted">Email and SMS report simulated until a live gateway is configured. Voice is always simulated. In-app is recorded immediately when processed.</p></div><span className="quiet-label">{gateway?.emailConfigured?'Email configured · ':'Email not configured · '}{gateway?.smsConfigured?'SMS configured':'SMS not configured'} · Voice simulated</span></div>
        <label className="field">Application<select value={appId} onChange={event=>setAppId(event.target.value)}>{data.applications.map(item=><option key={item.id} value={item.id}>{item.ref_no} · {item.region}</option>)}</select></label>
        <label className="field">Channel<select value={channel} onChange={event=>setChannel(event.target.value as NotificationChannel)}><option value="in_app">In-app notification</option></select></label>
        <label className="field">Kind<select value={kind} onChange={event=>setKind(event.target.value as DispatchNotificationParams['kind'])}>{KINDS.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
        <label className="field">Subject<input value={subject} onChange={event=>setSubject(event.target.value)} maxLength={200}/></label>
        <label className="field">Body<textarea value={body} onChange={event=>setBody(event.target.value)} rows={3} maxLength={2000}/></label>
        <label className="field">Operational reason<textarea value={reason} onChange={event=>setReason(event.target.value)} minLength={10} maxLength={2000} required/></label>
        <div className="form-actions"><button className="button" type="button" onClick={queue} disabled={busyVal||!canQueue}><Send size={14}/>Queue to outbox</button>{isAdmin&&<button className="button secondary" type="button" onClick={process} disabled={busyVal||!canProcess}><TimerReset size={14}/>Process pending intents</button>}</div>
        {app.owner_id===identityVal.id&&canManage===false&&<p className="muted">Queueing is restricted to national_admin or a regional_officer grant in this application's region who is not the owner.</p>}
        <div className="table-wrap" role="region" aria-label="Delivery outbox" tabIndex={0}><table><caption>Delivery intents for {app.ref_no}</caption><thead><tr><th scope="col">Generation</th><th scope="col">Channel</th><th scope="col">Actual state</th><th scope="col">Attempts</th><th scope="col">Last detail</th><th scope="col">Management</th></tr></thead><tbody>{deliveries.length?deliveries.map(item=><tr key={item.id}><td>{item.generation} · {item.channel.replaceAll('_',' ')}</td><td>{item.channel.replaceAll('_',' ')}</td><td><span className={statusChip(item.status)}>{item.status.replaceAll('_',' ')}{item.accepted_at&&<span className="mono"> · accepted</span>}</span></td><td>{item.attempts}</td><td>{item.last_error??'No transport outcome recorded'}</td><td><div className="form-actions">{item.status==='pending'&&<button className="button secondary small button-small" type="button" onClick={()=>retry(item.id)} disabled={busyVal}>Retry</button>}{item.status!=='ambiguous'&&<button className="button text small button-small" type="button" onClick={()=>cancel(item.id)} disabled={busyVal}>Cancel</button>}</div></td></tr>):<tr><td colSpan={6} className="muted">No delivery intents for this application.</td></tr>}</tbody></table></div>
        <div className="table-wrap" role="region" aria-label="Delivery attempt history" tabIndex={0}><table><caption>Immutable delivery attempt history</caption><thead><tr><th scope="col">Attempt</th><th scope="col">Intent</th><th scope="col">State</th><th scope="col">Detail</th><th scope="col">Happened at</th></tr></thead><tbody>{attempts.length?attempts.map(item=>{const delivery=deliveries.find(d=>d.id===item.outbox_id);return <tr key={item.id}><td>Attempt {item.attempt}</td><td>{delivery?.generation??'—'}</td><td>{item.state.replaceAll('_',' ')}</td><td>{item.detail}</td><td><span className="mono">{new Date(item.happened_at).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></td></tr>;}):<tr><td colSpan={5} className="muted">No attempts recorded.</td></tr>}</tbody></table></div>
        <p className="support-footnote"><ShieldCheck size={14}/>Every queue, process, retry and cancel is recorded in the case audit trail. In-app delivery is recorded when processed; email/SMS/voice report simulated until a gateway is configured.</p>
      </>}
    </section>
  );
}
