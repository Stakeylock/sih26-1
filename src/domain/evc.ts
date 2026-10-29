// Synthetic panel rules supporting the existing demonstration screen. These do not certify qualifications.
export const EVC_SEATS=['ACADEMICIAN','EXPERT','ARCHITECT_PLANNING','CO_OPTED','CHAIRMAN_DEEMED_UNIVERSITY'] as const;
export type EVCSeat=typeof EVC_SEATS[number];
export const EVC_REQUIRED_SEATS:readonly EVCSeat[]=['ACADEMICIAN','EXPERT','ARCHITECT_PLANNING'];
export interface Qualification {id:string;designation_level:string;discipline:string;organisation_type:string;experience_years:number|string|null;coa_registration_no:string|null;panel_status:string;verification_status:string;active:boolean}
export interface Eligibility {outcome:'PASS'|'FAIL'|'HUMAN_REVIEW_REQUIRED';message:string}
export function seatEligibility(expert:Qualification,seat:EVCSeat):Eligibility{
 const result=(outcome:Eligibility['outcome'],message:string)=>({outcome,message});
 if(!expert.active)return result('FAIL','Inactive registry record.');
 if(expert.verification_status!=='VERIFIED'||expert.panel_status!=='ON_APPROVED_PANEL')return result('HUMAN_REVIEW_REQUIRED','Review qualification and panel declarations.');
 if(seat==='ARCHITECT_PLANNING')return expert.designation_level!=='ARCHITECT'?result('FAIL','Architect declaration required.'):!expert.coa_registration_no?result('HUMAN_REVIEW_REQUIRED','Registration declaration needs review.'):result('PASS','Synthetic architect seat declarations present.');
 if(seat==='ACADEMICIAN')return ['PROFESSOR','PRINCIPAL','DIRECTOR'].includes(expert.designation_level)?result('PASS','Synthetic academic seat declaration present.'):result('FAIL','Academic seat declaration missing.');
 if(expert.designation_level==='INDUSTRY_EXPERT'&&Number(expert.experience_years)<5)return result('FAIL','Experience below the configured sample minimum.');
 return result('PASS','Synthetic registry declarations checked.');
}
export function canStaff(candidates:Map<EVCSeat,string[]>){function choose(index:number,used:Set<string>):boolean{if(index===EVC_REQUIRED_SEATS.length)return true;return (candidates.get(EVC_REQUIRED_SEATS[index])??[]).some(id=>!used.has(id)&&choose(index+1,new Set([...used,id])));}return choose(0,new Set());}
export function validateComposition(experts:Qualification[],members:{expertId:string;seat:EVCSeat}[]){const findings:Eligibility[]=[];if(EVC_REQUIRED_SEATS.some(seat=>members.filter(m=>m.seat===seat).length!==1)||new Set(members.map(m=>m.expertId)).size!==members.length)findings.push({outcome:'FAIL',message:'Choose distinct people for each configured required seat.'});for(const member of members){const expert=experts.find(e=>e.id===member.expertId);findings.push(expert?seatEligibility(expert,member.seat):{outcome:'FAIL',message:'Registry record unavailable.'});}const overall=findings.some(f=>f.outcome==='FAIL')?'FAIL':findings.some(f=>f.outcome==='HUMAN_REVIEW_REQUIRED')?'HUMAN_REVIEW_REQUIRED':'PASS';return {overall,satisfiable:overall==='PASS',findings};}
