import { useState } from 'react';
import { Send, ShieldCheck } from 'lucide-react';
import type { DispatchNotificationParams, DispatchNotificationResult, GatewayStatus, NotificationChannel } from '../domain/notification';
import { getGatewayStatus } from '../domain/notification';
import type { Repository } from '../domain/model';

const KINDS: {kind:'REMINDER'|'OVERDUE'|'ESCALATION'|'INFO'|'RETURN';label:string}[]=[
  {kind:'REMINDER',label:'Reminder'},
  {kind:'OVERDUE',label:'Overdue'},
  {kind:'ESCALATION',label:'Escalation'},
  {kind:'INFO',label:'Information'},
  {kind:'RETURN',label:'Return / correction'},
];
const CHANNELS: NotificationChannel[]=['in_app','email','sms'];

export function NotificationTester({repo}:{repo:Repository}){
  const [gateway, setGateway] = useState<GatewayStatus|null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DispatchNotificationResult|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [form, setForm] = useState<DispatchNotificationParams>({
    channel:['in_app'],
    kind:'REMINDER',
    subject:'Synthetic test notification',
    body:'This is a test notification dispatched from the demo workspace.',
  });

  async function loadGateway(){
    setGateway(getGatewayStatus());
  }

  async function handleSubmit(e:React.FormEvent){
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try{
      const identity = await repo.identity();
      if(!identity) throw new Error('No authenticated identity.');
      const params:DispatchNotificationParams={
        ...form,
        kind:form.kind as 'REMINDER'|'OVERDUE'|'ESCALATION'|'INFO'|'RETURN',
      };
      const out = await repo.dispatchNotification(params);
      setResult(out);
    }catch(err){
      setError(err instanceof Error?err.message:'Dispatch failed.');
    }finally{
      setLoading(false);
    }
  }

  const attemptStatusColor=(status:string)=>{
    switch(status){
      case 'delivered': return 'badge success';
      case 'sent_sandbox': return 'badge info';
      case 'simulated': return 'badge warning';
      case 'failed': return 'badge danger';
      default: return 'badge';
    }
  };

  return (
    <section className="support-surface" aria-label="Live notification dispatcher">
      <div className="support-surface-heading">
        <div>
          <h2>Live notification dispatcher</h2>
          <p>Dispatch a synthetic test notification through each channel and observe the honest delivery state. Nothing is sent to a real channel unless a gateway is explicitly configured.</p>
        </div>
        <span className="quiet-label"><ShieldCheck size={14}/>{gateway?.emailConfigured?'Email configured · ':'Email not configured · '}{gateway?.smsConfigured?'SMS configured':'SMS not configured'}</span>
      </div>
      <div className="demo-notification-gateway">
        <span className="demo-notification-gateway-label">Gateway state</span>
        <span className={`demo-notification-gateway-chip ${gateway?.emailConfigured?'demo-notification-gateway-configured':'demo-notification-gateway-unconfigured'}`}>
          Email: {gateway?.emailGateway??'—'}
        </span>
        <span className={`demo-notification-gateway-chip ${gateway?.smsConfigured?'demo-notification-gateway-configured':'demo-notification-gateway-unconfigured'}`}>
          SMS: {gateway?.smsGateway??'—'}
        </span>
        {!gateway?.emailConfigured&&!gateway?.smsConfigured&&<span className="demo-notification-gateway-note">All channels will report simulated until a gateway is configured.</span>}
      </div>
      <form onSubmit={handleSubmit} className="demo-notification-form">
        <div className="form-grid">
          <label className="field">Target<small>Defaults to the application owner.</small>
            <select className="field-input" value={form.targetType||'institution'} onChange={e=>setForm({...form,targetType:e.target.value as 'institution'|'user'})}>
              <option value="institution">Application owner (institution)</option>
              <option value="user">Specific user</option>
            </select>
          </label>
          {form.targetType==='user'&&(
            <>
              <label className="field">Target user id
                <input className="field-input" type="text" value={form.targetId??''} onChange={e=>setForm({...form,targetId:e.target.value})} placeholder="User id"/>
              </label>
            </>
          )}
          <label className="field">Channel
            <select className="field-input" value={form.channel?.[0]??'in_app'} onChange={e=>setForm({...form,channel:[e.target.value as NotificationChannel]})}>
              {CHANNELS.map(c=><option key={c} value={c}>{c.replace('_',' ')}</option>)}
            </select>
          </label>
          <label className="field">Kind
            <select className="field-input" value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as 'REMINDER'|'OVERDUE'|'ESCALATION'|'INFO'|'RETURN'})}>
              {KINDS.map(k=><option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
          </label>
          <label className="field">Subject
            <input className="field-input" type="text" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} maxLength={200}/>
          </label>
          <label className="field">Body
            <textarea className="field-input" value={form.body} onChange={e=>setForm({...form,body:e.target.value})} rows={3} maxLength={2000}/>
          </label>
        </div>
        <div className="form-actions">
          <button className="button" type="submit" disabled={loading}><Send size={14}/>{loading?'Dispatching…':'Dispatch test notification'}</button>
          <button className="button outline" type="button" onClick={()=>loadGateway()} disabled={loading}>Refresh gateway state</button>
        </div>
      </form>
      {error&&<p className="callout warning" role="alert">{error}</p>}
      {result&&(
        <section className="demo-notification-result" aria-label="Dispatch result">
          <h3>Dispatch result</h3>
          <p><strong>Notification id:</strong> {result.notificationId}<span className="demo-notification-gateway-note"> · Gateway: {result.gateway.emailGateway} / {result.gateway.smsGateway}</span></p>
          <ul className="demo-notification-attempts">
            {result.attempts.map((a,index)=>(
              <li key={index} className="demo-notification-attempt">
                <span className={`demo-notification-attempt-chip ${attemptStatusColor(a.status)}`}>{a.channel}</span>
                <span className="demo-notification-attempt-status">{a.status}</span>
                {a.previewUrl&&<a className="demo-notification-attempt-preview" href={a.previewUrl} target="_blank" rel="noopener noreferrer">Preview</a>}
                {a.detail&&<span className="demo-notification-attempt-detail">{a.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
