// @vitest-environment happy-dom
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {createHash,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createDemoRepository,seed} from '../src/data/demo';
import type {DocumentRecord} from '../src/domain/model';

const root=process.cwd();
const manifest=(JSON.parse(readFileSync(join(root,'src','data','sample-pdfs.json'),'utf8')) as {samples:Record<string,{sha256:string;bytes:number}>}).samples;

const fetched:string[]=[];
const blobs:Blob[]=[];
const clicked:HTMLAnchorElement[]=[];
const originalCreateObjectURL=URL.createObjectURL;
const originalRevokeObjectURL=URL.revokeObjectURL;

function documentById(id:string):DocumentRecord{
  const record=seed().documents.find(document=>document.id===id);
  if(!record)throw new Error('Missing seeded document fixture: '+id);
  return record;
}

beforeAll(()=>{
  // happy-dom does not expose WebCrypto's subtle digest; the browser API is provided by Node.
  if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  vi.stubGlobal('fetch',vi.fn(async (input:unknown)=>{
    const path=String(input);
    fetched.push(path);
    const name=path.replace(/^\/samples\//,'');
    if(!(name in manifest))return {ok:false,status:404} as Response;
    const bytes=readFileSync(join(root,'public','samples',name));
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
    return {ok:true,status:200,arrayBuffer:async()=>buffer} as Response;
  }));
  URL.createObjectURL=(blob:Blob)=>{blobs.push(blob);return `blob:sample-${blobs.length}`;};
  URL.revokeObjectURL=()=>{};
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){clicked.push(this);});
});

afterAll(()=>{
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  URL.createObjectURL=originalCreateObjectURL;
  URL.revokeObjectURL=originalRevokeObjectURL;
});

describe('demo sample downloads',()=>{
  it('serves the recorded sample bytes for a clean seeded document',async()=>{
    const repo=await createDemoRepository('national_admin');
    const clean=documentById('demo-doc-demo-app-0-5');
    expect(clean.file_path).toBe('/samples/demo-doc-demo-app-0-5.pdf');
    expect(clean.sample_sha256).toBe(manifest['demo-doc-demo-app-0-5.pdf'].sha256);
    await repo.download(clean);
    expect(fetched).toContain('/samples/demo-doc-demo-app-0-5.pdf');
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('application/pdf');
    expect(blobs[0].size).toBe(manifest['demo-doc-demo-app-0-5.pdf'].bytes);
    const served=Buffer.from(await blobs[0].arrayBuffer());
    expect(createHash('sha256').update(served).digest('hex')).toBe(clean.sample_sha256);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('fire_safety_certificate_valid.pdf');
  });

  it('refuses an expired document even though its scan is clean',async()=>{
    const repo=await createDemoRepository('national_admin');
    const expired=documentById('demo-doc-demo-app-0-1');
    expect(expired.scan_status).toBe('clean');
    const before=fetched.length;
    await expect(repo.download(expired)).rejects.toThrow(/Expired documents stay on file/);
    expect(fetched).toHaveLength(before);
  });

  it('refuses a quarantined document',async()=>{
    const repo=await createDemoRepository('national_admin');
    const quarantined:DocumentRecord={...documentById('demo-doc-demo-app-0-5'),scan_status:'pending'};
    await expect(repo.download(quarantined)).rejects.toThrow(/Quarantined documents are not downloadable/);
  });

  it('refuses a clean document that has no generated sample bytes',async()=>{
    const repo=await createDemoRepository('national_admin');
    const withoutAsset:DocumentRecord={...documentById('demo-doc-demo-app-0-5'),file_path:'demo-only'};
    await expect(repo.download(withoutAsset)).rejects.toThrow(/No generated sample bytes exist/);
  });

  it('refuses when the served bytes do not match the recorded checksum',async()=>{
    const repo=await createDemoRepository('national_admin');
    const mismatched:DocumentRecord={...documentById('demo-doc-demo-app-0-5'),sample_sha256:'0'.repeat(64)};
    await expect(repo.download(mismatched)).rejects.toThrow(/do not match the recorded checksum/);
  });
});
