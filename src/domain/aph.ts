export type APHNormCategory =
  | 'LAND_REQUIREMENT'
  | 'SAFETY_COMPLIANCE'
  | 'FACULTY_STRENGTH'
  | 'BUILT_UP_AREA'
  | 'DOCUMENT_AUTHENTICITY'
  | 'GOVERNANCE';

export interface APHClause {
  chapter_number: number;
  chapter_title: string;
  clause_number: string;
  clause_title: string;
  page_number: number;
  norm_category: APHNormCategory;
  content_text: string;
}

export const APH_EDITION = '2026-27';
export const APH_TITLE = 'AICTE Approval Process Handbook (APH) 2026-2027';
export const APH_SOURCE_URL =
  'https://www.aicte-india.org/sites/default/files/approval/APH_2026-27.pdf';

/**
 * Seeded APH clause references for the document types used by demo templates.
 * Synthetic demonstration references only; not an official AICTE citation.
 * Mirror of example backend/app/intelligence/aph_service.py DEFAULT_SEED_CLAUSES.
 */
export const APH_CLAUSES: APHClause[] = [
  {
    chapter_number: 1,
    chapter_title: 'Grant of Approval for Setting up New Technical Institutions',
    clause_number: '1.7.3',
    clause_title: 'Fire and Safety Clearance Certification',
    page_number: 21,
    norm_category: 'SAFETY_COMPLIANCE',
    content_text:
      'Every applicant institution must produce an authentic and unexpired Fire Safety Certificate (Fire NOC) ' +
      'issued by the competent Fire and Emergency Services Authority of the respective State/UT Government. ' +
      'The Fire NOC must explicitly cover all academic blocks, laboratories, workshops, and administrative blocks ' +
      'where students and faculty congregate.',
  },
  {
    chapter_number: 1,
    chapter_title: 'Grant of Approval for Setting up New Technical Institutions',
    clause_number: '1.4.1',
    clause_title: 'Land Requirements in Mega and Metro Cities',
    page_number: 14,
    norm_category: 'LAND_REQUIREMENT',
    content_text:
      'Minimum land requirement for a new Technical Institution is 1.5 Acres in Mega/Metro cities, 2.5 Acres ' +
      'in other Urban areas, and 7.5 Acres in Rural areas, in contiguous possession with clear title.',
  },
  {
    chapter_number: 2,
    chapter_title: 'Grant of Approval through Scrutiny & Expert Visit Committee',
    clause_number: '2.4.2',
    clause_title: 'Composition and Mandatory Independence of Expert Visit Committee (EVC)',
    page_number: 34,
    norm_category: 'GOVERNANCE',
    content_text:
      'The Expert Visit Committee shall consist of two or three academic experts of Professor/Associate Professor ' +
      'rank from Premier Institutions and one architect/PWD engineer.',
  },
  {
    chapter_number: 3,
    chapter_title: 'Norms and Standards for Technical Institutions',
    clause_number: '3.2.1',
    clause_title: 'Student Faculty Ratio',
    page_number: 42,
    norm_category: 'FACULTY_STRENGTH',
    content_text:
      'The Student Faculty Ratio shall be as prescribed by the Council from time to time and shall be ' +
      'calculated based on the approved intake and regular faculty on roll.',
  },
  {
    chapter_number: 3,
    chapter_title: 'Norms and Standards for Technical Institutions',
    clause_number: '3.4.1',
    clause_title: 'Building Plan and Built-up Area',
    page_number: 48,
    norm_category: 'BUILT_UP_AREA',
    content_text:
      'The Building Plan shall be approved by the competent authority and the built-up area shall meet the norms ' +
      'prescribed for the programme and approved intake.',
  },
  {
    chapter_number: 4,
    chapter_title: 'Document Verification and Authenticity',
    clause_number: '4.1.1',
    clause_title: 'Document Authenticity and Cross-Document Consistency',
    page_number: 60,
    norm_category: 'DOCUMENT_AUTHENTICITY',
    content_text:
      'Every submitted document shall be authentic, unexpired, and consistent with the application form data and ' +
      'other linked documents. Contradictions or expired documents shall be treated as deficiencies.',
  },
];

export function aphClauseForDocument(docType: string): APHClause | null {
  const byType: Record<string, APHNormCategory> = {
    'Fire Safety Certificate': 'SAFETY_COMPLIANCE',
    'Land Document': 'LAND_REQUIREMENT',
    'Faculty List': 'FACULTY_STRENGTH',
    'Building Plan': 'BUILT_UP_AREA',
    'Board Resolution': 'GOVERNANCE',
    'University NOC': 'GOVERNANCE',
    'Trust Deed Amendment': 'GOVERNANCE',
    'Affidavit': 'DOCUMENT_AUTHENTICITY',
    'Lab Equipment Inventory': 'BUILT_UP_AREA',
  };
  const category = byType[docType];
  if (!category) return null;
  return APH_CLAUSES.find(c => c.norm_category === category) ?? null;
}
