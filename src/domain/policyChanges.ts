import type {Workspace} from './model';

export interface PolicyChange {
  noticeId:string;
  code:string;
  title:string;
  adoptedAt:string;
  caseCount:number;
}

export function policyChangesSince(data:Pick<Workspace,'notices'|'events'>,since:string|null):PolicyChange[]{
  if(!since)return [];
  const cutoff=Date.parse(since);
  if(!Number.isFinite(cutoff))return [];
  const notices=new Map((data.notices??[]).map(notice=>[notice.id,notice]));
  const changes=new Map<string,{adoptedAt:number;caseIds:Set<string>}>();
  for(const event of data.events??[]){
    if(event.action!=='deadline_adopted')continue;
    const noticeId=typeof event.payload?.notice_id==='string'?event.payload.notice_id:null;
    if(!noticeId||!notices.has(noticeId))continue;
    const adoptedAt=Date.parse(event.created_at);
    if(!Number.isFinite(adoptedAt)||adoptedAt<=cutoff)continue;
    const change=changes.get(noticeId)??{adoptedAt,caseIds:new Set<string>()};
    change.adoptedAt=Math.max(change.adoptedAt,adoptedAt);
    change.caseIds.add(event.application_id);
    changes.set(noticeId,change);
  }
  return [...changes].map(([noticeId,change])=>{
    const notice=notices.get(noticeId)!;
    return {noticeId,code:notice.code,title:notice.title,adoptedAt:new Date(change.adoptedAt).toISOString(),caseCount:change.caseIds.size};
  }).sort((left,right)=>right.adoptedAt.localeCompare(left.adoptedAt)||left.code.localeCompare(right.code));
}
