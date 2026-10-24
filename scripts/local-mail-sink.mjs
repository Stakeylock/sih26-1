import net from 'node:net';
import {appendFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function startLocalMailSink({port=1025,file=null,onMessage=()=>{}}={}){
 const sockets=new Set();const server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(15000,()=>socket.destroy());socket.write('220 local.demo.invalid test sink\r\n');let buffer='',data=false,lines=[],recipient='';
  socket.on('data',chunk=>{buffer+=chunk.toString('utf8');if(buffer.length>1000000){socket.destroy();return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);
   if(data){if(line!=='.'){lines.push(line.startsWith('..')?line.slice(1):line);if(lines.join('\n').length>1000000)socket.destroy();continue;}data=false;const message={received_at:new Date().toISOString(),recipient,text:lines.join('\n'),channel:'local_test_sink'};lines=[];void (async()=>{try{await onMessage(message);if(file){await mkdir(dirname(resolve(file)),{recursive:true});await appendFile(resolve(file),JSON.stringify(message)+'\n','utf8');}socket.write('250 accepted by local test sink\r\n');}catch{socket.write('451 test sink persistence failed\r\n');}})();}
   else if(/^EHLO /i.test(line))socket.write('250-local.demo.invalid\r\n250 SIZE 1000000\r\n');else if(/^MAIL FROM:<[^>]+@demo\.invalid>$/i.test(line))socket.write('250 sender accepted\r\n');else if(/^RCPT TO:<([-a-z0-9]+@demo\.invalid)>$/i.test(line)){recipient=line.slice(9,-1);socket.write('250 synthetic recipient accepted\r\n');}else if(line==='DATA'&&recipient){data=true;socket.write('354 end with dot\r\n');}else if(line==='QUIT')socket.end('221 local sink closing\r\n');else socket.write('550 only synthetic local envelopes supported\r\n');
  }});
 });await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return {port:server.address().port,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const sink=await startLocalMailSink({port:Number(process.env.FP_SMTP_PORT??1025),file:'.runtime/local-mail.jsonl'});console.log(`Synthetic SMTP sink listening on 127.0.0.1:${sink.port}. No forwarding.`);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void sink.close().then(()=>process.exit(0));});}
