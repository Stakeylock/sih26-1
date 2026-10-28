import {describe,expect,it} from 'vitest';
import {APH_CLAUSES,APH_EDITION,aphClauseForDocument} from '../src/domain/aph';
import {delayRiskAdvisory} from '../src/domain/expiry';

describe('APH clause seed',()=>{
  it('exports a dated APH edition with seeded clauses',()=>{
    expect(APH_EDITION).toBe('2026-27');
    expect(APH_CLAUSES.length).toBeGreaterThan(0);
    for(const clause of APH_CLAUSES){
      expect(clause.clause_number.trim().length).toBeGreaterThan(0);
      expect(clause.content_text.trim().length).toBeGreaterThan(0);
      expect(['LAND_REQUIREMENT','SAFETY_COMPLIANCE','FACULTY_STRENGTH','BUILT_UP_AREA','DOCUMENT_AUTHENTICITY','GOVERNANCE']).toContain(clause.norm_category);
    }
  });

  it('maps Fire Safety Certificate to clause 1.7.3',()=>{
    const clause=aphClauseForDocument('Fire Safety Certificate');
    expect(clause).toBeTruthy();
    expect(clause?.clause_number).toBe('1.7.3');
    expect(clause?.norm_category).toBe('SAFETY_COMPLIANCE');
  });

  it('maps Faculty List to faculty strength',()=>{
    const clause=aphClauseForDocument('Faculty List');
    expect(clause?.norm_category).toBe('FACULTY_STRENGTH');
  });

  it('maps Building Plan to built-up area',()=>{
    const clause=aphClauseForDocument('Building Plan');
    expect(clause?.norm_category).toBe('BUILT_UP_AREA');
  });

  it('returns null for unknown document types',()=>{
    expect(aphClauseForDocument('Non Existent Document')).toBeNull();
  });
});

describe('delay risk advisory',()=>{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now());

  it('marks fulfilled obligations resolved regardless of due date',()=>{
    expect(delayRiskAdvisory(today,'fulfilled')).toBe('resolved');
  });

  it('marks overdue open obligations',()=>{
    const yesterday=new Date(Date.now()-86400000);
    const overdue=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(yesterday);
    expect(delayRiskAdvisory(overdue,'open')).toBe('overdue');
  });

  it('marks near-term open obligations critical/urgent/watch',()=>{
    const in3Days=new Date(Date.now()+3*86400000);
    const in3DaysStr=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(in3Days);
    expect(delayRiskAdvisory(in3DaysStr,'open')).toBe('critical');

    const in20Days=new Date(Date.now()+20*86400000);
    const in20DaysStr=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(in20Days);
    expect(delayRiskAdvisory(in20DaysStr,'open')).toBe('urgent');

    const in45Days=new Date(Date.now()+45*86400000);
    const in45DaysStr=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(in45Days);
    expect(delayRiskAdvisory(in45DaysStr,'open')).toBe('watch');
  });

  it('marks distant obligations low',()=>{
    const in90Days=new Date(Date.now()+90*86400000);
    const in90DaysStr=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(in90Days);
    expect(delayRiskAdvisory(in90DaysStr,'open')).toBe('low');
  });
});
