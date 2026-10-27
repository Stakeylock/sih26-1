import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {demoIdentities,seed} from '../src/data/demo';
import type {DocumentRecord,Repository} from '../src/domain/model';
import type {Run} from '../src/ui/Applications';
import {CaseWorkspace} from '../src/ui/CaseWorkspace';

describe('case renewal guidance',()=>{
  it('renders read-only renewal guidance for a closed case with an expired document',()=>{
    const data=seed();
    const application=data.applications.find(item=>item.id==='demo-app-8');
    const identity=demoIdentities.find(item=>item.roles[0]?.role==='national_admin');
    if(!application||!identity)throw new Error('Missing seeded renewal fixture.');
    const template=data.documents[0];
    if(!template)throw new Error('Missing seeded document fixture.');
    const expired:DocumentRecord={...template,id:'test-expired',application_id:application.id,doc_type:'Fire Safety Certificate',file_name:'expired_fire_safety.pdf',expires_on:'2020-01-01',scan_status:'clean'};
    data.documents=[...data.documents,expired];
    const repo={mode:'demo'} as Repository;
    const run:Run=async()=>true;
    const html=renderToStaticMarkup(<CaseWorkspace app={application} data={data} identity={identity} repo={repo} run={run} busy={false} back={()=>{}} openPlanner={()=>{}}/>);
    expect(html).toContain('Decision recorded; renewal needed');
    expect(html).toContain('Expired document needs renewal');
    expect(html).toContain('Renew the expired Fire Safety Certificate');
    expect(html).toContain('No renewal deadline recorded');
    expect(html).toContain('Renewal needed');
    expect(html).toContain('An expired document needs renewal; the dossier remains read-only.');
    expect(html).toContain('This decision is recorded. An expired document needs renewal');
    expect(html).not.toContain('>YOUR ACCESS<');
  });
});
