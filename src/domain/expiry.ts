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
