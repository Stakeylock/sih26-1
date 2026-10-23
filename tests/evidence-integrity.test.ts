import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, database, failure, ids, readyClaims, scalar, upload } from './database';

let db: PGlite;
beforeAll(async () => { db = await database(); }, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('reset role; rollback'); });

async function secondCase() {
  await as(db, ids.institution);
  return scalar<string>(db, `select public.fp_create_application('extension_self_disclosure','Synthetic duplicate case')`);
}

describe('evidence integrity', () => {
  it('generates expiry and duplicate signals idempotently', async () => {
    const { id, docs } = await readyClaims(db);
    await db.exec('reset role');
    await db.query(`update public.application_documents set expires_on=current_date-1 where id=$1`, [docs['Fire Safety Certificate']]);
    expect(await scalar<number>(db, `select count(*)::int from public.integrity_signals where application_id=$1 and signal_type='expired_document'`, [id])).toBe(1);

    const second = await secondCase();
    const duplicate = await upload(db, second, 'Affidavit', '01'.repeat(32));
    expect(await scalar<number>(db, `select count(*)::int from public.integrity_signals where document_id=$1 and signal_type='duplicate_document'`, [duplicate])).toBe(1);

    await db.exec('reset role');
    await db.query('select fp_private.document_integrity($1)', [duplicate]);
    expect(await scalar<number>(db, `select count(*)::int from public.integrity_signals where document_id=$1 and signal_type='duplicate_document'`, [duplicate])).toBe(1);
  });

  it('returns a scoped passport with duplicate use, linked claims, and signals', async () => {
    const { docs } = await readyClaims(db);
    const second = await secondCase();
    const duplicate = await upload(db, second, 'Affidavit', '01'.repeat(32));
    await as(db, ids.institution);

    const duplicatePassport = await scalar<string>(db, 'select public.fp_document_passport($1)::text', [duplicate]);
    expect(duplicatePassport).toContain('duplicate_document');
    expect(duplicatePassport).toContain(docs.Affidavit);

    await as(db, ids.scrutiny);
    const linkedPassport = await scalar<string>(db, 'select public.fp_document_passport($1)::text', [docs.Affidavit]);
    expect(linkedPassport).toContain('APH identity');
  });

  it('keeps the passport unavailable to an unrelated institution', async () => {
    const { docs } = await readyClaims(db);
    await as(db, ids.other);
    expect(await failure(db, 'select public.fp_document_passport($1)::text', [docs.Affidavit])).toContain('Document unavailable');
  });
});
