import type {Qualification} from '../domain/evc';
export interface DemoEVCExpert extends Qualification {member_code:string;user_id:string|null;full_name:string;region:string}
export const demoEvcExperts:DemoEVCExpert[]=[
 {id:'demo-evc-member-1',user_id:'demo-evc-member-1',member_code:'DEMO-EVC-01',full_name:'Ravi Sharma (synthetic)',region:'South',designation_level:'PROFESSOR',discipline:'TECHNICAL_EDUCATION',organisation_type:'UNIVERSITY',experience_years:12,coa_registration_no:null,panel_status:'ON_APPROVED_PANEL',verification_status:'VERIFIED',active:true},
 {id:'demo-evc-member-2',user_id:'demo-evc-member-2',member_code:'DEMO-EVC-02',full_name:'Priya Nair (synthetic)',region:'South',designation_level:'ASSOCIATE_PROFESSOR',discipline:'CIVIL_STRUCTURAL',organisation_type:'UNIVERSITY',experience_years:10,coa_registration_no:null,panel_status:'ON_APPROVED_PANEL',verification_status:'VERIFIED',active:true},
 {id:'demo-evc-member-3',user_id:'demo-evc-member-3',member_code:'DEMO-EVC-03',full_name:'Suresh Kumar (synthetic)',region:'South',designation_level:'ARCHITECT',discipline:'ARCHITECTURE',organisation_type:'PRACTICE',experience_years:10,coa_registration_no:'DEMO-REG-03',panel_status:'ON_APPROVED_PANEL',verification_status:'VERIFIED',active:true}
];
