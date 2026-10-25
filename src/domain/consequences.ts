import {workingDaysBetween} from './clock';
import type {Application, DocumentRecord, Obligation} from './model';

const DAY = 86400000;
const IST = 19800000;
const OFFSET_CAP = 3650;
const REMINDER_LADDER = [7, 3, 1];

const TIERS = ['watch', 'normal', 't_minus_30', 't_minus_0', 'escalated_ro', 'escalated_hq'] as const;
type Tier = typeof TIERS[number];
const ESCALATION_LADDER: readonly Tier[] = ['escalated_ro', 'escalated_hq'];
const RANK: Record<string, number> = {watch: 0, normal: 0, t_minus_30: 1, t_minus_0: 2, escalated_ro: 3, escalated_hq: 4};
const TIER_TEXT: Partial<Record<Tier, string>> = {
  t_minus_0: 'Example review window reached on the recorded deadline date',
  escalated_ro: 'Example follow-up window reached seven days after expiry',
  escalated_hq: 'Example follow-up window reached fifteen days after expiry',
};

export interface ClockConsequence {
  kind: 'reminder' | 'overdue' | 'escalation' | 'expiry';
  target: string;
  application_id: string | null;
  ref: string | null;
  title: string;
  on: string;
  detail: string;
}

export interface ClockReport {
  days: number;
  base: string;
  reminders: ClockConsequence[];
  overdue: ClockConsequence[];
  escalations: ClockConsequence[];
  expiries: ClockConsequence[];
}

export function tierFor(remaining: number | null): Tier | null {
  if (remaining === null) return null;
  if (remaining >= 31) return 'watch';
  if (remaining >= 1) return 't_minus_30';
  if (remaining <= -15) return 'escalated_hq';
  if (remaining <= -7) return 'escalated_ro';
  return 't_minus_0';
}

export function baseTier(level: string | null | undefined, remaining: number | null): Tier {
  const derived = tierFor(remaining);
  const seed = level !== null && level !== undefined && (TIERS as readonly string[]).includes(level) ? level as Tier : 'normal';
  if (derived && RANK[derived] > RANK[seed]) return derived;
  return seed;
}

const dayIndex = (at: number): number => Math.floor((at + IST) / DAY);
const stamp = (at: number): string => new Date(at + IST).toISOString().slice(0, 10);

export function complianceTierLabel(remaining: number | null): 'Overdue' | 'Due ≤7 working days' | null {
  if (remaining === null) return null;
  if (remaining < 0) return 'Overdue';
  if (remaining <= 7) return 'Due ≤7 working days';
  return null;
}

function signedRemaining(due: string, at: number, dueDay: number, atDay: number, holidays: readonly string[]): number {
  if (dueDay > atDay) return workingDaysBetween(at, due, holidays);
  if (dueDay === atDay) return 0;
  return -workingDaysBetween(due, at, holidays);
}

function detailFor(remaining: number): string {
  const count = Math.abs(remaining);
  return remaining > 0
    ? `${count} working day${count === 1 ? '' : 's'} remaining`
    : `overdue by ${count} working day${count === 1 ? '' : 's'}`;
}

function planManagedDeskline(target: {id: string; title: string; due: string; applicationId: string}, baseDay: number, span: number, refs: Map<string, string | null>, seen: Set<string>, reminders: ClockConsequence[], overdue: ClockConsequence[], holidays: readonly string[]): void {
  const dueDay = dayIndex(Date.parse(target.due));
  if (!Number.isFinite(dueDay) || dueDay <= baseDay) return;
  const baseRemaining = workingDaysBetween(baseDay * DAY - IST, target.due, holidays);
  const ref = refs.get(target.applicationId) ?? null;
  for (let step = 1; step <= span; step++) {
    const at = baseDay * DAY - IST + step * DAY;
    const on = stamp(at);
    const remaining = signedRemaining(target.due, at, dueDay, dayIndex(at), holidays);
    if (REMINDER_LADDER.includes(remaining) && baseRemaining > 7 && !seen.has(`reminder:${target.id}:${remaining}`)) {
      seen.add(`reminder:${target.id}:${remaining}`);
      reminders.push({kind: 'reminder', target: target.id, application_id: target.applicationId, ref, title: target.title, on, detail: detailFor(remaining)});
    }
    if (remaining < 0 && !seen.has(`overdue:${target.id}`)) {
      seen.add(`overdue:${target.id}`);
      overdue.push({kind: 'overdue', target: target.id, application_id: target.applicationId, ref, title: target.title, on, detail: detailFor(remaining)});
    }
  }
}

