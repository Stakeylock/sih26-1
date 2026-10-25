import {describe, expect, it} from 'vitest';
import {complianceTierLabel, planClockAdvance, tierFor, baseTier} from '../src/domain/consequences';
import type {Application, DocumentRecord, Obligation} from '../src/domain/model';

const DAY = 86400000;
const now = Date.parse('2026-01-05T09:00:00Z');
const at = (days: number) => now + days * DAY;

function makeApp(id: string, ref: string, slaDue: string, status: Application['status'] = 'under_scrutiny'): Application {
  return {
    id, ref_no: ref, title: 'Case ' + ref, type: 'new_approval', status,
    owner_id: 'inst', institution_id: 'i1', assigned_officer: null, region: 'South',
    form_data: {}, submitted_at: '2025-12-01T09:00:00Z', sla_due_at: slaDue, created_at: '2025-12-01T09:00:00Z', updated_at: '2025-12-01T09:00:00Z',
  } as unknown as Application;
}

function makeObligation(id: string, title: string, due: string, escalation: Obligation['escalation_level'], status: Obligation['status'] = 'open', target?: string): Obligation {
  return {id, application_id: target ?? 'app-a', title, due_date: due, status, escalation_level: escalation, region: 'South', deadline_source: 'config'} as unknown as Obligation;
}

function baseInput(overrides?: Partial<{apps: Application[]; obligations: Obligation[]; documents: DocumentRecord[]}>) {
  return {
    now,
    applications: overrides?.apps ?? [makeApp('app-a', 'AICTE/2026-01/0001', '2026-01-20T12:00:00Z')],
    obligations: overrides?.obligations ?? [],
    documents: overrides?.documents ?? [],
  };
}

describe('complianceTierLabel', () => {
  it('derives honest urgency labels without inventing new deadlines', () => {
    expect(complianceTierLabel(null)).toBe(null);
    expect(complianceTierLabel(-3)).toBe('Overdue');
    expect(complianceTierLabel(0)).toBe('Due ≤7 working days');
    expect(complianceTierLabel(7)).toBe('Due ≤7 working days');
    expect(complianceTierLabel(8)).toBe(null);
  });
});

describe('tierFor', () => {
  it('maps remaining working days to the honest escalation ladder', () => {
    expect(tierFor(45)).toBe('watch');
    expect(tierFor(30)).toBe('t_minus_30');
    expect(tierFor(1)).toBe('t_minus_30');
    expect(tierFor(0)).toBe('t_minus_0');
    expect(tierFor(-7)).toBe('escalated_ro');
    expect(tierFor(-15)).toBe('escalated_hq');
    expect(tierFor(null)).toBe(null);
  });
});

