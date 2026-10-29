export type NotificationChannel='in_app'|'email'|'sms'|'voice';
export type DeliveryStatus='queued'|'delivered'|'sent_sandbox'|'simulated'|'failed';

export interface GatewayStatus {
  emailGateway:'RESEND_LIVE'|'SMTP_LIVE'|'ETHEREAL_SANDBOX'|'SIMULATED';
  smsGateway:'FAST2SMS_LIVE'|'TWILIO_LIVE'|'SIMULATED';
  voiceGateway:'SIMULATED';
  emailConfigured:boolean;
  smsConfigured:boolean;
}

export interface DispatchNotificationParams {
  targetType?:'institution'|'user';
  targetId?:string;
  toUserId?:string;
  toInstitutionId?:string;
  channel?:NotificationChannel[];
  kind:'REMINDER'|'OVERDUE'|'ESCALATION'|'INFO'|'RETURN';
  subject:string;
  body:string;
  deadlineItemId?:string;
  applicationId?:string;
}

export interface DispatchNotificationAttempt {
  channel:NotificationChannel;
  status:DeliveryStatus;
  previewUrl?:string;
  error?:string;
  detail?:string;
}

export interface DispatchNotificationResult {
  notificationId:string;
  gateway:GatewayStatus;
  attempts:DispatchNotificationAttempt[];
}

const EMAIL_TIMEOUT_MS=3000;
const SMS_TIMEOUT_MS=3000;

function withTimeout<T>(promise:Promise<T>,ms:number):Promise<T>{
  let timer:ReturnType<typeof setTimeout>;
  const timeout=new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Dispatch timeout')),ms);});
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}

export function getGatewayStatus():GatewayStatus{
  const resendKey=import.meta.env.VITE_RESEND_API_KEY;
  const smtpHost=import.meta.env.VITE_SMTP_HOST;
  const fast2smsKey=import.meta.env.VITE_FAST2SMS_API_KEY;
  const twilioSid=import.meta.env.VITE_TWILIO_ACCOUNT_SID;
  return {
    emailGateway:resendKey?'RESEND_LIVE':smtpHost?'SMTP_LIVE':'ETHEREAL_SANDBOX',
    smsGateway:fast2smsKey?'FAST2SMS_LIVE':twilioSid?'TWILIO_LIVE':'SIMULATED',
    voiceGateway:'SIMULATED',
    emailConfigured:Boolean(resendKey||smtpHost),
    smsConfigured:Boolean(fast2smsKey||twilioSid),
  };
}

export function buildHtmlEmail(subject:string,body:string,kind:string):string{
  const badgeColor=
    kind==='ESCALATION'?'#9d174d; background: #fce7f3':
    kind==='OVERDUE'?'#991b1b; background: #fee2e2':'#92400e; background: #fef3c7';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0dfd5; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #183227; padding: 20px 24px; color: #fbfbf9;">
        <p style="margin: 0; font-size: 12px; color: #a3b899;">Clauseway synthetic prototype</p>
        <h2 style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #ffffff;">${subject}</h2>
      </div>
      <div style="padding: 24px; color: #222525; line-height: 1.6; font-size: 14px;">
        <div style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; margin-bottom: 16px; color: ${badgeColor};">
          PRIORITY: ${kind}
        </div>
        <p style="margin: 0 0 16px;">${body}</p>
        <hr style="border: 0; border-top: 1px solid #e0dfd5; margin: 24px 0;" />
        <p style="margin: 0; font-size: 12px; color: #667069;">
          Clauseway is a synthetic prototype. This message was generated from demonstration data and is not an official AICTE communication.
        </p>
      </div>
    </div>
  `;
}

async function dispatchEmail(toEmail:string,subject:string,body:string,kind:string):Promise<DispatchNotificationAttempt>{
  const gateway=getGatewayStatus();
  if(!gateway.emailConfigured){
    return {channel:'email',status:'simulated',detail:'No email gateway configured (VITE_RESEND_API_KEY or VITE_SMTP_HOST not set).'};
  }
  try{
    if(gateway.emailGateway==='RESEND_LIVE'){
      const res=await withTimeout(fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{Authorization:`Bearer ${import.meta.env.VITE_RESEND_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({from:import.meta.env.VITE_EMAIL_FROM||'Clauseway <onboarding@resend.dev>',to:toEmail,subject:`[Clauseway prototype] ${subject}`,text:body,html:buildHtmlEmail(subject,body,kind)}),
      }),EMAIL_TIMEOUT_MS);
      if(res.ok){return {channel:'email',status:'delivered',detail:'Delivered via Resend.'};}
      return {channel:'email',status:'failed',detail:`Resend returned ${res.status}.`};
    }
    if(gateway.emailGateway==='SMTP_LIVE'){
      return {channel:'email',status:'failed',detail:'SMTP transport is not implemented in the browser client.'};
    }
    return {channel:'email',status:'simulated',detail:'Ethereal sandbox is not available in the browser client.'};
  }catch(error){
    return {channel:'email',status:'failed',detail:error instanceof Error?error.message:'Email dispatch failed.'};
  }
}

