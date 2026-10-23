import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, database, failure, ids, readyClaims, scalar, transition } from './database';

let db: PGlite;
beforeAll(async () => { db = await database(); }, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('reset role; rollback'); });

const verifyAll = async (claims: Record<string, string>) => {
  for (const claim of Object.values(claims)) await db.query(`select public.fp_verify_claim($1,'verified','Synthetic verification against the demo record.')`, [claim]);
};
const status = (claim: string) => scalar<string>(db, 'select status::text from public.application_claims where id=$1', [claim]);

describe('claim evidence and verification', () => {
  it('links and verifies a claim, and blocks the owner from reviewing it', async () => {
    const { claims } = await readyClaims(db);
    await as(db, ids.institution);
    expect(await failure(db, `select public.fp_verify_claim($1,'verified','Owner review')`, [claims.INSTITUTION_IDENTITY])).toContain('Assigned scrutiny');
    expect(await failure(db, `select public.fp_raise_deficiency($1,'Missing synthetic evidence.','Upload the synthetic evidence.',now()+interval '7 days')`, [claims.INSTITUTION_IDENTITY])).toContain('Assigned scrutiny');
    await as(db, ids.scrutiny);
    await db.query(`select public.fp_verify_claim($1,'verified','Synthetic identity check against the trust record.')`, [claims.INSTITUTION_IDENTITY]);
    expect(await status(claims.INSTITUTION_IDENTITY)).toBe('verified');
    expect(await scalar<number>(db, `select count(*)::int from public.application_events where action='claim_verified'`)).toBe(1);
  });

  it('requires a reason to mark a claim not applicable', async () => {
    const { claims } = await readyClaims(db);
    await as(db, ids.scrutiny);
    expect(await failure(db, `select public.fp_verify_claim($1,'not_applicable','short')`, [claims.BUILT_UP_AREA])).toContain('10 characters');
    await db.query(`select public.fp_verify_claim($1,'not_applicable','The synthetic building plan is not applicable to this demo.')`, [claims.BUILT_UP_AREA]);
    expect(await status(claims.BUILT_UP_AREA)).toBe('not_applicable');
  });

  it('blocks verification when the linked evidence is expired', async () => {
    const { id, claims } = await readyClaims(db);
    await db.exec('reset role');
    await db.query(`update public.application_documents set expires_on=current_date-1 where id=(select document_id from public.claim_evidence where claim_id=$1)`,[claims.FIRE_SAFETY]);
    await as(db, ids.scrutiny);
    const version = await scalar<number>(db, 'select version from public.applications where id=$1', [id]);
    expect(await failure(db, `select public.fp_verify_claim($1,'verified','Expired certificate')`, [claims.FIRE_SAFETY])).toContain('current clean evidence');
    expect(await failure(db, `select public.fp_transition($1,'pass_scrutiny','All synthetic claims reviewed','{"evc":false}',$2,$3)`, [id, version, crypto.randomUUID()])).toContain('mandatory claim');
  });

  it('unlinks evidence and makes verification fail', async () => {
    const { claims, docs } = await readyClaims(db);
    await as(db, ids.scrutiny);
    await db.query('select public.fp_unlink_claim_evidence($1,$2)', [claims.ACADEMIC_YEAR, docs.Affidavit]);
    expect(await failure(db, `select public.fp_verify_claim($1,'verified','No evidence')`, [claims.ACADEMIC_YEAR])).toContain('current clean evidence');
  });
});

