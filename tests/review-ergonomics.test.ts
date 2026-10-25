import {describe, expect, it} from 'vitest';
import {deficiencyTemplates} from '../src/domain/deficiencyTemplates';
import {evidenceNorms} from '../src/domain/norms';
import {expiryState} from '../src/domain/expiry';
import type {Claim, Requirement} from '../src/domain/integrity';

const claim = {
  id: 'claim-1', requirement_id: 'req-1', statement_snapshot: 'Fire safety certificate is valid on the scrutiny date',
  clause_snapshot: 'APH safety', evidence_types_snapshot: ['Fire Safety Certificate', 'Land Document'],
} as unknown as Claim;

describe('deficiencyTemplates', () => {
  it('drafts claim-grounded observation and remedy text with the evidence types', () => {
    const templates = deficiencyTemplates(claim);
    expect(templates).toHaveLength(3);
    for (const template of templates) {
      expect(template.observation.length).toBeGreaterThanOrEqual(10);
      expect(template.remedy.length).toBeGreaterThanOrEqual(10);
    }
    expect(new Set(templates.map(template => template.label)).size).toBe(3);
    expect(templates[0].observation).toContain('Fire safety certificate is valid on the scrutiny date');
    expect(templates[0].remedy).toContain('Fire Safety Certificate');
  });

  it('stays valid when a claim lists no evidence types', () => {
    const templates = deficiencyTemplates({...claim, evidence_types_snapshot: []} as unknown as Claim);
    expect(templates[0].remedy).toContain('required');
    for (const template of templates) {
      expect(template.observation.length).toBeGreaterThanOrEqual(10);
      expect(template.remedy.length).toBeGreaterThanOrEqual(10);
    }
  });
});

const requirements = [
  {id: 'req-1', code: 'FIRE_SAFETY', clause: 'APH safety', statement: 'Fire safety certificate is valid on the scrutiny date', evidence_types: ['Fire Safety Certificate'], version: 1},
  {id: 'req-2', code: 'LAND_OWNERSHIP', clause: 'APH land', statement: 'Land ownership or lease is valid for the academic year', evidence_types: ['Land Document'], version: 1},
  {id: 'req-3', code: 'OTHER', clause: 'other clause', statement: 'Not part of this case', evidence_types: ['Visa Document'], version: 1},
] as unknown as Requirement[];

describe('evidenceNorms', () => {
  it('maps each required document kind to its case-recorded APH norm once', () => {
    const claims = [
      {requirement_id: 'req-2', evidence_types_snapshot: ['Land Document']},
      {requirement_id: 'req-1', evidence_types_snapshot: ['Fire Safety Certificate', 'Fire Safety Certificate']},
      {requirement_id: 'req-3', evidence_types_snapshot: ['Visa Document']},
      {requirement_id: 'unknown', evidence_types_snapshot: ['Ghost Document']},
    ] as unknown as Claim[];
    const norms = evidenceNorms(claims, requirements);
    expect(norms.map(norm => norm.docType)).toEqual(['Fire Safety Certificate', 'Land Document', 'Visa Document']);
    expect(norms.find(norm => norm.docType === 'Land Document')?.clause).toBe('APH land');
    expect(norms.find(norm => norm.docType === 'Fire Safety Certificate')?.statement).toBe('Fire safety certificate is valid on the scrutiny date');
  });

  it('returns nothing without claims', () => {
    expect(evidenceNorms([], requirements)).toEqual([]);
  });
});

describe('expiryState', () => {
  const day = 86400000;
  it('tiers expiry dates expired / urgent / warning / ok', () => {
    const now = Date.parse('2026-10-25T09:00:00Z');
    expect(expiryState('2026-10-24', now)).toBe('expired');
    expect(expiryState('2026-10-25', now)).toBe('urgent');
    expect(expiryState('2026-11-24', now)).toBe('urgent');
    expect(expiryState('2026-11-25', now)).toBe('warning');
    expect(expiryState('2026-12-24', now)).toBe('warning');
    expect(expiryState('2026-12-25', now)).toBe('ok');
    expect(expiryState(null, now)).toBe('none');
  });

  it('shifts when the simulated demo clock moves now', () => {
    const now = Date.parse('2026-10-25T09:00:00Z');
    expect(expiryState('2026-11-24', now)).toBe('urgent');
    expect(expiryState('2026-11-24', now + 40 * day, 0)).toBe('expired');
  });
});
