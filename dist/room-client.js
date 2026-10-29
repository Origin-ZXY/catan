export const ROOM_SESSION='catan-room-window-v1';
const RECOVERY_KEY='catan-room-recovery-v1';
export function readRoomSession(){try{return JSON.parse(sessionStorage.getItem(ROOM_SESSION));}catch{return null;}}
export function readRoomRecovery(code){try{const list=JSON.parse(localStorage.getItem(RECOVERY_KEY)||'[]');return Array.isArray(list)?list.filter(s=>s&&typeof s.code==='string'&&typeof s.token==='string'&&(!code||s.code===code)).slice(0,24):[];}catch{return [];}}
export function saveRoomSession(session,{name}={}){
  const value={...session,...(name?{name}:{})};sessionStorage.setItem(ROOM_SESSION,JSON.stringify(value));
  try{const previous=readRoomRecovery().filter(s=>s.code!==value.code||s.token!==value.token);localStorage.setItem(RECOVERY_KEY,JSON.stringify([{...value,seen:Date.now()},...previous].slice(0,24)));}catch{}
}
export function forgetRoomSession(session){try{localStorage.setItem(RECOVERY_KEY,JSON.stringify(readRoomRecovery().filter(s=>s.code!==session.code||s.token!==session.token)));}catch{}if(readRoomSession()?.token===session.token)clearRoomSession();}
export function clearRoomSession(){sessionStorage.removeItem(ROOM_SESSION);}
export async function roomRequest(path,{method='GET',payload,token,headers={},signal}={}){
  const response=await fetch(path,{method,headers:{...(payload?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...headers},...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store',...(signal?{signal}:{})});
  let result;try{result=await response.json();}catch{throw new Error('联机服务暂时不可用，请稍后重试');}
  if(!response.ok||result.ok===false){const error=new Error(result.message??'请求未完成');error.status=response.status;error.result=result;throw error;}
  return result;
}
export function hydrateRoomGame(view){
  return {...view,deck:Array(view.deckCount).fill(null),players:view.players.map(p=>({...p,dev:p.dev??Array.from({length:p.devCount},()=>({type:'hidden'}))}))};
}
export class RoomConnection {
  constructor(session,{onSnapshot=()=>{},onStatus=()=>{}}={}){
    this.session=session;this.onSnapshot=onSnapshot;this.onStatus=onStatus;this.snapshot=null;this.connected=false;this.stopped=true;this.controller=null;this.connectionId=crypto.randomUUID();this.transport=null;
  }
  accept(snapshot){if(!snapshot||this.snapshot&&snapshot.revision<this.snapshot.revision)return;this.snapshot=snapshot;this.transport=snapshot.transport??'stream';this.onSnapshot(snapshot);}
  status(value){this.connected=value==='connected';this.onStatus(value);}
  async resume(){const result=await roomRequest(`/api/rooms/${this.session.code}`,{token:this.session.token});saveRoomSession(this.session,{name:result.snapshot.seats[result.snapshot.me]?.name});this.accept(result.snapshot);return result.snapshot;}
  start(){if(!this.stopped)return;this.stopped=false;void (this.transport==='poll'?this.poll():this.listen());}
  stop(){
    this.stopped=true;this.controller?.abort();this.connected=false;
    if(this.transport==='poll')void fetch(`/api/rooms/${this.session.code}/presence`,{method:'DELETE',headers:{Authorization:`Bearer ${this.session.token}`,'X-Room-Connection':this.connectionId},keepalive:true}).catch(()=>{});
  }
  async poll(){
    let delay=1000,lastHeartbeat=0;this.status('connecting');
    while(!this.stopped){
      this.controller=new AbortController();const timeout=setTimeout(()=>this.controller?.abort(),15000);
      try{
        const now=Date.now(),heartbeat=now-lastHeartbeat>10000;
        const result=await roomRequest(`/api/rooms/${this.session.code}`,{token:this.session.token,signal:this.controller.signal,headers:heartbeat?{'X-Room-Connection':this.connectionId}:{}});
        if(this.stopped)break;if(heartbeat)lastHeartbeat=now;this.accept(result.snapshot);if(!this.connected)this.status('connected');delay=1000;
      }catch(error){
        if(this.stopped)break;
        if([401,404].includes(error.status)){this.stopped=true;this.status('invalid');break;}
        this.status('offline');delay=Math.min(delay*2,6000);
      }finally{clearTimeout(timeout);}
      await new Promise(resolve=>setTimeout(resolve,delay));
    }
  }
  async listen(){
    let delay=350;
    while(!this.stopped){
      this.status('connecting');this.controller=new AbortController();
      try{
        const response=await fetch(`/api/rooms/${this.session.code}/events`,{headers:{Authorization:`Bearer ${this.session.token}`},cache:'no-store',signal:this.controller.signal});
        if(response.status===401||response.status===404){this.stopped=true;this.status('invalid');break;}
        if(!response.ok||!response.body)throw new Error('连接暂时中断');
        this.status('connected');delay=350;
        const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
        try{while(!this.stopped){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
          while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=frame.split('\n').filter(line=>line.startsWith('data: ')).map(line=>line.slice(6)).join('\n');if(data)this.accept(JSON.parse(data));}
        }}finally{await reader.cancel().catch(()=>{});}
      }catch(error){if(this.stopped)break;}
      if(!this.stopped){this.status('offline');await new Promise(resolve=>setTimeout(resolve,delay));delay=Math.min(delay*2,4000);}
    }
  }
  async command(command,payload={}){
    try{
      const result=await roomRequest(`/api/rooms/${this.session.code}/commands`,{method:'POST',token:this.session.token,payload:{command,requestId:crypto.randomUUID(),...payload}});
      if(result.snapshot)this.accept(result.snapshot);return result;
    }catch(error){if(error.result?.snapshot)this.accept(error.result.snapshot);if([401,404].includes(error.status)){this.stop();this.status('invalid');}return {ok:false,message:error.status?error.message:'连接暂时中断，恢复后再试；已提交的操作会自动同步'};}
  }
}
