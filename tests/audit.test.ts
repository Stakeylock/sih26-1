import { describe, expect, it } from 'vitest';
import { buildAuditChain, seed } from '../src/data/demo';
import { canonicalAuditPayload, sha256Hex, verifyAuditChain, type AuditEventLike } from '../src/domain/integrity';

async function buildChain(): Promise<AuditEventLike[]> {
  const events: AuditEventLike[] = [];
  let previousHash = '';
  for (const [index, action] of ['created', 'claim_verified', 'deficiency_raised'].entries()) {
    const event: AuditEventLike = {
      application_id: 'demo-app-0',
      sequence: index + 1,
      prev_hash: previousHash,
      actor_id: 'demo-scrutiny',
      actor_role: 'scrutiny_officer',
      action,
      from_status: 'under_scrutiny',
      to_status: 'under_scrutiny',
      reason: 'Synthetic evidence reviewed.',
      payload: { claim: 'FIRE_SAFETY', nested: { beta: 2, alpha: 1 } },
      created_at: '2026-10-23T10:15:30.123Z',
      event_hash: null,
    };
    event.event_hash = await sha256Hex(canonicalAuditPayload(event));
    previousHash = event.event_hash;
    events.push(event);
  }
  return events;
}

describe('canonical audit payload', () => {
  it('is stable across object key order and pads timestamps to microseconds', async () => {
    const [event] = await buildChain();
    const left = canonicalAuditPayload({ ...event, payload: { alpha: 1, beta: { delta: 4, charlie: 3 } } });
    const right = canonicalAuditPayload({ ...event, payload: { beta: { charlie: 3, delta: 4 }, alpha: 1 } });
    expect(left).toBe(right);
    expect(left).toContain('2026-10-23T10:15:30.123000Z');
    expect(left).toContain('{"alpha":1,"beta":{"charlie":3,"delta":4}}');
  });

  it('rejects an invalid sequence', async () => {
    const [event] = await buildChain();
    expect(() => canonicalAuditPayload({ ...event, sequence: 0 })).toThrow('positive integer');
  });
});

describe('audit chain verification', () => {
  it('accepts an intact chain in any input order', async () => {
    const events = await buildChain();
    const result = await verifyAuditChain([events[2], events[0], events[1]]);
    expect(result).toEqual({ intact: true, checked: 3, head: events[2].event_hash, broken_at: null });
  });

  it('returns an empty verification for an empty chain', async () => {
    await expect(verifyAuditChain([])).resolves.toEqual({ intact: true, checked: 0, head: null, broken_at: null });
  });

  it('detects a changed event payload', async () => {
    const events = await buildChain();
    const tampered = events.map(event => ({ ...event }));
    tampered[1].reason = 'Replaced after the fact.';
    await expect(verifyAuditChain(tampered)).resolves.toEqual({ intact: false, checked: 1, head: events[0].event_hash, broken_at: 2 });
  });

  it('detects a recomputed event hash through the next prev_hash', async () => {
    const events = await buildChain();
    const tampered = events.map(event => ({ ...event }));
    tampered[1].reason = 'Replaced after the fact.';
    tampered[1].event_hash = await sha256Hex(canonicalAuditPayload(tampered[1]));
    await expect(verifyAuditChain(tampered)).resolves.toMatchObject({ intact: false, broken_at: 3 });
  });

  it('detects a missing sequence', async () => {
    const events = await buildChain();
    const result = await verifyAuditChain(events.filter(event => event.sequence !== 2));
    expect(result).toMatchObject({ intact: false, checked: 1, broken_at: 2 });
  });

  it('hashes known input deterministically', async () => {
    await expect(sha256Hex('abc')).resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('demo audit chain', () => {
  it('chains seeded events by time and application without mutating them', async () => {
    const workspace = seed();
    const source = workspace.events.filter(event => event.application_id === 'demo-app-0');
    const before = structuredClone(source);
    const chained = await buildAuditChain(source);
    expect(source).toEqual(before);
    expect(chained.map(event => event.sequence)).toEqual(chained.map((_, index) => index + 1));
    await expect(verifyAuditChain(chained)).resolves.toMatchObject({ intact: true, checked: chained.length });
    await expect(verifyAuditChain(source)).resolves.toMatchObject({ intact: false });
  });

  it('detects a tampered copy of a seeded event', async () => {
    const workspace = seed();
    const chained = await buildAuditChain(workspace.events.filter(event => event.application_id === 'demo-app-0'));
    const target = Math.max(1, Math.ceil(chained.length / 2));
    const tampered = chained.map((event, index) => index === target - 1 ? { ...event, reason: `${event.reason ?? 'Synthetic event'} [tamper replay on copy]` } : event);
    await expect(verifyAuditChain(tampered)).resolves.toMatchObject({ intact: false, broken_at: target });
  });
});
