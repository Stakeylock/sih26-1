import {readFileSync} from 'node:fs';
const {docs}=JSON.parse(readFileSync('.env.integration-fixtures.local','utf8').split('FP_INTEGRATION_FIXTURES=')[1]);
console.log('begin;\n'+docs.map(d=>`select fp_private.complete_document('${d.id}','${d.sha256}',true,'integration-known-png-fixture-not-malware-scan');`).join('\n')+'\ncommit;');
