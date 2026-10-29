import {expect,it} from 'vitest';
import {visibleEvidenceMatches} from '../src/domain/evidenceRelationships';
import {seed} from '../src/data/demo';
it('does not disclose references or documents outside the loaded case scope',()=>{const data=seed();const groups=visibleEvidenceMatches(data);expect(groups.length).toBeGreaterThan(0);const one={...data,applications:data.applications.filter(a=>a.id==='demo-app-0')};expect(visibleEvidenceMatches(one)).toEqual([]);});
