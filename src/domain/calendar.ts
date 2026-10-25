import type {AnalysisCalendar} from './intelligence';

/** Demonstration dates default to weekdays with no inferred holiday exclusions. */
export function syntheticWorkingCalendar():AnalysisCalendar{return {id:'demo-weekdays',version:1,label:'Synthetic weekdays; no holiday dates supplied',basis:'weekdays',timezone:'Asia/Kolkata',holidays:[],source:'demo://calendar/weekdays/v1'};}
export function workspaceHolidays():readonly string[]{return [];}
