import { describe, expect, it, beforeEach } from 'vitest';
beforeEach(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} } as Storage;
});
import { createDemoRepository } from '../src/data/demo';
import { canStaff, seatEligibility, validateComposition, type EVCSeat } from '../src/domain/evc';
import type { EVCResponseStatus } from '../src/domain/model';

beforeEach(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} } as Storage;
});

const baseExpert = (overrides: Partial<{ id: string; member_code: string; user_id: string | null; full_name: string; designation_level: string; discipline: string; organisation_type: string; experience_years: number | string | null; coa_registration_no: string | null; panel_status: string; verification_status: string; active: boolean }> = {}) => ({
  id: 'exp-demo',
  member_code: 'DEMO-EVC-00',
  user_id: null,
  full_name: 'Demo Expert',
  designation_level: 'PROFESSOR',
  discipline: 'TECHNICAL_EDUCATION',
  organisation_type: 'UNIVERSITY',
  experience_years: 10,
  coa_registration_no: null,
  panel_status: 'ON_APPROVED_PANEL',
  verification_status: 'VERIFIED',
  active: true,
  ...overrides,
});

const futureWindow = () => {
  const start = new Date(Date.now() + 7 * 86400000);
  const end = new Date(Date.parse(start.toISOString()) + 3 * 60 * 60 * 1000);
  return [start.toISOString(), end.toISOString()] as [string, string];
};

