import type {EVCSeat,Eligibility} from './evc';
import type {DemoEVCExpert} from '../data/demoEvc';
export type EVCVisitMode='PHYSICAL'|'ONLINE';
export type EVCResponseStatus='INVITED'|'ACCEPTED'|'REJECTED'|'CONFLICT_REPORTED'|'WITHDRAWAL_REQUESTED';
export interface EVCVisit{id:string;application_id:string;institution_id:string;region:string;mode:EVCVisitMode;scheduled_start:string;scheduled_end:string|null;status:'QUEUED'|'SCHEDULED'|'CONFIRMED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'|'RESCHEDULING_REQUIRED';schedule_version:number;completed_at:string|null;report:string|null;recommendation:string|null;coordinator_id:string;decision_event_id:string|null;created_at:string;updated_at:string}
export interface EVCMember{id:string;evc_visit_id:string;user_id:string;seat:EVCSeat;response_status:EVCResponseStatus;response_note:string|null;responded_at:string|null;active:boolean;invited_version:number;reserved_period_start:string|null;reserved_period_end:string|null;created_at:string;updated_at:string}
export interface EVCConflict {visitId:string|null;referenceNo:string|null;institution:string|null;start:string;end:string;responseStatus:EVCResponseStatus|null;kind:'ASSIGNMENT'|'UNAVAILABILITY'}
export interface EVCOfficialAvailability extends Omit<DemoEVCExpert,'region'> {status:'AVAILABLE'|'BUSY'|'INACTIVE'|'NOT_VERIFIED'|'NO_ACCOUNT'|'UNAVAILABLE';reason:string|null;conflicts:EVCConflict[];dayAssignments:Omit<EVCConflict,'kind'>[];eligibleSeats:EVCSeat[];seatEligibility:Record<EVCSeat,Eligibility>}
export interface EVCAvailabilityResult {officials:EVCOfficialAvailability[];capacity:{satisfiable:boolean;bySeat:Record<EVCSeat,number>;message:string|null;bufferMinutes:number}}
export interface EVCUnavailability {id:string;expert_id:string;starts_at:string;ends_at:string;reason:string;withdrawn_at:string|null;created_at:string}
export interface EVCScheduleHistory {id:string;evc_visit_id:string;old_start:string;old_end:string|null;new_start:string;new_end:string;changed_by:string;changed_at:string;reason:string}