describe('deficiency loop', () => {
  it('raises, resolves, and rechecks a deficiency', async () => {
    const { id, claims, docs } = await readyClaims(db);
    await as(db, ids.scrutiny);
    const version = await scalar<number>(db, 'select version from public.applications where id=$1', [id]);
    const deficiency = await scalar<string>(db, `select public.fp_raise_deficiency($1,'The synthetic building plan is missing.','Upload a current synthetic building plan.',now()+interval '7 days')`, [claims.BUILT_UP_AREA]);
    expect(await status(claims.BUILT_UP_AREA)).toBe('deficient');
    expect(await scalar<string>(db, 'select status::text from public.deficiencies where id=$1', [deficiency])).toBe('open');
    expect(await failure(db, `select public.fp_transition($1,'pass_scrutiny','All synthetic claims reviewed','{"evc":false}',$2,$3)`, [id, version, crypto.randomUUID()])).toContain('mandatory claim');
    await as(db, ids.institution);
    await db.query(`select public.fp_resolve_deficiency($1,$2,'Uploaded the current synthetic building plan.')`, [deficiency, docs['Building Plan']]);
    expect(await scalar<string>(db, 'select status::text from public.deficiencies where id=$1', [deficiency])).toBe('resolved');
    expect(await status(claims.BUILT_UP_AREA)).toBe('unverified');
    await as(db, ids.scrutiny);
    await db.query(`select public.fp_recheck_deficiency($1,'accepted','Synthetic plan accepted after re-check.')`, [deficiency]);
    expect(await status(claims.BUILT_UP_AREA)).toBe('verified');
  });

  it('blocks resubmission while a deficiency is open and allows it after resolution', async () => {
    const { id, claims, docs } = await readyClaims(db);
    await as(db, ids.scrutiny);
    await transition(db, id, 'raise_deficiency', 'The synthetic fire certificate is expired.', { claim_id: claims.FIRE_SAFETY, remedy: 'Upload a current synthetic fire certificate.', due_at: new Date(Date.now() + 7 * 86400000).toISOString() });
    const deficiency = await scalar<string>(db, `select id from public.deficiencies where claim_id=$1 and status='open'`, [claims.FIRE_SAFETY]);
    await as(db, ids.institution);
    const version = await scalar<number>(db, 'select version from public.applications where id=$1', [id]);
    expect(await failure(db, `select public.fp_transition($1,'resubmit','Corrected the synthetic evidence.','{}',$2,$3)`, [id, version, crypto.randomUUID()])).toContain('Resolve or waive');
    await db.query(`select public.fp_resolve_deficiency($1,$2,'Uploaded the current synthetic fire certificate.')`, [deficiency, docs['Fire Safety Certificate']]);
    expect((await transition(db, id, 'resubmit', 'Corrected the synthetic evidence.')).status).toBe('resubmitted');
  });
});

describe('decision gate and signals', () => {
  it('blocks a confirmed signal and clears it after an explanation', async () => {
    const { id, claims, docs } = await readyClaims(db);
    await as(db, ids.scrutiny);
    await verifyAll(claims);
    await db.exec('reset role');
    const signal = await scalar<string>(db, `insert into public.integrity_signals(application_id,signal_type,severity,fingerprint,detail) values($1,'duplicate_document','warning','demo-fingerprint','{}') returning id`, [id]);
    await as(db, ids.scrutiny);
    await db.query(`select public.fp_disposition_signal($1,'confirmed','Confirmed duplicate synthetic certificate.')`, [signal]);
    const version = await scalar<number>(db, 'select version from public.applications where id=$1', [id]);
    expect(await failure(db, `select public.fp_transition($1,'pass_scrutiny','All synthetic claims reviewed','{"evc":false}',$2,$3)`, [id, version, crypto.randomUUID()])).toContain('confirmed integrity signal');
    await db.query(`select public.fp_disposition_signal($1,'explained','The duplicate is an expected synthetic fixture.')`, [signal]);
    expect((await transition(db, id, 'pass_scrutiny', 'All synthetic claims reviewed.', { evc: false })).status).toBe('pending_decision');
    await as(db, ids.regional);
    expect((await transition(db, id, 'approve', 'Synthetic evidence reviewed; demo decision only.', { evidence: docs.Affidavit })).status).toBe('approved');
  });

  it('passes scrutiny only when every mandatory claim is verified', async () => {
    const { id, claims } = await readyClaims(db);
    await as(db, ids.scrutiny);
    const version = await scalar<number>(db, 'select version from public.applications where id=$1', [id]);
    expect(await failure(db, `select public.fp_transition($1,'pass_scrutiny','All synthetic claims reviewed','{"evc":false}',$2,$3)`, [id, version, crypto.randomUUID()])).toContain('mandatory claim');
    await verifyAll(claims);
    expect((await transition(db, id, 'pass_scrutiny', 'All synthetic claims reviewed.', { evc: false })).status).toBe('pending_decision');
  });
});
