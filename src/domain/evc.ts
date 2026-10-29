/**
 * EVC (Expert Visiting Committee) composition validation — APH 2026-27 Annexure 16.5.
 *
 * Committee constitution rules:
 *   Seat ACADEMICIAN — academician not below Professor level, selected from the EC-approved panel.
 *   Seat EXPERT — not below Associate Professor, or industry expert with 5+ years, panel member.
 *   Seat ARCHITECT_PLANNING — architect (CoA-registered) or civil/structural professor/associate/assistant,
 *                            or Professor/Associate Professor of Planning.
 *
 * Nothing here selects members. The checks only explain whether a proposed committee satisfies the
 * stated composition; anything the text does not settle is HUMAN_REVIEW_REQUIRED, and unverified
 * records are never treated as eligible.
 */

export type EVCSeat = 'ACADEMICIAN' | 'EXPERT' | 'ARCHITECT_PLANNING' | 'CO_OPTED' | 'CHAIRMAN_DEEMED_UNIVERSITY';
export const EVC_SEATS: EVCSeat[] = ['ACADEMICIAN', 'EXPERT', 'ARCHITECT_PLANNING', 'CO_OPTED', 'CHAIRMAN_DEEMED_UNIVERSITY'];
export const EVC_REQUIRED_SEATS: EVCSeat[] = ['ACADEMICIAN', 'EXPERT', 'ARCHITECT_PLANNING'];

export type EVCOutcome = 'PASS' | 'FAIL' | 'WARNING' | 'HUMAN_REVIEW_REQUIRED' | 'NOT_APPLICABLE';

export interface EVCFinding {
  id: string;
  outcome: EVCOutcome;
  blocking: boolean;
  message: string;
  reference: string;
  expertId?: string;
  seat?: EVCSeat;
}

export interface EVCExpert {
  id: string;
  member_code: string;
  user_id: string | null;
  full_name: string;
  designation_level: string;
  discipline: string;
  organisation_type: string;
  experience_years: number | string | null;
  coa_registration_no: string | null;
  panel_status: string;
  verification_status: string;
  active: boolean;
}

export interface EVCSeatEligibilityResult {
  outcome: EVCOutcome;
  reasons: string[];
}

const REF = 'APH 2026-27 Annexure 16.5';

const AT_LEAST_PROFESSOR = ['VICE_CHANCELLOR', 'DIRECTOR_IIT_NIT', 'PROFESSOR'];
const AT_LEAST_ASSOCIATE = [...AT_LEAST_PROFESSOR, 'ASSOCIATE_PROFESSOR'];
const GOVT_BODIES = ['CPWD', 'NBCC', 'DRDO', 'CSIR'];

/**
 * Whether one expert can occupy one seat. Unverified / inactive records never pass.
 */
