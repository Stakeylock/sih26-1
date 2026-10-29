import type {EVCExpert} from '../domain/evc';

export type DemoEVCExpert = EVCExpert & {region: string; affiliation: string};

/**
 * Synthetic EVC registry used only by the isolated demo workspace. Names and
 * affiliations are illustrative; the records are not real people or panels.
 */
export const demoEvcExperts: DemoEVCExpert[] = [
  {
    id: 'demo-evc-member-1',
    member_code: 'DEMO-EVC-01',
    user_id: 'demo-evc-member-1',
    full_name: 'Ravi Sharma',
    designation_level: 'PROFESSOR',
    discipline: 'TECHNICAL_EDUCATION',
    organisation_type: 'ACADEMIC_INSTITUTION',
    experience_years: 22,
    coa_registration_no: null,
    panel_status: 'ON_APPROVED_PANEL',
    verification_status: 'VERIFIED',
    active: true,
    region: 'South',
    affiliation: 'Synthetic South Technical University',
  },
  {
    id: 'demo-evc-member-2',
    member_code: 'DEMO-EVC-02',
    user_id: 'demo-evc-member-2',
    full_name: 'Priya Nair',
    designation_level: 'ASSOCIATE_PROFESSOR',
    discipline: 'CIVIL_STRUCTURAL',
    organisation_type: 'ACADEMIC_INSTITUTION',
    experience_years: 12,
    coa_registration_no: null,
    panel_status: 'ON_APPROVED_PANEL',
    verification_status: 'VERIFIED',
    active: true,
    region: 'South',
    affiliation: 'Synthetic Institute of Civil Engineering',
  },
  {
    id: 'demo-evc-member-3',
    member_code: 'DEMO-EVC-03',
    user_id: 'demo-evc-member-3',
    full_name: 'Suresh Kumar',
    designation_level: 'ARCHITECT',
    discipline: 'ARCHITECTURE',
    organisation_type: 'PRIVATE_PRACTICE',
    experience_years: 16,
    coa_registration_no: 'DEMO-CA-0000',
    panel_status: 'ON_APPROVED_PANEL',
    verification_status: 'VERIFIED',
    active: true,
    region: 'South',
    affiliation: 'Synthetic Architecture Practice',
  },
];
