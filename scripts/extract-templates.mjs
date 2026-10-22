import {readFileSync,writeFileSync} from 'node:fs';
const sql=readFileSync('supabase/reference/baseline.sql','utf8');
const templates=[...sql.matchAll(/\('([^']+)', 1, 'published', '([^']+)', '({[\s\S]*?})'::jsonb, now\(\)\)/g)].map((m,i)=>({id:`demo-template-${i}`,app_type:m[1],version:1,status:'published',name:m[2],definition:JSON.parse(m[3])}));
if(templates.length!==3) throw new Error('Expected all three Baseline templates');
writeFileSync('src/data/templates.json',JSON.stringify(templates,null,2)+'\n');
