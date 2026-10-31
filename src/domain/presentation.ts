/** Neutral display wording for older demo labels. Never rewrite persisted audit digests or source bytes. */
export function neutralCopy(value:string|null|undefined){return (value??'').replace(/\b\u0041ICTE\b/gi,'Institutional Review').replace(/\b\u0047overnment\b/gi,'Public');}
export function neutralDemoLabels<T>(value:T):T{
 if(typeof value==='string')return neutralCopy(value) as T;
 if(Array.isArray(value))return value.map(neutralDemoLabels) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['analysis_snapshots','analysis_scenarios'].includes(key)?item:neutralDemoLabels(item)])) as T;
 return value;
}
