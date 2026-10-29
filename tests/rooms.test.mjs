import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RoomStore,projectGame} from '../server/rooms.js';
import {chooseAction} from '../dist/ai.js';
import {conservation,tradeRecipient,emptyResources,RES,total} from '../dist/game.js';

let sequence=0;
const command=(store,session,kind,extra={})=>store.command(session.code,session.token,{command:kind,requestId:`test-action-${++sequence}`,...extra});
function lobby(capacity=3,options={}){
  const store=new RoomStore({seed:()=>42,...options}),first=store.create({name:'海风',capacity}),sessions=[first.session];
  for(let i=1;i<capacity;i++)sessions.push(store.join(first.session.code,{name:`朋友${i}`}).session);
  sessions.slice(1).forEach(session=>command(store,session,'ready',{ready:true}));
  return {store,sessions,room:store.room(first.session.code)};
}
function started(capacity=3,options={}){const result=lobby(capacity,options);command(result.store,result.sessions[0],'start');return result;}
function gameCommand(store,session,action,revision=store.room(session.code).gameRevision){return command(store,session,'game',{expectedRevision:revision,action});}
function toRoll(result){for(let i=0;result.room.game.phase.startsWith('setup')&&i<40;i++){const actor=result.room.game.current,action=chooseAction(projectGame(result.room.game,actor));gameCommand(result.store,result.sessions[actor],action);}assert.equal(result.room.game.phase,'roll');}
function deal(game,seat,resources){for(const [res,n]of Object.entries(resources)){game.bank[res]-=n;game.players[seat].resources[res]+=n;}}
function emptyHands(game){game.bank=Object.fromEntries(RES.map(r=>[r,19]));game.players.forEach(p=>p.resources=emptyResources());}

