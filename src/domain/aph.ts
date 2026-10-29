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
export const APH_TITLE = 'AICTE Approval Process Handbook 2024-25 to 2026-27';
export const APH_SOURCE_URL = 'https://www.aicte.gov.in/approal-process-2024-2027';

/**
 * Clause references for the document types used by demo templates.
 * Verified against `docs/reference/APH_2024-27.txt` on 29 October 2026: clause numbers, titles,
 * page numbers and quoted text all trace to that file. `APH_EDITION` is the academic year served;
 * the handbook itself is the triennial 2024-25 to 2026-27 document (see OQ-01, OQ-02).
 * Demonstration references only — not an official AICTE citation.
 */
export const APH_CLAUSES: APHClause[] = [
  {
    chapter_number: 6,
    chapter_title: 'Standard Norms and Requirements',
    clause_number: '6.17(i)',
    clause_title: 'Fire Safety Certificate',
    page_number: 73,
    norm_category: 'SAFETY_COMPLIANCE',
    content_text:
      'A valid Fire Safety Certificate shall be obtained from the Competent Authority. State-wise ' +
      'Competent Authorities for issuing the certificates pertaining to the Land/ Building including the ' +
      'Occupancy Certificate are given in Annexure-14 of the Approval Process Handbook.',
  },
  {
    chapter_number: 6,
    chapter_title: 'Standard Norms and Requirements — Annexure-3',
    clause_number: 'Annexure-3 §3.1',
    clause_title: 'Land Requirements for the Technical Institutions',
    page_number: 102,
    norm_category: 'LAND_REQUIREMENT',
    content_text:
      'The land required will be based on prevailing FSI/FAR norms applicable for that location as declared ' +
      'by the respective competent authority to house the required built-up area as per norms. The same shall ' +
      'be applicable for the Institutions to be established/ already established in Mega/Metro/Urban/Rural areas.',
  },
  {
    chapter_number: 1,
    chapter_title: 'Grant of Approval for New Institution',
    clause_number: '1.9',
    clause_title: 'Process for Evaluation of the Application by the Expert Visit Committee (EVC)',
    page_number: 24,
    norm_category: 'GOVERNANCE',
    content_text:
      'The Expert Visit Committee shall be constituted by selection of committee members through a web portal ' +
      'based automated process made available by AICTE. The EVC shall verify physically/online the infrastructural ' +
      'facilities of the institution. Composition is given in Annexure-16 §16.5: an academician not below the Level ' +
      'of Professor selected from the panel of Experts approved by the Executive Committee; one Expert member not ' +
      'below the Level of Associate Professor or an Industry expert with a minimum of 5 years of experience; and an ' +
      'Architect registered with the Council of Architecture or CPWD, NBCC, DRDO, CSIR, or a Professor/Associate ' +
      'Professor of Civil Engineering (Structural), Assistant Professor of Architecture, or Professor/Associate ' +
      'Professor of Planning.',
  },
  {
    chapter_number: 6,
    chapter_title: 'Standard Norms and Requirements',
    clause_number: '6.14',
    clause_title: 'Norms for Faculty requirements and Cadre ratio',
    page_number: 71,
    norm_category: 'FACULTY_STRENGTH',
    content_text:
      'The Technical Institutions shall follow Norms for Faculty requirements and Cadre ratio in Diploma/ ' +
      'Under Graduate/ Post Graduate Level as provided in the Annexure-5 of the Approval Process Handbook.',
  },
  {
    chapter_number: 6,
    chapter_title: 'Standard Norms and Requirements',
    clause_number: '6.17',
    clause_title: 'Norms for Built-up requirements (Annexure-3)',
    page_number: 72,
    norm_category: 'BUILT_UP_AREA',
    content_text:
      'The Technical Institutions shall follow Norms for Built-up requirements as provided in Annexure-3 of the ' +
      'Approval Process Handbook. The Building has to be constructed as per the approved Building plan; in case ' +
      'of any modifications done in an existing Building, stability of the entire construction needs to be checked ' +
      'and the Building Plan needs to be re-validated in case of major changes.',
  },
  {
    chapter_number: 1,
    chapter_title: 'Grant of Approval for New Institution',
    clause_number: '1.8',
    clause_title: 'Process for Evaluation of the Application by the Scrutiny/Re-Scrutiny Committee',
    page_number: 23,
    norm_category: 'DOCUMENT_AUTHENTICITY',
    content_text:
      'Applicants shall present their application along with original documents and self-attested copies as per ' +
      'Annexure-1 of the Approval Process Handbook, before the Scrutiny Committee. The Scrutiny Committee shall ' +
      'verify the authenticity of the documents submitted by the Applicant and shall countersign (if verified ' +
      'offline) all the documents that are accepted. The onus of the authenticity of the information lies with the ' +
      'Institution ONLY and not on AICTE.',
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
