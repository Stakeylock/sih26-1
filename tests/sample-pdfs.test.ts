import {describe,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=process.cwd();
const generator=join(root,'scripts','generate-sample-pdfs.mjs');
const samplesDir=join(root,'public','samples');
const manifestFile=join(root,'src','data','sample-pdfs.json');
type Manifest={generator:string;samples:Record<string,{sha256:string;bytes:number}>};
const manifest=JSON.parse(readFileSync(manifestFile,'utf8')) as Manifest;

function generate(out:string,manifestPath:string):void{
  execFileSync(process.execPath,[generator,'--out',out,'--manifest',manifestPath],{cwd:root,encoding:'utf8'});
}

describe('generated sample PDFs',()=>{
  it('start with %PDF-1.4 and carry the SAMPLE watermark token',()=>{
    const files=Object.keys(manifest.samples);
    expect(files.length).toBeGreaterThanOrEqual(37);
    for(const file of files){
      const bytes=readFileSync(join(samplesDir,file));
      expect(bytes.subarray(0,8).toString('latin1'),file).toBe('%PDF-1.4');
      expect(bytes.toString('latin1'),file).toContain('SAMPLE');
      expect(bytes.toString('latin1'),file).toContain('SYNTHETIC SAMPLE');
    }
  });

  it('produces identical bytes on two runs',()=>{
    const first=mkdtempSync(join(tmpdir(),'sample-pdf-a-'));
    const second=mkdtempSync(join(tmpdir(),'sample-pdf-b-'));
    try{
      generate(first,join(first,'manifest.json'));
      generate(second,join(second,'manifest.json'));
      const runA=readdirSync(first).filter(file=>file.endsWith('.pdf')).sort();
      const runB=readdirSync(second).filter(file=>file.endsWith('.pdf')).sort();
      expect(runA).toEqual(runB);
      expect(runA).toEqual(Object.keys(manifest.samples).sort());
      for(const file of runA){
        expect(readFileSync(join(first,file)).equals(readFileSync(join(second,file))),file).toBe(true);
      }
      expect(readFileSync(join(first,'manifest.json'),'utf8')).toBe(readFileSync(join(second,'manifest.json'),'utf8'));
    }finally{
      rmSync(first,{recursive:true,force:true});
      rmSync(second,{recursive:true,force:true});
    }
  });

  it('matches the committed checksum manifest',()=>{
    const committed=readdirSync(samplesDir).filter(file=>file.endsWith('.pdf')).sort();
    expect(committed).toEqual(Object.keys(manifest.samples).sort());
    for(const [file,fixture] of Object.entries(manifest.samples)){
      const bytes=readFileSync(join(samplesDir,file));
      expect(bytes.length,file).toBe(fixture.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'),file).toBe(fixture.sha256);
    }
  });

  it('reproduces the committed bytes when regenerated into a temp directory',()=>{
    const out=mkdtempSync(join(tmpdir(),'sample-pdf-c-'));
    try{
      generate(out,join(out,'manifest.json'));
      for(const file of Object.keys(manifest.samples)){
        expect(readFileSync(join(out,file)).equals(readFileSync(join(samplesDir,file))),file).toBe(true);
      }
    }finally{
      rmSync(out,{recursive:true,force:true});
    }
  });
});
