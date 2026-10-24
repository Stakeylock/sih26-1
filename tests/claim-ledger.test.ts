import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, database, draft, failure, ids, scalar } from './database';

let db: PGlite;
beforeAll(async () => { db = await database(); }, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('reset role; rollback'); });

describe('claim ledger schema', () => {
  it('seeds nine active requirements for the self-disclosure route', async () => {
    expect(await scalar<number>(db, `select count(*)::int from public.requirements where app_type='extension_self_disclosure' and active`)).toBe(9);
  });

  it('creates nine unverified claims for a new extension application', async () => {
    const id = await draft(db, 'extension_self_disclosure');
    expect(await scalar<number>(db, `select count(*)::int from public.application_claims where application_id=$1`, [id])).toBe(9);
    expect(await scalar<number>(db, `select count(*)::int from public.application_claims where application_id=$1 and status='unverified'`, [id])).toBe(9);
  });

  it('snapshots requirement text and method onto each claim', async () => {
    const id = await draft(db, 'extension_self_disclosure');
    const row = await db.query<{ code: string; statement_snapshot: string; clause_snapshot: string; verification_method: string }>(`
      select r.code,c.statement_snapshot,c.clause_snapshot,c.verification_method::text
      from public.application_claims c join public.requirements r on r.id=c.requirement_id
      where c.application_id=$1 order by r.sort_order limit 1
    `, [id]);
    expect(row.rows[0]).toEqual({
      code: 'INSTITUTION_IDENTITY',
      statement_snapshot: 'Institution name and reference match the trust record',
      clause_snapshot: 'APH identity',
      verification_method: 'cross_check',
    });
  });

  it('does not create claims for a route without requirements', async () => {
    const id = await draft(db, 'new_programme');
    expect(await scalar<number>(db, `select count(*)::int from public.application_claims where application_id=$1`, [id])).toBe(0);
  });
});

describe('claim ledger authorization', () => {
  it('hides claims from another institution', async () => {
    await draft(db, 'extension_self_disclosure');
    await as(db, ids.other);
    expect(await scalar<number>(db, 'select count(*)::int from public.application_claims')).toBe(0);
  });

  it('denies direct claim and deficiency writes', async () => {
    await draft(db, 'extension_self_disclosure');
    expect(await failure(db, 'delete from public.application_claims')).toContain('permission denied');
    expect(await failure(db, `update public.deficiencies set status='resolved'`)).toContain('permission denied');
    expect(await failure(db, `insert into public.claim_evidence(claim_id,document_id,linked_by) values(gen_random_uuid(),gen_random_uuid(),auth.uid())`)).toContain('permission denied');
  });

  it('denies anonymous requirement reads', async () => {
    await as(db, ids.institution, 'anon');
    expect(await failure(db, 'select * from public.requirements')).toContain('permission denied');
  });

  it('keeps requirements read-only for authenticated users', async () => {
    await as(db, ids.institution);
    expect(await failure(db, `update public.requirements set statement='forged'`)).toContain('permission denied');
  });
});
