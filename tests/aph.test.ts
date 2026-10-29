import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
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

  it('maps Fire Safety Certificate to clause 6.17(i)',()=>{
    const clause=aphClauseForDocument('Fire Safety Certificate');
    expect(clause).toBeTruthy();
    expect(clause?.clause_number).toBe('6.17(i)');
    expect(clause?.norm_category).toBe('SAFETY_COMPLIANCE');
  });

  it('cites only clause numbers that exist in the reference handbook',()=>{
    const handbook=readFileSync(resolve(__dirname,'../docs/reference/APH_2024-27.txt'),'utf8');
    for(const clause of APH_CLAUSES){
      const number=clause.clause_number;
      const annexure=/^Annexure-(\d+) §\d+\.\d+$/.exec(number);
      const withSubItem=/^(\d+\.\d+)\(\w\)$/.exec(number);
      const plain=/^\d+\.\d+$/.test(number);
      expect(annexure||withSubItem||plain,`unparsable clause number: ${number}`).toBeTruthy();
      const pattern=annexure
        ? new RegExp(`^ANNEXURE-${annexure![1]}\\s*$`,'m')
        : new RegExp(`^\\s*${(withSubItem?withSubItem[1]:number).replace(/\./g,'\\.')}\\s+[A-Z]`,'m');
      expect(pattern.test(handbook),`${number} (${clause.clause_title}) has no matching heading in APH_2024-27.txt`).toBe(true);
    }
  });

  it('would reject a clause number the handbook does not print',()=>{
    const handbook=readFileSync(resolve(__dirname,'../docs/reference/APH_2024-27.txt'),'utf8');
    for(const withdrawn of ['1.7.3','2.4.2','3.4.1','4.1.1']){
      expect(new RegExp(`^\\s*${withdrawn.replace(/\./g,'\\.')}\\s+[A-Z]`,'m').test(handbook)).toBe(false);
    }
  });

  it('does not carry chapter titles that the handbook assigns to a different chapter',()=>{
    const wrongTitles=[
      'Grant of Approval through Scrutiny & Expert Visit Committee',
      'Norms and Standards for Technical Institutions',
      'Document Verification and Authenticity',
    ];
    for(const clause of APH_CLAUSES)expect(wrongTitles).not.toContain(clause.chapter_title);
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
