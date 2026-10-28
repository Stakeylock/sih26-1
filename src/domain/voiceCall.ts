export type VoiceIntent='SUBMITTED'|'WILL_SUBMIT'|'NEEDS_MORE_TIME'|'WRONG_PERSON'|'REQUESTS_HUMAN'|'UNCLEAR_RESPONSE';
export type VoiceNotificationKind='INFO'|'REMINDER'|'ESCALATION';

export interface VoiceCallPlan {
  intent:VoiceIntent;
  label:string;
  notificationKind:VoiceNotificationKind;
  detail:string;
  followUp:string|null;
  promisedDate:string|null;
  disclaimer:string;
}

export interface VoicePreset {
  id:string;
  label:string;
  transcript:string;
}

export const voiceCallDisclaimer='Simulation only. No call was placed and no case status, deadline, or document validity changed.';

export const voicePresets:VoicePreset[]=[
  {id:'submitted',label:'Already submitted',transcript:'We already submitted the fire safety certificate through the portal yesterday.'},
  {id:'will-submit',label:'Commitment to submit',transcript:'Our registrar will upload the revised faculty list in 3 days.'},
  {id:'more-time',label:'Needs more time',transcript:'We need more time. The board resolution is not ready and we cannot upload it this week.'},
  {id:'wrong-person',label:'Wrong contact',transcript:'This is the wrong number. I am not associated with the institution.'},
  {id:'human',label:'Human review requested',transcript:'Please have a human officer call me. I want to speak to a supervisor about this notice.'},
];

const intentRules:{intent:VoiceIntent;pattern:RegExp}[]=[
  {intent:'REQUESTS_HUMAN',pattern:/(?:speak|talk) (?:to|with) (?:a |an |the )?(?:human|person|officer|supervisor)|(?:need|want) (?:a |an |the )?human|human (?:reviewer|officer)|supervisor|legal (?:team|adviser|advisor)|advocate|lawyer/i},
  {intent:'WRONG_PERSON',pattern:/wrong (?:number|person|contact)|not the (?:right|authorised|authorized) (?:person|contact)|no longer (?:works|associated|there)|doesn'?t work there|not associated with/i},
  {intent:'SUBMITTED',pattern:/(?:already|have|has|had) (?:submitted|uploaded|sent|filed)|(?:submitted|uploaded|filed) (?:it|them|the|on|yesterday|last)|completed the (?:upload|submission)/i},
  {intent:'NEEDS_MORE_TIME',pattern:/(?:need|needs|require|requires|want|wants) (?:some )?more time|extension|cannot|can'?t|unable|delay(?:ed)?|not ready|more days/i},
  {intent:'WILL_SUBMIT',pattern:/will (?:submit|upload|send|file)|going to (?:submit|upload|send|file)|plan(?:ning)? to (?:submit|upload|send|file)|shall (?:submit|upload|send|file)|by (?:tomorrow|next week|monday|tuesday|wednesday|thursday|friday)/i},
];

const labels:Record<VoiceIntent,string>={
  SUBMITTED:'Institution says it submitted',
  WILL_SUBMIT:'Commitment to submit',
  NEEDS_MORE_TIME:'Request for more time',
  WRONG_PERSON:'Wrong contact',
  REQUESTS_HUMAN:'Human review requested',
  UNCLEAR_RESPONSE:'Unclear response',
};

const details:Record<VoiceIntent,string>={
  SUBMITTED:'The contact says the document was already submitted. Check the upload record before treating the claim as received.',
  WILL_SUBMIT:'The contact committed to submit. The follow-up stays open until the upload is recorded.',
  NEEDS_MORE_TIME:'The contact asked for more time. The statutory deadline is unchanged; a reviewer decides whether any extension applies.',
  WRONG_PERSON:'The contact is not the authorised person for this institution. Update the contact record and retry another authorised person.',
  REQUESTS_HUMAN:'The contact asked to speak with a human reviewer. Route the request to the assigned officer.',
  UNCLEAR_RESPONSE:'The response did not contain a usable commitment. Record the call outcome and retry later.',
};

export function classifyVoiceResponse(transcript:string):VoiceIntent{
  const text=transcript.trim();
  if(!text)return 'UNCLEAR_RESPONSE';
  return intentRules.find(rule=>rule.pattern.test(text))?.intent??'UNCLEAR_RESPONSE';
}

export function parsePromisedDate(transcript:string,now=new Date()):string|null{
  const iso=transcript.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if(iso){
    const value=`${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed=new Date(`${value}T00:00:00Z`);
    if(!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value)return value;
  }
  const days=transcript.match(/\bin\s+(\d{1,3})\s+days?\b/i);
  if(days){
    const count=Number(days[1]);
    if(count>0&&count<=365){
      const date=new Date(now);
      date.setUTCDate(date.getUTCDate()+count);
      return date.toISOString().slice(0,10);
    }
  }
  return null;
}

export function buildVoiceCallPlan(transcript:string,now=new Date()):VoiceCallPlan{
  const intent=classifyVoiceResponse(transcript);
  const promisedDate=parsePromisedDate(transcript,now);
  const notificationKind:VoiceNotificationKind=intent==='SUBMITTED'?'INFO':intent==='WRONG_PERSON'||intent==='REQUESTS_HUMAN'?'ESCALATION':'REMINDER';
  const followUp=
    intent==='SUBMITTED'?'Verify the upload record; do not close the follow-up from the call alone.':
    intent==='WILL_SUBMIT'?(promisedDate?`Follow up on ${promisedDate}.`:'No date promised; keep the reminder open.'):
    intent==='NEEDS_MORE_TIME'?(promisedDate?`Reviewer to consider the request; contact promised an update on ${promisedDate}.`:'Reviewer to consider the request; no date promised.'):
    intent==='WRONG_PERSON'?'Find an authorised contact and place a new reminder.':
    intent==='REQUESTS_HUMAN'?'Route to the assigned officer; the call made no decision.':
    'Retry the reminder; no commitment is recorded.';
  return {intent,label:labels[intent],notificationKind,detail:details[intent],followUp,promisedDate,disclaimer:voiceCallDisclaimer};
}
