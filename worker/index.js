import {CloudRooms} from './cloud-rooms.js';
import {RoomError} from '../server/room-core.js';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});}
async function payload(request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new RoomError('请求需要 JSON 数据',415);
  const reader=request.body?.getReader();if(!reader)throw new RoomError('请求内容无效');let bytes=0,text='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384)throw new RoomError('请求内容过大',413);text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
  try{const result=JSON.parse(text);if(!result||typeof result!=='object'||Array.isArray(result))throw 0;return result;}catch{throw new RoomError('请求内容无效');}
}
export function createWorker(assets){
  return {async fetch(request,env,ctx){
    const url=new URL(request.url);let api,code,token;
    try{
      if(url.pathname.startsWith('/api/')){
        if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)throw new RoomError('请从游戏页面操作',403);
        api=new CloudRooms(env.DB);
        if(request.method==='GET'&&url.pathname==='/api/health'){
          await api.db.prepare('SELECT code FROM catan_rooms LIMIT 1').first();return json({ok:true,multiplayer:true,hosted:true,transport:'poll'});
        }
        const ip=request.headers.get('CF-Connecting-IP')??'unknown';
        if(request.method==='POST'&&url.pathname==='/api/rooms'){
          await api.limit('create',ip,12,3600000);const created=await api.create(await payload(request));ctx?.waitUntil(api.cleanup().catch(()=>{}));return json({ok:true,...created},201);
        }
        const match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|commands|presence))?$/i);
        if(!match)throw new RoomError('没有这个接口',404);code=match[1].toUpperCase();const endpoint=match[2];
        if(request.method==='POST'&&endpoint==='join'){await api.limit('join',ip,40,60000);return json({ok:true,...await api.join(code,await payload(request))},201);}
        token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
        if(!token)throw new RoomError('请先加入房间',401);
        if(request.method==='GET'&&!endpoint)return json({ok:true,snapshot:await api.snapshot(code,token,request.headers.get('X-Room-Connection'))});
        if(request.method==='POST'&&endpoint==='commands'){
          await api.limit('command',token,240,60000);return json(await api.command(code,token,await payload(request)));
        }
        if(request.method==='DELETE'&&endpoint==='presence')return json(await api.disconnect(code,token,request.headers.get('X-Room-Connection')));
        throw new RoomError('没有这个接口',404);
      }
      if(!['GET','HEAD'].includes(request.method))throw new RoomError('不支持这个请求',405);
      let path=decodeURIComponent(url.pathname);if(path.endsWith('/'))path+='index.html';
      if(!Object.hasOwn(assets,path))throw new RoomError('找不到这个页面',404);
      let content=assets[path];
      if(path==='/online/index.html')content=content.replace('<body class="lobby-page">','<body class="lobby-page" data-hosted="true">').replace('好友联机 · 本地试玩','好友联机 · 一起出发').replace('同一台电脑也能试玩：每个新窗口加入一个座位，刷新后会回到原座位。','创建房间后，把邀请链接发给朋友。各自输入名字，一起准备出发。');
      const extension=path.slice(path.lastIndexOf('.'));
      return new Response(request.method==='HEAD'?null:content,{headers:{...headers,'Content-Type':types[extension]??'text/plain; charset=utf-8'}});
    }catch(error){
      let snapshot;if(api&&code&&token)try{snapshot=await api.snapshot(code,token);}catch{}
      if(!error.status)console.error('Room service error',error.name,error.message);
      return json({ok:false,message:error.status?error.message:'联机服务暂时不可用，请稍后重试',...(snapshot?{snapshot}:{})},error.status??503);
    }
  }};
}