async function dispatchSMS(phone:string,subject:string,body:string):Promise<DispatchNotificationAttempt>{
  const gateway=getGatewayStatus();
  const cleanPhone=phone.replace(/[^\d+]/g,'');
  if(!gateway.smsConfigured||!cleanPhone){
    return {channel:'sms',status:'simulated',detail:'No SMS gateway configured (VITE_FAST2SMS_API_KEY or VITE_TWILIO_ACCOUNT_SID not set) or no phone number.'};
  }
  try{
    if(gateway.smsGateway==='FAST2SMS_LIVE'){
      const res=await withTimeout(fetch('https://www.fast2sms.com/dev/bulkV2',{
        method:'POST',
        headers:{authorization:import.meta.env.VITE_FAST2SMS_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({route:'q',message:`[Clauseway prototype] ${subject}: ${body.slice(0,100)}`,language:'english',flash:0,numbers:cleanPhone.replace('+91','').trim()}),
      }),SMS_TIMEOUT_MS);
      const data=await res.json();
      if(data.return){return {channel:'sms',status:'delivered',detail:'Delivered via Fast2SMS.'};}
      return {channel:'sms',status:'failed',detail:`Fast2SMS returned ${JSON.stringify(data)?.slice(0,200)}.`};
    }
    if(gateway.smsGateway==='TWILIO_LIVE'){
      return {channel:'sms',status:'failed',detail:'Twilio transport is not implemented in the browser client.'};
    }
    return {channel:'sms',status:'simulated',detail:'SMS sandbox is not available in the browser client.'};
  }catch(error){
    return {channel:'sms',status:'failed',detail:error instanceof Error?error.message:'SMS dispatch failed.'};
  }
}

export async function dispatchNotification(params:DispatchNotificationParams):Promise<DispatchNotificationResult>{
  const gateway=getGatewayStatus();
  const channels:NotificationChannel[]=params.channel??['in_app'];
  const attempts:DispatchNotificationAttempt[]=[];
  for(const channel of channels){
    if(channel==='email'){
      attempts.push(await dispatchEmail(params.toInstitutionId?`${params.toInstitutionId}@example.invalid`:'',params.subject,params.body,params.kind));
    }else if(channel==='sms'){
      attempts.push(await dispatchSMS('',params.subject,params.body));
    }else if(channel==='voice'){
      attempts.push({channel:'voice',status:'simulated',detail:'Voice reminders are rehearsed in the demo lab; no telephony gateway is configured.'});
    }else{
      attempts.push({channel:'in_app',status:'delivered',detail:'In-app notification recorded.'});
    }
  }
  return {notificationId:crypto.randomUUID(),gateway,attempts};
}
