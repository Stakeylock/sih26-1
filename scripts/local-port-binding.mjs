import http from 'node:http';
import {execFileSync} from 'node:child_process';
// Docker Desktop may ignore a bridge's default host-binding option. Change only
// this task's bindings; retain the original stopped containers as backups.
export async function restrictPublishedPorts(){
  const context=JSON.parse(execFileSync('docker',['context','inspect'],{encoding:'utf8'}))[0];const host=context.Endpoints.docker.Host;
  const socketPath=host.startsWith('npipe:')?'\\\\.\\pipe\\'+host.split('/').at(-1):host.startsWith('unix:')?host.slice(7):null;
  if(!socketPath)throw new Error('Local Docker socket required.');
  function request(method,path,body,raw=false){return new Promise((resolve,reject)=>{const binary=Buffer.isBuffer(body);const payload=body===undefined?undefined:binary?body:JSON.stringify(body);const req=http.request({socketPath,method,path,headers:payload?{'Content-Type':binary?'application/x-tar':'application/json','Content-Length':Buffer.byteLength(payload)}:{}},res=>{const parts=[];res.on('data',part=>parts.push(part));res.on('end',()=>{const bytes=Buffer.concat(parts);if(res.statusCode>=400)reject(new Error(`Local Docker operation failed (${res.statusCode})`));else if(raw)resolve(bytes);else{try{resolve(bytes.length?JSON.parse(bytes.toString()):null);}catch{resolve(null);}}});});req.on('error',reject);req.end(payload);});}
  const containers=await request('GET',`/containers/json?filters=${encodeURIComponent(JSON.stringify({label:['com.supabase.cli.project=flowpilot-sih26-local']}))}`);
  let changed=0;
  for(const item of containers){const inspected=await request('GET',`/containers/${item.Id}/json`);const name=inspected.Name.slice(1);
    if(inspected.Config.Labels?.['com.supabase.cli.project']!=='flowpilot-sih26-local'||!name.endsWith('_flowpilot-sih26-local'))throw new Error('Unrelated container refused.');
    if(!Object.values(inspected.NetworkSettings.Ports??{}).some(entries=>entries?.some(entry=>!['127.0.0.1','::1'].includes(entry.HostIp))))continue;
    const bindings=inspected.HostConfig.PortBindings;for(const entries of Object.values(bindings))for(const entry of entries??[])entry.HostIp='127.0.0.1';
    const kongFiles=name.startsWith('supabase_kong_')?await request('GET',`/containers/${item.Id}/archive?path=/home/kong`,undefined,true):null;
    const networks=Object.fromEntries(Object.entries(inspected.NetworkSettings.Networks).map(([network,settings])=>[network,{Aliases:(settings.Aliases??[]).filter(alias=>alias!==item.Id&&alias!==item.Id.slice(0,12))}]));
    const config={...inspected.Config,HostConfig:{...inspected.HostConfig,PortBindings:bindings},NetworkingConfig:{EndpointsConfig:networks}};delete config.Hostname;
    await request('POST',`/containers/${item.Id}/stop?t=10`);
    await request('POST',`/containers/${item.Id}/rename?name=${encodeURIComponent(name+'_unbound_backup_'+Date.now())}`);
    await request('POST',`/containers/create?name=${encodeURIComponent(name)}`,config);
    if(kongFiles)await request('PUT',`/containers/${name}/archive?path=/home`,kongFiles);
    await request('POST',`/containers/${name}/start`);
    changed++;
  }
  if(changed)for(const service of ['auth','rest','storage']){const name=`supabase_${service}_flowpilot-sih26-local`;const info=await request('GET',`/containers/${name}/json`);if(info.Config.Labels?.['com.supabase.cli.project']!=='flowpilot-sih26-local')throw new Error('Unrelated dependency refused.');await request('POST',`/containers/${name}/restart?t=5`);}
  return changed;
}