test('room seats, readiness, host permissions and membership remain authoritative',()=>{
  const store=new RoomStore(),host=store.create({name:'房主',capacity:3}).session;
  assert.throws(()=>command(store,host,'start'),/坐满并准备/);
  const guest=store.join(host.code,{name:'小鱼'}).session;
  assert.throws(()=>command(store,guest,'start'),/房主/);
  assert.throws(()=>store.snapshot(host.code,'wrong-token'),/凭证/);
  assert.throws(()=>store.join(host.code,{name:'小鱼'}),/名字/);
  const third=store.join(host.code,{name:'小船'}).session;
  assert.throws(()=>store.join(host.code,{name:'第四位'}),/坐满/);
  command(store,guest,'ready',{ready:true});command(store,third,'ready',{ready:true});command(store,host,'start');
  assert.equal(store.snapshot(host.code,host.token).phase,'playing');
  assert.throws(()=>store.join(host.code,{name:'迟到'}),/已经开始/);
  assert.throws(()=>command(store,guest,'leave'),/保留座位/);
});
test('each projection rotates ownership while concealing opponent hands and the random sequence',()=>{
  const {store,room,sessions}=started(4);toRoll({store,room,sessions});
  const before=structuredClone(room.game);
  for(let seat=0;seat<4;seat++){
    const snapshot=store.snapshot(room.code,sessions[seat].token),view=snapshot.game;
    assert.equal(snapshot.me,seat);assert.equal(view.me,0);assert.equal(view.players[0].name,room.game.players[seat].name);
    assert.deepEqual(view.players[0].resources,room.game.players[seat].resources);
    assert.equal(view.discardLeft,room.game.discardRequired[seat]);
    for(const key of ['seed','rng','deck'])assert.equal(key in view,false);
    for(const peer of view.players.slice(1)){assert.equal('resources' in peer,false);assert.equal('dev' in peer,false);assert.equal(total(peer),peer.resourceCount);}
    for(const v of view.vertices)assert.equal(v.owner,room.game.vertices[v.id].owner===null?null:(room.game.vertices[v.id].owner-seat+4)%4);
    assert.deepEqual(view.setupOrder,room.game.setupOrder.map(id=>(id-seat+4)%4));
  }
  assert.deepEqual(room.game,before);
});
test('lobby departures transfer the host and empty rooms can accept a new host',()=>{
  const store=new RoomStore(),host=store.create({capacity:3}).session,guest=store.join(host.code,{name:'新房主'}).session;
  command(store,host,'leave');assert.equal(store.snapshot(host.code,guest.token).hostSeat,1);assert.throws(()=>store.snapshot(host.code,host.token),/凭证/);
  const replacement=store.join(host.code,{name:'补位'}).session,third=store.join(host.code,{name:'第三位'}).session;
  for(const session of [guest,replacement,third])command(store,session,'ready',{ready:true});command(store,guest,'start');assert.equal(store.room(host.code).game.startPlayer,1);
  const emptyStore=new RoomStore(),empty=emptyStore.create().session;command(emptyStore,empty,'leave');const next=emptyStore.join(empty.code,{name:'再出发'}).session;assert.equal(emptyStore.snapshot(empty.code,next.token).hostSeat,0);
});
test('repeated commands, stale moves, forged actors and invalid targets cannot mutate a game twice',()=>{
  const {store,room,sessions}=started(),before=structuredClone(room.game);
  assert.throws(()=>gameCommand(store,sessions[1],{type:'settlement',id:0,player:0}),/等待其他玩家/);assert.deepEqual(room.game,before);
  const action=chooseAction(projectGame(room.game,0)),request={command:'game',requestId:'one-request-only',expectedRevision:room.gameRevision,action};
  store.command(room.code,sessions[0].token,request);const revision=room.gameRevision,after=structuredClone(room.game);
  store.command(room.code,sessions[0].token,request);assert.equal(room.gameRevision,revision);assert.deepEqual(room.game,after);
  assert.throws(()=>gameCommand(store,sessions[0],{type:'road',id:0},revision-1),/局面已更新/);assert.deepEqual(room.game,after);
  assert.throws(()=>gameCommand(store,sessions[0],{type:'offer',with:'__proto__',give:{wood:1},get:{ore:1}}),/无效的交易/);assert.deepEqual(room.game,after);
});
test('resource offers and counters map both player perspectives to the same exchange',()=>{
  const {store,room,sessions}=started();toRoll({store,room,sessions});const game=room.game;emptyHands(game);game.phase='build';game.current=2;deal(game,2,{wood:3});deal(game,0,{brick:3});
  gameCommand(store,sessions[2],{type:'offer',with:1,give:{wood:1},get:{brick:1}});
  assert.equal(room.game.offer.from,2);assert.equal(room.game.offer.with,0);
  const recipient=store.snapshot(room.code,sessions[0].token).game;assert.equal(tradeRecipient(recipient.offer),0);assert.equal(recipient.offer.from,2);
  gameCommand(store,sessions[0],{type:'counter',give:{wood:2},get:{brick:1}});
  const proposer=store.snapshot(room.code,sessions[2].token).game;assert.equal(tradeRecipient(proposer.offer),0);assert.equal(proposer.offer.with,1);
  gameCommand(store,sessions[2],{type:'respond',accept:true});assert.equal(room.game.offer,null);
  assert.equal(room.game.players[2].resources.wood,1);assert.equal(room.game.players[2].resources.brick,1);
  assert.equal(room.game.players[0].resources.wood,2);assert.equal(room.game.players[0].resources.brick,2);assert.ok(conservation(room.game));
});
test('all seats may discard and only the active seat may move the robber',()=>{
  const {store,room,sessions}=started();toRoll({store,room,sessions});const game=room.game;emptyHands(game);deal(game,0,{wood:8});deal(game,1,{brick:8});deal(game,2,{ore:8});game.phase='discard';game.current=1;game.returnPhase='build';game.discardRequired=[4,4,4];
  gameCommand(store,sessions[2],{type:'discard',resources:{ore:4}});gameCommand(store,sessions[0],{type:'discard',resources:{wood:4}});assert.equal(room.game.phase,'discard');
  assert.throws(()=>gameCommand(store,sessions[1],{type:'robber',tile:(game.robber+1)%19}),error=>error.status===409);assert.equal(room.game.phase,'discard');
  gameCommand(store,sessions[1],{type:'discard',resources:{brick:4}});assert.equal(room.game.phase,'robber');
  assert.throws(()=>gameCommand(store,sessions[0],{type:'robber',tile:(game.robber+1)%19}),/等待其他玩家/);
  gameCommand(store,sessions[1],{type:'robber',tile:(game.robber+1)%19});assert.ok(['victim','build'].includes(room.game.phase));assert.ok(conservation(room.game));
});
test('room persistence restores private seats, progress and duplicate protection after a restart',()=>{
  const directory=mkdtempSync(join(tmpdir(),'catan-rooms-'));
  try{
    const {store,room,sessions}=started(3,{directory});const action=chooseAction(projectGame(room.game,0));const request={command:'game',requestId:'persisted-request',expectedRevision:room.gameRevision,action};
    store.command(room.code,sessions[0].token,request);
    const disconnect=store.connect(room.code,sessions[0].token),lastSeen=store.snapshot(room.code,sessions[0].token).revision;disconnect();
    const restored=new RoomStore({directory});assert.deepEqual(restored.room(room.code).game,room.game);assert.ok(restored.snapshot(room.code,sessions[0].token).revision>=lastSeen);
    const before=restored.room(room.code).gameRevision;restored.command(room.code,sessions[0].token,request);assert.equal(restored.room(room.code).gameRevision,before);
    assert.equal(restored.snapshot(room.code,sessions[1].token).me,1);assert.equal(restored.snapshot(room.code,sessions[0].token).seats[0].connected,false);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('three- and four-window games can finish through the same public commands used by human players',()=>{
  for(const capacity of [3,4]){
    const {store,room,sessions}=started(capacity);let moves=0;
    while(room.game.phase!=='over'&&moves++<2400){
      const game=room.game,actor=game.phase==='discard'?game.discardRequired.findIndex(n=>n>0):game.offer?tradeRecipient(game.offer):game.current;
      const action=chooseAction(projectGame(game,actor));assert.ok(action,`${capacity} seats stalled in ${game.phase}`);
      gameCommand(store,sessions[actor],action);assert.ok(conservation(room.game));
    }
    assert.equal(room.game.phase,'over',`${capacity} seats did not finish after ${moves} commands`);
    for(const session of sessions){const view=store.snapshot(room.code,session.token).game;assert.equal(view.phase,'over');assert.equal(view.players[view.winner].name,room.game.players[room.game.winner].name);}
  }
});
