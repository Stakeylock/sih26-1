export type NotificationChannel='in_app'|'email'|'sms'|'voice';
export type DeliveryStatus='queued'|'delivered'|'sent_sandbox'|'simulated'|'failed';
export interface GatewayStatus {emailGateway:'SIMULATED';smsGateway:'SIMULATED';voiceGateway:'SIMULATED';emailConfigured:boolean;smsConfigured:boolean}
export interface DispatchNotificationParams {targetType?:'institution'|'user';targetId?:string;toUserId?:string;toInstitutionId?:string;channel?:NotificationChannel[];kind:'REMINDER'|'OVERDUE'|'ESCALATION'|'INFO'|'RETURN';subject:string;body:string;deadlineItemId?:string;applicationId?:string}
export interface DispatchNotificationAttempt {channel:NotificationChannel;status:DeliveryStatus;previewUrl?:string;error?:string;detail?:string}
export interface DispatchNotificationResult {notificationId:string;gateway:GatewayStatus;attempts:DispatchNotificationAttempt[]}
// A browser configuration cannot establish a server transport's credentials or delivery state.
export function getGatewayStatus():GatewayStatus{return {emailGateway:'SIMULATED',smsGateway:'SIMULATED',voiceGateway:'SIMULATED',emailConfigured:false,smsConfigured:false};}
const escape=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function buildHtmlEmail(subject:string,body:string,kind:string):string{return `<div><h2>Clauseway synthetic notification preview</h2><h3>${escape(subject)}</h3><p>${escape(kind)}</p><p>${escape(body)}</p><p>Demonstration only. No external message has been sent.</p></div>`;}
export async function dispatchNotification(params:DispatchNotificationParams):Promise<DispatchNotificationResult>{
 const attempts=(params.channel??['in_app']).map((channel:NotificationChannel):DispatchNotificationAttempt=>channel==='in_app'?{channel,status:'delivered',detail:'In-app notification recorded by the isolated demo repository.'}:{channel,status:'simulated',detail:'No email gateway configured in the browser. External delivery requires an authorized server worker; no message was sent.'});
 return {notificationId:crypto.randomUUID(),gateway:getGatewayStatus(),attempts};
}
