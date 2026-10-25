import net from 'node:net';
function exchange(host,port,write,timeout=60000){return new Promise((resolve,reject)=>{const socket=net.createConnection({host,port});let received='';socket.setTimeout(timeout);socket.once('connect',()=>{try{write(socket);}catch(e){socket.destroy(e);}});socket.on('data',chunk=>{received+=chunk.toString('utf8');if(received.length>4096)socket.destroy(new Error('Scanner response exceeded limit'));if(received.includes('\0')){socket.end();resolve(received.split('\0')[0]);}});socket.once('timeout',()=>socket.destroy(new Error('Scanner timed out')));socket.once('error',reject);socket.once('end',()=>{if(!received.includes('\0'))reject(new Error('Incomplete scanner response'));});});}
export async function scannerVersion({host='127.0.0.1',port=53310,maxSignatureAgeDays=14}={}){
 const engine=await exchange(host,port,s=>s.write('zVERSION\0'),10000);
 if(!/^ClamAV [\d.]+\/\d+\/.+/.test(engine))throw new Error('Scanner signatures are unavailable');
 const signatureDate=Date.parse(engine.split('/').slice(2).join('/')+' UTC');if(!Number.isFinite(signatureDate)||Date.now()-signatureDate>maxSignatureAgeDays*86400000)throw new Error('Scanner signatures exceeded the configured age limit');
 return engine;
}
export async function scanBytes(bytes,config={}){
 if(bytes.length<1||bytes.length>10485760)throw new Error('Document size exceeds scanner limit');
 const engine=await scannerVersion(config),{host='127.0.0.1',port=53310}=config;
 const response=await exchange(host,port,s=>{s.write('zINSTREAM\0');for(let offset=0;offset<bytes.length;offset+=65536){const chunk=bytes.subarray(offset,offset+65536),size=Buffer.alloc(4);size.writeUInt32BE(chunk.length);s.write(size);s.write(chunk);}s.write(Buffer.alloc(4));});
 if(response==='stream: OK')return {clean:true,engine};
 if(response.endsWith(' FOUND'))return {clean:false,engine,detail:'Malware signature detected'};
 throw new Error('Scanner did not return a definitive verdict');
}
export function contentTypeMatches(bytes,mime){return mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:false;}