export function seatEligibility(e: EVCExpert, seat: EVCSeat): EVCSeatEligibilityResult {
  const reasons: string[] = [];
  if (!e.active) return { outcome: 'FAIL', reasons: ['The registry record is inactive.'] };
  if (e.verification_status === 'REJECTED') return { outcome: 'FAIL', reasons: ['The qualification record was rejected on verification.'] };
  if (e.verification_status !== 'VERIFIED') return { outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['Qualifications are not yet verified (NEEDS_VERIFICATION).'] };
  const years = e.experience_years === null || e.experience_years === '' ? null : Number(e.experience_years);
  const onPanel = e.panel_status === 'ON_APPROVED_PANEL';
  const panelUnknown = e.panel_status === 'NEEDS_VERIFICATION';
  switch (seat) {
    case 'ACADEMICIAN': {
      if (!AT_LEAST_PROFESSOR.includes(e.designation_level)) return { outcome: 'FAIL', reasons: ['Must be an academician not below the level of Professor.'] };
      if (e.discipline === 'OTHER') return { outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['Field must be one of Technical Education; the recorded discipline is "other".'] };
      if (panelUnknown) return { outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['Membership of the EC-approved panel of Experts is not verified.'] };
      if (!onPanel) return { outcome: 'FAIL', reasons: ['Must be selected from the panel of Experts approved by the Executive Committee.'] };
      return { outcome: 'PASS', reasons };
    }
    case 'EXPERT': {
      const academic = AT_LEAST_ASSOCIATE.includes(e.designation_level);
      const industry = e.designation_level === 'INDUSTRY_EXPERT';
      if (!academic && !industry) return { outcome: 'FAIL', reasons: ['Must be not below Associate Professor, or an industry expert.'] };
      if (industry && years === null) return { outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['Industry experience is not recorded (minimum 5 years).'] };
      if (industry && years !== null && years < 5) return { outcome: 'FAIL', reasons: [`Industry expert has ${years} year(s) of experience; minimum 5 years.`] };
      if (panelUnknown) return { outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['Membership of the panel of Experts is not verified.'] };
      if (!onPanel) return { outcome: 'FAIL', reasons: ['Must be selected from the panel of Experts.'] };
      return { outcome: 'PASS', reasons };
    }
    case 'ARCHITECT_PLANNING': {
      const lvl = e.designation_level;
      if (lvl === 'ARCHITECT' && e.coa_registration_no) return { outcome: 'PASS', reasons };
      if (['ARCHITECT', 'GOVT_TECHNICAL_OFFICER'].includes(lvl) && GOVT_BODIES.includes(e.organisation_type))
        return { outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['"Architect registered with Council of Architecture or CPWD, NBCC, DRDO, CSIR" — whether this member qualifies through CPWD/NBCC/DRDO/CSIR needs authorised interpretation.'] };
      if (lvl === 'ARCHITECT') return { outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['Council of Architecture registration number is not recorded.'] };
      if (['PROFESSOR', 'ASSOCIATE_PROFESSOR'].includes(lvl) && ['CIVIL_STRUCTURAL', 'PLANNING'].includes(e.discipline)) return { outcome: 'PASS', reasons };
      if (lvl === 'ASSISTANT_PROFESSOR' && e.discipline === 'ARCHITECTURE') return { outcome: 'PASS', reasons };
      return { outcome: 'FAIL', reasons: ['Must be an architect (CoA-registered), civil/structural professor, or architecture/planning professor.'] };
    }
    case 'CO_OPTED': {
      // Co-opted: State/UT/University/Board representative not below Associate Professor — human review.
      return { outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['Co-opted member — authorised interpretation required.'] };
    }
    case 'CHAIRMAN_DEEMED_UNIVERSITY': {
      return { outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['Chairman for an Institution Deemed to be University — authorised interpretation required.'] };
    }
  }
}

/**
 * Validate a proposed committee composition against APH 16.5.
 * Returns findings for each required seat plus an overall result.
 */
export function validateComposition(experts: EVCExpert[], assignments: Array<{ expertId: string; seat: EVCSeat }>): { findings: EVCFinding[]; overall: EVCOutcome; satisfiable: boolean } {
  const findings: EVCFinding[] = [];
  const seatAssignments = new Map<string, EVCExpert>();
  for (const a of assignments) {
    const expert = experts.find((e) => e.id === a.expertId);
    if (expert) seatAssignments.set(a.seat, expert);
  }

  for (const seat of EVC_REQUIRED_SEATS) {
    const expert = seatAssignments.get(seat);
    if (!expert) {
      findings.push({
        id: `finding-${seat}`,
        outcome: 'FAIL',
        blocking: true,
        message: `No ${seat.toLowerCase().replace('_', ' ')} assigned to the committee.`,
        reference: REF,
        seat,
      });
      continue;
    }
    const eligibility = seatEligibility(expert, seat);
    findings.push({
      id: `finding-${seat}-${expert.id}`,
      outcome: eligibility.outcome,
      blocking: eligibility.outcome === 'FAIL',
      message: eligibility.reasons.join('; ') || `Seat ${seat} satisfied by ${expert.full_name}.`,
      reference: REF,
      expertId: expert.id,
      seat,
    });
  }

  const blockingFailures = findings.some((f) => f.blocking && f.outcome === 'FAIL');
  const anyHumanReview = findings.some((f) => f.outcome === 'HUMAN_REVIEW_REQUIRED');
  const allPass = findings.every((f) => f.outcome === 'PASS');

  let overall: EVCOutcome;
  if (blockingFailures) overall = 'FAIL';
  else if (anyHumanReview) overall = 'HUMAN_REVIEW_REQUIRED';
  else if (allPass) overall = 'PASS';
  else overall = 'NOT_APPLICABLE';

  return { findings, overall, satisfiable: overall === 'PASS' };
}

/**
 * Check whether every required seat can be filled by distinct available experts.
 * Used by the availability engine to decide whether a slot is bookable.
 */
export function canStaff(cands: Map<EVCSeat, string[]>, fixed: Partial<Record<EVCSeat, string>> = {}): boolean {
  const seats = EVC_REQUIRED_SEATS;
  const used = new Set(Object.values(fixed));
  const go = (i: number): boolean => {
    if (i === seats.length) return true;
    const seat = seats[i];
    if (fixed[seat]) return go(i + 1);
    for (const id of cands.get(seat) ?? []) {
      if (used.has(id)) continue;
      used.add(id);
      if (go(i + 1)) return true;
      used.delete(id);
    }
    return false;
  };
  return go(0);
}