describe('EVC composition', () => {
  it('passes a verified three-seat committee', () => {
    const academian = baseExpert({ id: 'exp-academian', designation_level: 'PROFESSOR', discipline: 'TECHNICAL_EDUCATION' });
    const expert = baseExpert({ id: 'exp-expert', designation_level: 'ASSOCIATE_PROFESSOR', discipline: 'CIVIL_STRUCTURAL', experience_years: 12 });
    const architect = baseExpert({ id: 'exp-architect', designation_level: 'ARCHITECT', discipline: 'ARCHITECTURE', coa_registration_no: 'DEMO-CA-0000' });
    const composition = validateComposition([academian, expert, architect], [
      { expertId: academian.id, seat: 'ACADEMICIAN' },
      { expertId: expert.id, seat: 'EXPERT' },
      { expertId: architect.id, seat: 'ARCHITECT_PLANNING' },
    ]);
    expect(composition.overall).toBe('PASS');
    expect(composition.satisfiable).toBe(true);
  });

  it('fails when a required seat is missing', () => {
    const academian = baseExpert({ id: 'exp-academian', designation_level: 'PROFESSOR', discipline: 'TECHNICAL_EDUCATION' });
    const expert = baseExpert({ id: 'exp-expert', designation_level: 'ASSOCIATE_PROFESSOR', discipline: 'CIVIL_STRUCTURAL', experience_years: 12 });
    const composition = validateComposition([academian, expert], [
      { expertId: academian.id, seat: 'ACADEMICIAN' },
      { expertId: expert.id, seat: 'EXPERT' },
    ]);
    expect(composition.overall).toBe('FAIL');
  });

  it('fails an architect without CoA registration', () => {
    const architect = baseExpert({ id: 'exp-architect', designation_level: 'ARCHITECT', coa_registration_no: null });
    expect(seatEligibility(architect, 'ARCHITECT_PLANNING').outcome).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('fails an industry expert below five years', () => {
    const expert = baseExpert({ id: 'exp-industry', designation_level: 'INDUSTRY_EXPERT', experience_years: 2 });
    expect(seatEligibility(expert, 'EXPERT').outcome).toBe('FAIL');
  });

  it('canStaff requires distinct experts for each required seat', () => {
    const academian = baseExpert({ id: 'exp-academian', designation_level: 'PROFESSOR', discipline: 'TECHNICAL_EDUCATION' });
    const expert = baseExpert({ id: 'exp-expert', designation_level: 'ASSOCIATE_PROFESSOR', discipline: 'CIVIL_STRUCTURAL', experience_years: 12 });
    const architect = baseExpert({ id: 'exp-architect', designation_level: 'ARCHITECT', discipline: 'ARCHITECTURE', coa_registration_no: 'DEMO-CA-0000' });
    const candidates = new Map<EVCSeat, string[]>([
      ['ACADEMICIAN', [academian.id]],
      ['EXPERT', [expert.id]],
      ['ARCHITECT_PLANNING', [architect.id]],
    ]);
    expect(canStaff(candidates)).toBe(true);
    const samePerson = new Map<EVCSeat, string[]>([
      ['ACADEMICIAN', [academian.id]],
      ['EXPERT', [academian.id]],
      ['ARCHITECT_PLANNING', [architect.id]],
    ]);
    expect(canStaff(samePerson)).toBe(false);
  });
});

describe('demo EVC repository', () => {
  it('shows recorded availability, then schedules, assigns, confirms after responses, reschedules, and cancels', async () => {
    const repo = await createDemoRepository('national_admin');
    const workspace = await repo.workspace();
    let app = workspace.applications.find(application => application.id === 'demo-app-2');
    expect(app).toBeDefined();
    expect(app?.evc_required).toBe(true);

    const visit2 = workspace.evc_visits.find(visit => visit.application_id === app!.id && visit.status === 'SCHEDULED');
    expect(visit2).toBeDefined();
    const [busyStart, busyEnd] = [visit2!.scheduled_start, visit2!.scheduled_end!];

    const availability = await repo.getEVCAvailability(app!, busyStart, busyEnd);
    expect(availability.capacity.satisfiable).toBe(false);
    expect(availability.officials.every(official => official.status === 'BUSY')).toBe(true);

    await repo.cancelEVC(visit2!.id, 'Synthetic recorded reason for cancelling the seeded visit before retesting the window.');
    app = (await repo.workspace()).applications.find(application => application.id === 'demo-app-2')!;
    const afterCancel = await repo.getEVCVisits(app);
    expect(afterCancel.find(visit => visit.id === visit2!.id)?.status).toBe('CANCELLED');

    const [start, end] = futureWindow();
    await repo.scheduleEVC(app, { scheduledStart: start, scheduledEnd: end, mode: 'ONLINE', note: 'Recorded synthetic EVC visit window for the case region.' });
    app = (await repo.workspace()).applications.find(application => application.id === 'demo-app-2')!;
    const visits = await repo.getEVCVisits(app);
    const current = visits.find(visit => visit.status === 'SCHEDULED');
    expect(current).toBeDefined();

    const members = [
      { expertId: 'demo-evc-member-1', seat: 'ACADEMICIAN' },
      { expertId: 'demo-evc-member-2', seat: 'EXPERT' },
      { expertId: 'demo-evc-member-3', seat: 'ARCHITECT_PLANNING' },
    ];
    await repo.assignEVCMembers(app, current!.id, members);
    const recordedWorkspace = await repo.workspace();
    const recorded = recordedWorkspace.evc_members.filter(member => member.evc_visit_id === current!.id && member.active);
    expect(recorded.map(member => member.seat).sort()).toEqual(['ACADEMICIAN', 'ARCHITECT_PLANNING', 'EXPERT']);
    expect(recorded.every(member => member.response_status === 'INVITED')).toBe(true);

    await expect(repo.confirmEVC(current!.id)).rejects.toThrow(/All members must accept/);
    await expect(repo.respondToEVC(current!.id, 'ACCEPTED' as EVCResponseStatus, '')).rejects.toThrow(/EVC member required/);

    await repo.rescheduleEVC(current!.id, { scheduledStart: busyStart, scheduledEnd: busyEnd, mode: 'PHYSICAL', reason: 'Synthetic recorded conflict with the earlier visit window.' });
    app = (await repo.workspace()).applications.find(application => application.id === 'demo-app-2')!;
    const rescheduled = (await repo.getEVCVisits(app)).find(visit => visit.id === current!.id);
    expect(rescheduled?.status).toBe('SCHEDULED');
    expect(rescheduled?.schedule_version).toBe(2);

    await repo.cancelEVC(current!.id, 'Synthetic recorded reason for cancelling the rescheduled visit.');
    const cancelled = (await repo.getEVCVisits(app)).find(visit => visit.id === current!.id);
    expect(cancelled?.status).toBe('CANCELLED');
  });

  it('rejects scheduling over an active visit and invalid assignment seats', async () => {
    const repo = await createDemoRepository('national_admin');
    const workspace = await repo.workspace();
    let app = workspace.applications.find(application => application.id === 'demo-app-2')!;
    const visit = workspace.evc_visits.find(v => v.application_id === app.id && v.status === 'SCHEDULED')!;
    const [start, end] = [visit.scheduled_start, visit.scheduled_end!];

    await expect(repo.scheduleEVC(app, { scheduledStart: start, scheduledEnd: end, mode: 'ONLINE', note: 'Second recorded window overlaps the active visit.' })).rejects.toThrow(/An active EVC visit already exists/);
    app = (await repo.workspace()).applications.find(application => application.id === 'demo-app-2')!;

    await expect(repo.assignEVCMembers(app, visit.id, [
      { expertId: 'demo-evc-member-1', seat: 'ACADEMICIAN' },
      { expertId: 'demo-evc-member-1', seat: 'EXPERT' },
      { expertId: 'demo-evc-member-2', seat: 'ARCHITECT_PLANNING' },
    ])).rejects.toThrow(/One person cannot occupy more than one seat/);
  });
});
