import {execFileSync} from 'node:child_process';
export const localNetwork='flowpilot-loopback';
export function ensureLocalNetwork(){
  let networks;
  try{networks=JSON.parse(execFileSync('docker',['network','inspect',localNetwork],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}
  catch{execFileSync('docker',['network','create','--label','com.supabase.cli.project=flowpilot-sih26-local','--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',localNetwork],{stdio:'ignore'});networks=JSON.parse(execFileSync('docker',['network','inspect',localNetwork],{encoding:'utf8'}));}
  if(networks[0].Labels?.['com.supabase.cli.project']!=='flowpilot-sih26-local'||networks[0].Options?.['com.docker.network.bridge.host_binding_ipv4']!=='127.0.0.1')throw new Error('Refusing a network without FlowPilot loopback isolation.');
}
export async function bindLocalStackToLoopback(){
  ensureLocalNetwork();
  const ids=execFileSync('docker',['ps','-q','--filter','label=com.supabase.cli.project=flowpilot-sih26-local'],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean);
  for(const id of ids){const container=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8'}))[0];
    if(container.Config.Labels?.['com.supabase.cli.project']!=='flowpilot-sih26-local')throw new Error('Unrelated container refused.');
    for(const entries of Object.values(container.NetworkSettings.Ports??{}))for(const entry of entries??[])if(!['127.0.0.1','::1'].includes(entry.HostIp))throw new Error('A FlowPilot service is not loopback-only. Restart it with the configured local network.');
  }
  return 0;
}
