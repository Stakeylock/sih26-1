import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { AuditVerification } from '../src/domain/integrity';
import { as, database, failure, ids, readyClaims, scalar } from './database';

let db: PGlite;
beforeAll(async () => { db = await database(); }, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('reset role; rollback'); });

const verify = (id: string) => scalar<AuditVerification>(db, 'select public.fp_verify_audit_chain($1)', [id]);
const head = (id: string) => scalar<string | null>(db, 'select event_hash from public.application_events where application_id=$1 order by sequence desc limit 1', [id]);
const count = (id: string) => scalar<number>(db, 'select count(*)::int from public.application_events where application_id=$1', [id]);

describe('audit chain', () => {
  it('backfills and appends a contiguous chain used by every event', async () => {
    const { id, claims } = await readyClaims(db);
    const first = await verify(id);
    expect(first.intact).toBe(true);
    expect(first.checked).toBe(await count(id));
    expect(first.head).toMatch(/^[a-f0-9]{64}$/);
    expect(await scalar<number>(db, `
      select count(*)::int from public.application_events
      where application_id=$1 and (sequence is null or prev_hash is null or event_hash is null)
    `, [id])).toBe(0);

    await as(db, ids.scrutiny);
    await db.query(`select public.fp_verify_claim($1,'verified','Synthetic identity check against the trust record.')`, [claims.INSTITUTION_IDENTITY]);
    const second = await verify(id);
    expect(second.intact).toBe(true);
    expect(second.checked).toBe(first.checked + 1);
    expect(second.head).not.toBe(first.head);
  });

  it('replays tamper on a copy without mutating stored events', async () => {
    const { id } = await readyClaims(db);
    await as(db, ids.scrutiny);
    const beforeHead = await head(id);
    const beforeCount = await count(id);

    const result = await scalar<AuditVerification & { replay: boolean; tampered_at: number }>(
      db,
      'select public.fp_demo_tamper_replay($1)',
      [id],
    );

    expect(result).toMatchObject({ intact: false, replay: true });
    expect(result.broken_at).toBe(result.tampered_at);
    expect(await head(id)).toBe(beforeHead);
    expect(await count(id)).toBe(beforeCount);
    expect(await verify(id)).toMatchObject({ intact: true, checked: beforeCount, head: beforeHead });
  });

  it('blocks a decision when the stored chain is broken', async () => {
    const { id } = await readyClaims(db);
    const version = await scalar<number>(db, 'select version from public.applications where id=$1', [id]);

    await db.exec('reset role');
    await db.exec('alter table public.application_events disable trigger trg_events_immutable');
    await db.query(`update public.application_events set reason='Forged after the fact' where application_id=$1 and sequence=2`, [id]);
    await db.exec('alter table public.application_events enable trigger trg_events_immutable');

    await as(db, ids.scrutiny);
    expect(await verify(id)).toMatchObject({ intact: false, broken_at: 2 });
    expect(await failure(
      db,
      `select public.fp_transition($1,'pass_scrutiny','All synthetic claims reviewed','{"evc":false}',$2,$3)`,
      [id, version, crypto.randomUUID()],
    )).toContain('audit chain');
  });
});
