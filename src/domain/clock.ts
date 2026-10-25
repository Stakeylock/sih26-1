import type { Deficiency } from './integrity';
import type {AuditEvent} from './model';
import {demoNow} from './virtualClock';
import {recordedSnapshot} from './review';
const DAY=86400000, IST=19800000;

export function isWeekend(date: Date): boolean {
  const day = new Date(date.getTime()+IST).getUTCDay();
  return day === 0 || day === 6;
}

function dateKey(date: Date): string {
  return new Date(date.getTime()+IST).toISOString().slice(0,10);
}

/** `holidays` are `YYYY-MM-DD` keys that do not count as working days. */
export function isWorkingDay(date: Date, holidays: readonly string[] = []): boolean {
  return !isWeekend(date) && !holidays.includes(dateKey(date));
}

/** Signed working days from `from` to `to` (positive when `to` is later). Skips weekends/holidays. */
export function workingDaysBetween(from: Date | string | number, to: Date | string | number, holidays: readonly string[] = []): number {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const sign = end.getTime() >= start.getTime() ? 1 : -1;
  const low = Math.floor(((sign > 0 ? start : end).getTime()+IST)/DAY);
  const high = Math.floor(((sign > 0 ? end : start).getTime()+IST)/DAY);
  let count = 0;
  for(let day=low+1;day<=high;day++)if(isWorkingDay(new Date(day*DAY-IST),holidays))count++;
  return count===0?0:sign*count;
}

/** Working days until a deadline; negative when overdue. Returns null when there is no deadline. */
export function workingDaysUntil(due: string | null | undefined, now = demoNow(), holidays: readonly string[] = []): number | null {
  if (!due) return null;
  return workingDaysBetween(now, due, holidays);
}

export interface DualClock {
  /** Working days the case has been with the authority (scrutiny / decision). */
  officerDays: number;
  /** Working days the case has been with the institution (deficiency response window). */
  institutionDays: number;
  /** True while an open/escalated deficiency currently holds the clock. */
  paused: boolean;
  totalWorkingDays: number;
  complete: boolean;
  coverageStart: string | null;
}

function mergeWindows(windows: [number, number][]): [number, number][] {
  const sorted = windows.filter(([, end]) => end > 0).sort((left, right) => left[0] - right[0]);
  const merged: [number, number][] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window[0] <= last[1]) last[1] = Math.max(last[1], window[1]);
    else merged.push([...window] as [number, number]);
  }
  return merged;
}

/** Synthetic elapsed weekday time. Intervals are unioned before calculation; no interval rounding. */
function elapsedWeekdays(from:number,to:number,holidays:readonly string[]){
  let total=0,cursor=from;
  while(cursor<to){const dayStart=Math.floor((cursor+IST)/DAY)*DAY-IST;const next=Math.min(to,dayStart+DAY);
    if(isWorkingDay(new Date(dayStart),holidays))total+=(next-cursor)/DAY;
    cursor=next;
  }
  return total;
}
export function computeDualClock(input:{startAt:string|null|undefined;closedAt?:string|null;events?:readonly AuditEvent[];historyComplete?:boolean;deficiencies?:readonly Pick<Deficiency,'raised_at'|'resolved_at'|'status'>[];holidays?:readonly string[]},now=demoNow()):DualClock{
  const start=Date.parse(input.startAt??'');const end=Math.min(now,input.closedAt?Date.parse(input.closedAt):now);
  const empty={officerDays:0,institutionDays:0,paused:false,totalWorkingDays:0,complete:false,coverageStart:null};
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return empty;
  const holidays=input.holidays??[];
  if(input.events===undefined){
    // Legacy callers get an explicitly incomplete approximation, never a complete history claim.
    const windows=mergeWindows((input.deficiencies??[]).flatMap(item=>{const raised=Date.parse(item.raised_at),resolved=item.resolved_at?Date.parse(item.resolved_at):end;return [[Math.max(start,raised),Math.min(end,resolved)] as [number,number]];}));
    const total=elapsedWeekdays(start,end,holidays),institution=windows.reduce((sum,[from,to])=>sum+elapsedWeekdays(from,to,holidays),0);
    return {...empty,officerDays:Math.max(0,total-institution),institutionDays:Math.min(total,institution),totalWorkingDays:total,paused:!input.closedAt&&(input.deficiencies??[]).some(item=>['open','escalated'].includes(item.status))};
  }
  const events=[...input.events].sort((a,b)=>(a.sequence??0)-(b.sequence??0));
  const first=events.find(event=>recordedSnapshot(event));if(!first)return empty;
  if(!input.historyComplete||events.some((event,index)=>event.sequence!==index+1)||events.slice(events.indexOf(first)).some(event=>!recordedSnapshot(event)))return empty;
  const coverageStart=Math.max(start,Date.parse(first.created_at));if(coverageStart>end)return empty;
  const complete=first.sequence===1;
  const open=new Map<string,number>();const windows:[number,number][]=[];
  for(const event of events){
    const snapshot=recordedSnapshot(event);if(!snapshot)continue;
    const at=Math.min(end,Math.max(coverageStart,Date.parse(event.created_at)));
    if(Date.parse(event.created_at)>end)break;
    const waiting=new Set(snapshot.deficiencies.filter(item=>['open','escalated'].includes(item.status)).map(item=>item.id));
    for(const [id,from] of open)if(!waiting.has(id)){windows.push([from,at]);open.delete(id);}
    for(const id of waiting)if(!open.has(id))open.set(id,at);
  }
  for(const from of open.values())windows.push([from,end]);
  const total=elapsedWeekdays(coverageStart,end,holidays);
  const institution=Math.min(total,mergeWindows(windows).reduce((sum,[from,to])=>sum+elapsedWeekdays(from,to,holidays),0));
  const round=(value:number)=>Math.round(value*1000000)/1000000;
  return {officerDays:round(Math.max(0,total-institution)),institutionDays:round(institution),totalWorkingDays:round(total),paused:!input.closedAt&&open.size>0,complete,coverageStart:new Date(coverageStart).toISOString()};
}
