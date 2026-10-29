import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readFileSync,mkdirSync} from 'node:fs';
import {SQLiteD1} from './sqlite-d1.js';
import worker from '../dist/server/index.js';
mkdirSync('.cloud-preview',{recursive:true});
const database=new SQLiteD1('.cloud-preview/rooms.sqlite');database.database.exec(readFileSync('db/schema.sql','utf8'));
const port=Number(process.env.PORT??4180),server=createServer(async(request,response)=>{
  try{
    const input=new Request(`http://127.0.0.1:${port}${request.url}`,{method:request.method,headers:request.headers,...(!['GET','HEAD'].includes(request.method)?{body:Readable.toWeb(request),duplex:'half'}:{})});
    const output=await worker.fetch(input,{DB:database},{waitUntil(promise){void promise.catch(()=>{});}});
    response.writeHead(output.status,Object.fromEntries(output.headers));response.end(Buffer.from(await output.arrayBuffer()));
  }catch(error){response.writeHead(500);response.end('Preview error');console.error(error.message);}
});
server.listen(port,'127.0.0.1',()=>console.log(`Cloud Worker preview: http://127.0.0.1:${port}/online/`));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close(()=>{database.close();process.exit(0);}));
