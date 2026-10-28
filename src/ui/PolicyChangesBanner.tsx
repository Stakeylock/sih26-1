import {useEffect,useState} from 'react';
import {ArrowRight,FileText,X} from 'lucide-react';
import type {Identity,Workspace} from '../domain/model';
import {policyChangesSince} from '../domain/policyChanges';
import './policy-changes.css';

const VISIT_KEY='clauseway-policy-visit-v1:';

function beginVisit(identityId:string){
  let since:string|null=null;
  try{
    const stored=window.localStorage.getItem(VISIT_KEY+identityId);
    if(stored&&Number.isFinite(Date.parse(stored)))since=stored;
  }catch{}
  try{window.localStorage.setItem(VISIT_KEY+identityId,new Date().toISOString());}catch{}
  return {since};
}

function markSeen(identityId:string){
  const seenAt=new Date().toISOString();
  try{window.localStorage.setItem(VISIT_KEY+identityId,seenAt);}catch{}
  return seenAt;
}

export function PolicyChangesBanner({data,identity,navigate}:{data:Workspace;identity:Identity;navigate:(page:string)=>void}){
  const [visit,setVisit]=useState<{since:string|null}|null>(null);
  const [dismissed,setDismissed]=useState(false);
  useEffect(()=>{setVisit(beginVisit(identity.id));setDismissed(false);},[identity.id]);
  const changes=visit?policyChangesSince(data,visit.since):[];
  if(!visit||dismissed||!changes.length)return null;
  const caseCount=changes.reduce((total,change)=>total+change.caseCount,0);
  const codes=changes.slice(0,3).map(change=>change.code).join(', ');
  const more=changes.length>3?` +${changes.length-3} more`:'';
  const subject=changes.length===1?'Adopted notice':`${changes.length} adopted notices`;
  const acknowledge=()=>{setVisit({since:markSeen(identity.id)});setDismissed(true);};
  const see=()=>{acknowledge();navigate('notices');};
  const dismiss=()=>{acknowledge();};
  return <section className="policy-changes-banner" aria-labelledby="policy-changes-title">
    <FileText size={18} aria-hidden="true"/>
    <div className="policy-changes-copy">
      <h2 id="policy-changes-title">Policy changes since your last visit</h2>
      <p><span className="mono">{subject} {codes}{more}</span> changed {caseCount} visible case deadline{caseCount===1?'':'s'}. Review the adopted source before relying on the new dates.</p>
    </div>
    <div className="policy-changes-actions">
      <button type="button" className="button small" onClick={see}>Review policy notices <ArrowRight size={13}/></button>
      <button type="button" className="policy-changes-dismiss" aria-label="Dismiss policy changes notice" onClick={dismiss}><X size={13}/></button>
    </div>
  </section>;
}
