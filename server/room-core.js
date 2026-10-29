import {newGame,observe,applyAction,tradeRecipient,declineUnpayableOffer,log} from '../dist/game.js';

export class RoomError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
const clone=value=>structuredClone(value);
const webBytes=n=>crypto.getRandomValues(new Uint8Array(n));
const tokenFrom=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const palette=['#db5940','#438fc4','#e4dbc1','#e3a23e'];
const cleanName=(value,fallback)=>[...String(value??'').replace(/[\u0000-\u001f<>&"']/g,'').trim()].slice(0,8).join('')||fallback;
const actionTypes=new Set(['settlement','road','city','roll','end','bank','offer','respond','counter','cancelOffer','buyDev','dev','discard','robber','victim']);

// Each browser sees itself as player 0. Only public ownership IDs are rotated;
// secret cards, the deck order and RNG state never leave the authority.
export function projectGame(game,seat){
  const n=game.players.length,ids=Array.from({length:n},(_,i)=>(i+seat)%n);
  const local=id=>id===null||id===undefined?id:(id-seat+n)%n;
  const view=observe(game,seat);
  view.players=ids.map((id,index)=>({...view.players[id],id:index,...(game.phase==='over'?{dev:clone(game.players[id].dev)}:{})}));
  for(const item of [...view.vertices,...view.edges])item.owner=local(item.owner);
  for(const key of ['current','startPlayer','winner','longestOwner','largestOwner'])view[key]=local(view[key]);
  for(const key of ['setupOrder','pendingVictims'])view[key]=view[key].map(local);
  view.longest=ids.map(id=>game.longest[id]);
  view.discardRequired=ids.map(id=>game.discardRequired[id]);
  view.discardLeft=view.discardRequired[0];
  for(const item of [...view.logs,...view.production,...view.playedCards])item.player=local(item.player);
  if(view.offer)for(const key of ['from','with','proposedBy'])view.offer[key]=local(view.offer[key]);
  view.me=0;view.seat=seat;view.online=true;
  return view;
}

export class RoomStore {
  constructor({seed,randomBytes=webBytes}={}){
    this.randomBytes=randomBytes;
    this.seed=seed??(()=>new DataView(randomBytes(4).buffer).getUint32(0));
    this.rooms=new Map();this.listeners=new Map();this.connections=new Map();
  }
  persist(room){}
  changed(room,{persist=true}={}){
    room.revision=Math.max(room.revision+1,Date.now());if(persist)this.persist(room);
    for(const listener of this.listeners.get(room.code)??[])listener();
  }
  subscribe(code,listener){
    const set=this.listeners.get(code)??new Set();set.add(listener);this.listeners.set(code,set);
    return()=>{set.delete(listener);if(!set.size)this.listeners.delete(code);};
  }
  room(code){const room=this.rooms.get(String(code).toUpperCase());if(!room)throw new RoomError('没有找到这个房间，请检查房间码',404);return room;}
  member(room,token){const seat=room.seats.findIndex(m=>m&&m.token===token);if(seat<0)throw new RoomError('座位凭证已失效，请重新加入房间',401);return seat;}
  connected(room,seat){return (this.connections.get(`${room.code}:${room.seats[seat]?.token}`)??0)>0;}
  connect(code,token){
    const room=this.room(code);this.member(room,token);const key=`${room.code}:${token}`;
    this.connections.set(key,(this.connections.get(key)??0)+1);this.changed(room);
    let closed=false;
    return()=>{if(closed)return;closed=true;const count=(this.connections.get(key)??1)-1;if(count)this.connections.set(key,count);else this.connections.delete(key);this.changed(room);};
  }
  snapshot(code,token){
    const room=this.room(code),seat=this.member(room,token);
    return {code:room.code,capacity:room.capacity,revision:room.revision,gameRevision:room.gameRevision,hostSeat:room.hostSeat,me:seat,
      phase:room.game?(room.game.phase==='over'?'finished':'playing'):'lobby',combinedTradeBuild:room.combinedTradeBuild,
      seats:room.seats.map((member,id)=>member?{seat:id,name:member.name,letter:[...member.name][0],color:palette[id],ready:member.ready,connected:this.connected(room,id)}:null),
      game:room.game?projectGame(room.game,seat):null};
  }
  create({name,capacity=3,combinedTradeBuild=true}={}){
    if(![3,4].includes(capacity))throw new RoomError('请选择 3 人或 4 人房间');
    if(this.rooms.size>=64)throw new RoomError('本地房间数量已达上限，请先继续已有房间',409);
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;
    do{code=Array.from(this.randomBytes(6),b=>alphabet[b%alphabet.length]).join('');}while(this.rooms.has(code));
    const token=tokenFrom(this.randomBytes(24));
    const room={schema:1,code,capacity,combinedTradeBuild:combinedTradeBuild!==false,hostSeat:0,revision:1,gameRevision:0,createdAt:Date.now(),seats:Array(capacity).fill(null),game:null,receipts:[]};
    room.seats[0]={name:cleanName(name,'房主'),token,ready:true};this.rooms.set(code,room);this.persist(room);
    return {session:{code,token},snapshot:this.snapshot(code,token)};
  }
  join(code,{name}={}){
    const room=this.room(code);if(room.game)throw new RoomError('对局已经开始，只有原来的窗口可以重连',409);
    const seat=room.seats.findIndex(m=>!m);if(seat<0)throw new RoomError('房间已经坐满了',409);
    const playerName=cleanName(name,`玩家${seat+1}`);
    if(room.seats.some(m=>m?.name===playerName))throw new RoomError('这个名字已有人使用，请换一个');
    const token=tokenFrom(this.randomBytes(24));room.seats[seat]={name:playerName,token,ready:false};if(room.hostSeat<0)room.hostSeat=seat;this.changed(room);
    return {session:{code:room.code,token},snapshot:this.snapshot(room.code,token)};
  }
  command(code,token,{command,requestId,expectedRevision,action,ready}={}){
    const room=this.room(code),seat=this.member(room,token);
    if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(requestId))throw new RoomError('操作编号无效');
    const fingerprint=JSON.stringify({command,expectedRevision,action,ready});
    const receipt=room.receipts.find(r=>r.token===token&&r.id===requestId);
    if(receipt){if(receipt.fingerprint!==fingerprint)throw new RoomError('操作编号已经使用过',409);return {...receipt.result,snapshot:this.snapshot(code,token)};}
    let result={ok:true};
    if(command==='ready'){
      if(room.game)throw new RoomError('对局已经开始',409);
      if(typeof ready!=='boolean')throw new RoomError('准备状态无效');room.seats[seat].ready=ready;
    }else if(command==='start'){
      if(seat!==room.hostSeat)throw new RoomError('请等待房主开始对局',403);
      if(room.game)throw new RoomError('对局已经开始',409);
      if(room.seats.some(m=>!m||!m.ready))throw new RoomError('等所有座位坐满并准备后再出发',409);
      const game=newGame(this.seed(),{playerCount:room.capacity,combinedTradeBuild:room.combinedTradeBuild,startPlayer:room.hostSeat});
      game.players.forEach((player,id)=>{player.name=room.seats[id].name;player.letter=[...player.name][0];});
      game.logs=[];log(game,`${game.players[game.startPlayer].name}先手。每人自行选择两组初始村庄与道路`,game.startPlayer,'start');
      room.game=game;room.gameRevision++;
    }else if(command==='game'){
      if(!room.game)throw new RoomError('请等待房主开始对局',409);
      if(!Number.isInteger(expectedRevision)||expectedRevision!==room.gameRevision)throw new RoomError('局面已更新，请根据最新棋盘重新操作',409);
      if(!action||typeof action!=='object'||Array.isArray(action)||!actionTypes.has(action.type))throw new RoomError('无效的游戏操作');
      const translated=clone(action);
      for(const key of ['id','tile'])if(key in action&&(!Number.isSafeInteger(action[key])||action[key]<0))throw new RoomError('请选择有效的棋盘位置或卡牌');
      for(const key of ['with','player'])if(key in action){if(!Number.isInteger(action[key])||action[key]<0||action[key]>=room.capacity)throw new RoomError('无效的交易或强盗目标');translated[key]=(action[key]+seat)%room.capacity;}
      const candidate=clone(room.game);result=applyAction(candidate,seat,translated);
      if(!result.ok)throw new RoomError(result.message,409);
      if(candidate.offer)declineUnpayableOffer(candidate,tradeRecipient(candidate.offer));
      room.game=candidate;room.gameRevision++;
    }else if(command==='leave'){
      if(room.game)throw new RoomError('对局中会为你保留座位，刷新或断线后可在原窗口重连',409);
      room.seats[seat]=null;if(room.hostSeat===seat)room.hostSeat=room.seats.findIndex(Boolean);
      this.changed(room);return {ok:true};
    }else throw new RoomError('未知的房间操作');
    room.receipts.push({token,id:requestId,fingerprint,result});room.receipts=room.receipts.slice(-160);this.changed(room);
    return {...result,snapshot:this.snapshot(code,token)};
  }
}
