// Local synthetic transport only. Never import into the browser bundle.
import net from 'node:net';
export async function sendLocalMail({host='127.0.0.1',port=1025,id,recipientId,title,body,timeoutMs=5000}){
 if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Only the loopback test sink is permitted.');
 if(!Number.isInteger(port)||port<1||port>65535||!/^[-a-zA-Z0-9]{1,100}$/.test(id)||!/^[-a-zA-Z0-9]{1,100}$/.test(recipientId)||typeof body!=='string'||body.length>32000)throw new Error('Invalid local test envelope.');
 const socket=net.createConnection({host:host==='localhost'?'127.0.0.1':host,port});let buffer='',pending=null,replies=[],sentData=false,closed=false;
 const fail=()=>{closed=true;if(pending){const reject=pending.reject;pending=null;const error=new Error(sentData?'Local SMTP outcome is ambiguous.':'Local SMTP transport unavailable.');error.ambiguous=sentData;reject(error);}};
 socket.setTimeout(timeoutMs,()=>socket.destroy(new Error('Local test transport timeout.')));socket.on('error',fail);socket.on('close',fail);
 socket.on('data',chunk=>{buffer+=chunk.toString('utf8');if(buffer.length>64000){socket.destroy();return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);const match=/^(\d{3}) (.*)$/.exec(line);if(!match)continue;const code=Number(match[1]);if(pending){const resolve=pending.resolve;pending=null;resolve(code);}else replies.push(code);}});
 const reply=()=>replies.length?Promise.resolve(replies.shift()):closed?Promise.reject(Object.assign(new Error('Local transport closed.'),{ambiguous:sentData})):new Promise((resolve,reject)=>{pending={resolve,reject};});
 async function expect(code,command){if(command)socket.write(command+'\r\n');const actual=await reply();if(actual!==code){const error=new Error('Local SMTP command rejected.');error.ambiguous=false;error.permanent=actual>=500;throw error;}}
 try{
  await expect(220);await expect(250,'EHLO demo.invalid');await expect(250,'MAIL FROM:<workspace@demo.invalid>');await expect(250,`RCPT TO:<${recipientId}@demo.invalid>`);await expect(354,'DATA');
  const rawSubject=String(title).replace(/[\r\n]/g,' ').slice(0,160),subject=/^[\x20-\x7e]*$/.test(rawSubject)?rawSubject:'=?UTF-8?B?'+Buffer.from(rawSubject,'utf8').toString('base64')+'?=',encoding=/^[\x09\x0a\x0d\x20-\x7e]*$/.test(body)?'7bit':'base64',wire=encoding==='7bit'?body:(Buffer.from(body,'utf8').toString('base64').match(/.{1,76}/g)??[]).join('\n'),text=wire.replace(/\r?\n/g,'\n').split('\n').map(line=>line.startsWith('.')?'.'+line:line).join('\r\n');
  sentData=true;socket.write(`From: workspace@demo.invalid\r\nTo: ${recipientId}@demo.invalid\r\nSubject: ${subject}\r\nMessage-ID: <${id}@demo.invalid>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${text}\r\n.\r\n`);await expect(250);socket.end('QUIT\r\n');return {status:'smtp_accepted',messageId:`${id}@demo.invalid`};
 }finally{socket.destroy();}
}
