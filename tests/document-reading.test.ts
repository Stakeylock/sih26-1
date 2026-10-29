import {describe,expect,it} from 'vitest';
import {compareSuggestion,strictDate,suggestFields} from '../src/domain/documentReading';
describe('document field suggestions',()=>{
 it('retains page/source provenance and distinguishes comparison from verification',()=>{const r=suggestFields([{page:2,text:'Issuer: Synthetic Review Office\nDocument number: DEMO-123\nExpiry date: 2027-10-29',method:'ocr',confidence:87}]);expect(r.fields).toHaveLength(3);expect(r.fields[2]).toMatchObject({key:'expires_on',value:'2027-10-29',page:2,excerpt:'Expiry date: 2027-10-29',confidence:87});expect(compareSuggestion(r.fields[2],'2026-10-29')).toBe('Differs from record');});
 it('refuses ambiguous and impossible dates, including leap-day rollover',()=>{expect(strictDate('01/02/2026')).toBeNull();expect(strictDate('2026-02-29')).toBeNull();expect(strictDate('2028-02-29')).toBe('2028-02-29');expect(strictDate('29 October 2026')).toBe('2026-10-29');});
 it('surfaces conflicting field candidates instead of selecting one silently',()=>{const r=suggestFields([{page:1,text:'Expiry date: 2027-01-01\nExpiry date: 2028-01-01',method:'pdf_text',confidence:null}]);expect(r.fields).toHaveLength(2);expect(r.warnings.join(' ')).toContain('Multiple expiry date');});
 it('does not infer fields from marketing or an unsupported document',()=>{expect(suggestFields([{page:1,text:'This paper is definitely valid and verified.',method:'ocr',confidence:99}]).fields).toEqual([]);});
});
