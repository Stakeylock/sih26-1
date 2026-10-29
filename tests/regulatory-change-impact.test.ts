// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createDemoRepository } from '../src/data/demo';

const STORAGE = 'clauseway-isolated-demo-v12';

describe('regulatory change impact analysis', () => {
  beforeEach(() => { localStorage.removeItem(STORAGE); });
  afterEach(() => { localStorage.removeItem(STORAGE); });

  it('returns seeded regulatory changes', async () => {
    const repo = await createDemoRepository('national_admin');
    const changes = await repo.getRegulatoryChanges();
    expect(changes.length).toBeGreaterThanOrEqual(1);
    const seeded = changes.find(item => item.id === 'demo-reg-change-1');
    expect(seeded).toBeDefined();
    expect(seeded?.status).toBe('reviewed');
    expect(seeded?.latest_version).toBe(2);
  });

  it('returns versions for a change', async () => {
    const repo = await createDemoRepository('national_admin');
    const versions = await repo.getRegulatoryChangeVersions('demo-reg-change-1');
    expect(versions.length).toBe(2);
    expect(versions.map(v => v.version)).toEqual([1, 2]);
  });

  it('rejects version recording by non-admin', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    await expect(repo.recordRegulatoryChangeVersion('demo-reg-change-2', {
      requirement_code: 'SANCTIONED_INTAKE', requirement_app_type: 'extension_self_disclosure',
      clause: null, statement: 'New statement.', evidence_types: null,
      verification_method: null, is_mandatory: null,
      source_url: 'demo://policy/intake-variance-2027', source_version: '1.1',
      source_hash: '0'.repeat(64), publication_date: new Date().toISOString(),
      effective_date: new Date().toISOString(), academic_year_start: 2027,
      change_summary: 'Draft version.',
    })).rejects.toThrow();
  });

  it('previews impact for a change version', async () => {
    const repo = await createDemoRepository('national_admin');
    const impact = await repo.previewRegulatoryChangeImpact('demo-reg-change-1', 2);
    expect(impact.change_id).toBe('demo-reg-change-1');
    expect(impact.change_version).toBe(2);
    expect(impact.items.length).toBeGreaterThan(0);
    expect(impact.items.some(item => item.field === 'statement')).toBe(true);
  });

  it('activates a reviewed change and applies to requirement registry', async () => {
    const repo = await createDemoRepository('national_admin');
    await repo.activateRegulatoryChange('demo-reg-change-1', 'Activating the academic-year rule change.', 'request-act-1');
    const change = (await repo.getRegulatoryChanges()).find(item => item.id === 'demo-reg-change-1');
    expect(change?.status).toBe('activated');
    expect(change?.activated_by).toBe('demo-national');
  });

  it('rejects activation by non-admin', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    await expect(repo.activateRegulatoryChange('demo-reg-change-1', 'Activating change.', 'request-act-2')).rejects.toThrow();
  });
});