export function planClockAdvance(days: number, input: {
  now: number;
  applications: readonly Application[];
  obligations: readonly Obligation[];
  documents: readonly DocumentRecord[];
  holidays?: readonly string[];
}): ClockReport {
  const holidays = input.holidays ?? [];
  const span = Math.max(0, Math.min(OFFSET_CAP, Math.floor(days)));
  if (span === 0) return {days: 0, base: stamp(input.now), reminders: [], overdue: [], escalations: [], expiries: []};
  const baseDay = dayIndex(input.now);
  const refs = new Map(input.applications.map(app => [app.id, app.ref_no]));
  const reminders: ClockConsequence[] = [];
  const overdue: ClockConsequence[] = [];
  const escalations: ClockConsequence[] = [];
  const expiries: ClockConsequence[] = [];
  const seen = new Set<string>();

  for (const app of input.applications) {
    if (['approved', 'rejected'].includes(app.status) || !app.sla_due_at) continue;
    planManagedDeskline({id: app.id, title: 'SLA deadline', due: app.sla_due_at, applicationId: app.id}, baseDay, span, refs, seen, reminders, overdue, holidays);
  }

  for (const obligation of input.obligations) {
    if (obligation.status === 'fulfilled') continue;
    const dueDay = dayIndex(Date.parse(obligation.due_date));
    if (!Number.isFinite(dueDay)) continue;
    const baseRemaining = dueDay > baseDay ? workingDaysBetween(baseDay * DAY - IST, obligation.due_date, holidays) : -workingDaysBetween(obligation.due_date, baseDay * DAY - IST, holidays);
    let maxRank = RANK[baseTier(obligation.escalation_level, baseRemaining)];
    const ref = refs.get(obligation.application_id) ?? null;
    const baseOverdue = baseRemaining !== null && baseRemaining < 0;
    for (let step = 1; step <= span; step++) {
      const at = baseDay * DAY - IST + step * DAY;
      const remaining = signedRemaining(obligation.due_date, at, dueDay, dayIndex(at), holidays);
      const tier = tierFor(remaining);
      if (tier === null || tier === 'watch') continue;
      if (REMINDER_LADDER.includes(remaining) && baseRemaining > 7 && !seen.has(`reminder:${obligation.id}:${remaining}`)) {
        seen.add(`reminder:${obligation.id}:${remaining}`);
        reminders.push({kind: 'reminder', target: obligation.id, application_id: obligation.application_id, ref, title: obligation.title, on: stamp(at), detail: detailFor(remaining)});
      }
      if (remaining < 0 && !baseOverdue && !seen.has(`overdue:${obligation.id}`)) {
        seen.add(`overdue:${obligation.id}`);
        overdue.push({kind: 'overdue', target: obligation.id, application_id: obligation.application_id, ref, title: obligation.title, on: stamp(at), detail: detailFor(remaining)});
      }
      if (ESCALATION_LADDER.includes(tier as Exclude<Tier, 'watch' | 'normal'>) && RANK[tier] > maxRank) {
        maxRank = RANK[tier];
        escalations.push({kind: 'escalation', target: obligation.id, application_id: obligation.application_id, ref, title: obligation.title, on: stamp(at), detail: TIER_TEXT[tier] ?? tier});
      }
    }
  }

  for (const document of input.documents) {
    if (!document.expires_on) continue;
    const expiryDay = dayIndex(Date.parse(document.expires_on));
    if (!Number.isFinite(expiryDay) || expiryDay <= baseDay) continue;
    const at = expiryDay * DAY - IST;
    if (at - input.now > span * DAY) continue;
    expiries.push({kind: 'expiry', target: document.id, application_id: document.application_id, ref: refs.get(document.application_id) ?? null, title: document.file_name, on: stamp(at), detail: 'reviewed validity lapses'});
  }

  return {days: span, base: stamp(input.now), reminders, overdue, escalations, expiries};
}
