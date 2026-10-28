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
  const fmt=(ms:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
  const now=Date.now();
  const due=(days:number)=>fmt(now+days*86400000);
  const day=86400000;

  it('marks fulfilled obligations resolved regardless of due date',()=>{
    expect(delayRiskAdvisory(fmt(now),'fulfilled')).toBe('resolved');
  });

  it('marks overdue open obligations',()=>{
    expect(delayRiskAdvisory(due(-1),'open',now+2*day)).toBe('overdue');
  });

  it('marks near-term open obligations critical/urgent/watch',()=>{
    expect(delayRiskAdvisory(due(3),'open',Date.parse(due(3)+'T00:00:00Z'))).toBe('critical');
    expect(delayRiskAdvisory(due(20),'open',Date.parse(due(20)+'T00:00:00Z')-7*day)).toBe('urgent');
    expect(delayRiskAdvisory(due(45),'open',Date.parse(due(45)+'T00:00:00Z')-31*day)).toBe('watch');
  });

  it('marks distant obligations low',()=>{
    expect(delayRiskAdvisory(due(90),'open',Date.parse(due(90)+'T00:00:00Z')-61*day)).toBe('low');
  });
});
