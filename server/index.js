import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {RoomStore,RoomError} from './rooms.js';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
function json(response,status,value){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));}
async function body(request){
  if(!request.headers['content-type']?.startsWith('application/json'))throw new RoomError('请求需要 JSON 数据',415);
  let data='';for await(const chunk of request){data+=chunk;if(Buffer.byteLength(data)>16384)throw new RoomError('请求内容过大',413);}
  try{const value=JSON.parse(data);if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value;}catch{throw new RoomError('请求内容无效');}
}
export function createApp({directory=resolve(projectRoot,'.catan-rooms'),store=new RoomStore({directory}),staticRoot=resolve(projectRoot,'dist')}={}){
  const streams=new Set();
  const server=createServer(async(request,response)=>{
    let code,token;
    try{
      const port=server.address()?.port,host=request.headers.host;
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)){json(response,403,{ok:false,message:'请通过本机地址访问'});return;}
      const url=new URL(request.url,`http://${host}`);
      if(url.pathname.startsWith('/api/')){
        if(request.headers.origin&&request.headers.origin!==`http://${host}`)throw new RoomError('请从本地游戏页面操作',403);
        if(request.method==='GET'&&url.pathname==='/api/health'){json(response,200,{ok:true,multiplayer:true});return;}
        if(request.method==='GET'&&url.pathname==='/api/security'){json(response,200,{required:false});return;}
        if(request.method==='POST'&&url.pathname==='/api/rooms'){json(response,201,{ok:true,...store.create(await body(request))});return;}
        const match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|events|commands))?$/i);
        if(!match)throw new RoomError('没有这个接口',404);
        code=match[1].toUpperCase();const endpoint=match[2];
        if(request.method==='POST'&&endpoint==='join'){json(response,201,{ok:true,...store.join(code,await body(request))});return;}
        token=request.headers.authorization?.replace(/^Bearer /,'');
        store.snapshot(code,token);
        if(request.method==='GET'&&endpoint==='events'){
          response.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no','Referrer-Policy':'no-referrer'});response.flushHeaders();streams.add(response);
          const send=()=>{try{response.write(`data: ${JSON.stringify(store.snapshot(code,token))}\n\n`);}catch{response.end();}};
          const unsubscribe=store.subscribe(code,send),disconnect=store.connect(code,token);send();
          const heartbeat=setInterval(()=>response.write(': keep-alive\n\n'),12000);heartbeat.unref();
          response.on('close',()=>{clearInterval(heartbeat);unsubscribe();streams.delete(response);disconnect();});return;
        }
        if(request.method==='GET'&&!endpoint){json(response,200,{ok:true,snapshot:store.snapshot(code,token)});return;}
        if(request.method==='POST'&&endpoint==='commands'){json(response,200,store.command(code,token,await body(request)));return;}
        throw new RoomError('没有这个接口',404);
      }
      if(!['GET','HEAD'].includes(request.method))throw new RoomError('不支持这个请求',405);
      const path=decodeURIComponent(url.pathname),file=resolve(staticRoot,'.'+path);
      if(/^\/(?:server|\.openai|_appgen_meta)(?:\/|$)/.test(path))throw new RoomError('找不到这个文件',404);
      if(file!==staticRoot&&!file.startsWith(staticRoot+sep))throw new RoomError('找不到这个文件',404);
      let selected=file,info;try{info=await stat(file);if(info.isDirectory())selected=resolve(file,'index.html');}catch{throw new RoomError('找不到这个页面',404);}
      const data=await readFile(selected);
      response.writeHead(200,{'Content-Type':mime[extname(selected)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});response.end(request.method==='HEAD'?undefined:data);
    }catch(error){
      if(response.headersSent){response.end();return;}
      let snapshot;if(code&&token)try{snapshot=store.snapshot(code,token);}catch{}
      json(response,error.status??500,{ok:false,message:error.status?error.message:'本地服务暂时无法处理，请稍后重试',...(snapshot?{snapshot}:{})});
    }
  });
  return {server,store,stopStreams(){for(const stream of streams)stream.end();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=Number(process.env.PORT??4173),app=createApp({directory:process.env.CATAN_ROOM_DIR?resolve(process.env.CATAN_ROOM_DIR):undefined});
  app.server.listen(port,'127.0.0.1',()=>console.log(`卡坦岛本地联机：http://127.0.0.1:${port}/online/`));
  const shutdown=()=>{app.stopStreams();app.server.close(()=>process.exit(0));};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
