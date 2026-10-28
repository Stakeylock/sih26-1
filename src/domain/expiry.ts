import {demoNow} from './virtualClock';

const DAY = 86400000;

export type ExpiryState = 'expired' | 'urgent' | 'warning' | 'ok' | 'none';

export function expiryState(expiresOn: string | null | undefined, now: number = demoNow()): ExpiryState {
  if (!expiresOn) return 'none';
  const due = Date.parse(expiresOn);
  if (!Number.isFinite(due)) return 'none';
  const remaining = Math.floor((due + DAY - now) / DAY);
  if (remaining < 0) return 'expired';
  if (remaining <= 30) return 'urgent';
  if (remaining <= 60) return 'warning';
  return 'ok';
}

/**
 * Advisory-only delay-risk level for an obligation.
 * Never mutates workflow state; exists only to inform reviewer scheduling.
 */
export function delayRiskAdvisory(dueDate: string | null | undefined, status: string, now: number = demoNow()): string {
  if (!dueDate) return 'unknown';
  const due = Date.parse(dueDate);
  if (!Number.isFinite(due)) return 'unknown';
  const normalized = (status ?? '').toLowerCase();
  if (['fulfilled','closed','cancelled','waived'].includes(normalized)) return 'resolved';
  const remaining = Math.floor((due + DAY - now) / DAY);
  if (remaining < 0) return 'overdue';
  if (remaining <= 7) return 'critical';
  if (remaining <= 30) return 'urgent';
  if (remaining <= 60) return 'watch';
  return 'low';
}