describe('planClockAdvance', () => {
  it('reports zero rows for an empty workspace', () => {
    const report = planClockAdvance(0, baseInput());
    expect(report).toEqual({days: 0, base: '2026-01-05', reminders: [], overdue: [], escalations: [], expiries: []});
  });

  it('fires the 7/3/1 working-day reminder ladder for a six-week deadline', () => {
    const plan = planClockAdvance(30, baseInput({apps: [makeApp('app-a', 'AICTE/2026-01/0001', '2026-01-29T12:00:00Z')]}));
    expect(plan.reminders.map(row => row.on)).toEqual(['2026-01-20', '2026-01-26', '2026-01-28']);
    for (const row of plan.reminders) expect(row.detail).toMatch(/working day/);
  });

  it('skips reminders already inside the ladder window at the base day', () => {
    const plan = planClockAdvance(30, baseInput({apps: [makeApp('app-a', 'AICTE/2026-01/0001', '2026-01-09T12:00:00Z')]}));
    expect(plan.reminders.filter(row => row.target === 'app-a')).toEqual([]);
  });

  it('marks the first overdue day once for the SLA and for the obligation', () => {
    const plan = planClockAdvance(30, baseInput({
      apps: [makeApp('app-a', 'AICTE/2026-01/0001', '2026-01-06T12:00:00Z')],
      obligations: [makeObligation('obl-1', 'Fire safety renewal', '2026-01-07T12:00:00Z', 't_minus_0')],
    }));
    const overdue = plan.overdue.map(row => [row.target, row.on]);
    expect(overdue).toContainEqual(['app-a', '2026-01-07']);
    expect(overdue).toContainEqual(['obl-1', '2026-01-08']);
    expect(plan.overdue).toHaveLength(2);
    for (const row of plan.overdue) expect(row.detail).toMatch(/overdue by 1 working day/);
  });

  it('walks the escalation ladder forward only, T+7 then T+15', () => {
    const plan = planClockAdvance(40, baseInput({
      obligations: [makeObligation('obl-1', 'Undertaking', '2026-01-12T12:00:00Z', 'normal')],
    }));
    expect(plan.escalations.map(row => [row.detail, row.on])).toEqual([
      ['escalation tier T+7 reached (regional review)', '2026-01-21'],
      ['escalation tier T+15 reached (headquarters review)', '2026-02-02'],
    ]);
    const early = planClockAdvance(5, baseInput({obligations: [makeObligation('obl-1', 'Undertaking', '2026-01-12T12:00:00Z', 'normal')]}));
    expect(early.escalations).toEqual([]);
  });

  it('skips escalated and fulfilled obligations and clamps the horizon by storage bounds', () => {
    const obligations = [
      makeObligation('obl-hq', 'Already escalated', '2026-01-12T12:00:00Z', 'escalated_hq'),
      makeObligation('obl-row', 'Fulfilled', '2026-01-12T12:00:00Z', 'normal', 'fulfilled'),
    ];
    const plan = planClockAdvance(40, baseInput({obligations}));
    expect(plan.escalations).toEqual([]);
  });

  it('records lapses only for evidence that was valid at the base day', () => {
    const documents = [
      {id: 'doc-1', application_id: 'app-a', file_name: 'fire-noc.pdf', expires_on: '2026-01-14'},
      {id: 'doc-2', application_id: 'app-a', file_name: 'lease.pdf', expires_on: '2025-12-01'},
      {id: 'doc-3', application_id: 'app-a', file_name: 'plan.pdf'},
    ] as unknown as DocumentRecord[];
    const plan = planClockAdvance(30, baseInput({documents}));
    expect(plan.expiries.map(row => row.target)).toEqual(['doc-1']);
    expect(plan.expiries[0]).toMatchObject({ref: 'AICTE/2026-01/0001', detail: 'reviewed validity lapses'});
    expect(plan.expiries[0].on).toBe('2026-01-14');
  });

  it('never re-reports the same deadline twice across rows', () => {
    const plan = planClockAdvance(40, baseInput({
      apps: [makeApp('app-a', 'AICTE/2026-01/0001', '2026-01-12T12:00:00Z')],
      obligations: [makeObligation('obl-1', 'Fire safety', '2026-01-12T12:00:00Z', 'normal')],
    }));
    expect(plan.overdue.filter(row => row.target === 'app-a')).toHaveLength(1);
    expect(plan.overdue.filter(row => row.target === 'obl-1')).toHaveLength(1);
    const tiers = plan.escalations.map(row => row.detail);
    expect(new Set(tiers).size).toBe(tiers.length);
    expect(plan.escalations.map(row => row.on)).toEqual(['2026-01-21', '2026-02-02']);
  });

  it('caps the simulation horizon at the clamp', () => {
    const plan = planClockAdvance(99999, baseInput({apps: [makeApp('app-a', 'AICTE/2026-01/0001', '2035-01-01T12:00:00Z')]}));
    expect(plan.days).toBe(3650);
  });

  it('baseTier reads the seed level without contradicting derived reality', () => {
    expect(baseTier('normal', 31)).toBe('normal');
    expect(baseTier('normal', 22)).toBe('t_minus_30');
    expect(baseTier('escalated_ro', 5)).toBe('escalated_ro');
    expect(baseTier('normal', -8)).toBe('escalated_ro');
  });
});
