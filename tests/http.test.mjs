import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.js';

async function appFor(t){
  const app=createApp({directory:null});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{app.stopStreams();app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));});
  const call=async(path,{method='GET',payload,token,headers={}}={})=>{const response=await fetch(origin+path,{method,headers:{...(payload?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...headers},...(payload?{body:JSON.stringify(payload)}:{})});return {status:response.status,body:await response.json()};};
  return {app,origin,call};
}
test('HTTP rooms authenticate seats, reject cross-origin writes and keep local files private',async t=>{
  const {origin,call}=await appFor(t);
  assert.equal((await call('/api/health')).body.multiplayer,true);
  const created=await call('/api/rooms',{method:'POST',payload:{name:'海风',capacity:3}});assert.equal(created.status,201);const session=created.body.session;
  assert.equal((await call(`/api/rooms/${session.code}`)).status,401);
  assert.equal((await call(`/api/rooms/${session.code}`,{token:session.token})).body.snapshot.seats[0].name,'海风');
  assert.equal((await call('/api/rooms',{method:'POST',payload:{},headers:{Origin:'https://example.com'}})).status,403);
  assert.equal((await fetch(origin+'/.catan-rooms/'+session.code+'.json')).status,404);
  assert.equal((await fetch(origin+'/server/rooms.js')).status,404);
  const index=await fetch(origin+'/online/');assert.equal(index.status,200);assert.match(await index.text(),/创建房间/);
  const script=await fetch(origin+'/app.js');assert.equal(script.headers.get('cache-control'),'no-store');
});
test('live streams deliver joins and moves to separate viewers without leaking seat credentials',async t=>{
  const {origin,call}=await appFor(t);
  const created=(await call('/api/rooms',{method:'POST',payload:{name:'海风',capacity:3}})).body,sessions=[created.session];
  const stream=await fetch(`${origin}/api/rooms/${created.session.code}/events`,{headers:{Authorization:`Bearer ${created.session.token}`}});assert.match(stream.headers.get('content-type'),/event-stream/);
  const reader=stream.body.getReader(),decoder=new TextDecoder();t.after(()=>reader.cancel().catch(()=>{}));let buffer='';
  async function next(predicate){
    for(let i=0;i<30;i++){
      let end;
      while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(frame.startsWith('data: ')){const snapshot=JSON.parse(frame.slice(6));if(predicate(snapshot))return snapshot;}}
      const result=await reader.read();if(result.done)throw new Error('Stream closed early');buffer+=decoder.decode(result.value,{stream:true});
    }throw new Error('Expected update did not arrive');
  }
  let snapshot=await next(s=>s.seats[0].connected);assert.equal(snapshot.seats[0].name,'海风');
  for(const name of ['小满','阿屿'])sessions.push((await call(`/api/rooms/${sessions[0].code}/join`,{method:'POST',payload:{name}})).body.session);
  snapshot=await next(s=>s.seats.filter(Boolean).length===3);assert.equal(JSON.stringify(snapshot).includes('token'),false);
  for(let i=1;i<3;i++)await call(`/api/rooms/${sessions[i].code}/commands`,{method:'POST',token:sessions[i].token,payload:{command:'ready',ready:true,requestId:`http-ready-${i}`}});
  await call(`/api/rooms/${sessions[0].code}/commands`,{method:'POST',token:sessions[0].token,payload:{command:'start',requestId:'http-start-game'}});
  snapshot=await next(s=>s.game?.phase==='setup-settlement');assert.equal(snapshot.game.current,0);assert.equal('resources' in snapshot.game.players[1],false);
  const view=(await call(`/api/rooms/${sessions[1].code}`,{token:sessions[1].token})).body.snapshot;assert.equal(view.game.current,2);assert.equal(view.game.players[0].name,'小满');
  assert.equal('rng' in snapshot.game,false);assert.equal('deck' in snapshot.game,false);
  const built=await call(`/api/rooms/${sessions[0].code}/commands`,{method:'POST',token:sessions[0].token,payload:{command:'game',requestId:'http-first-village',expectedRevision:snapshot.gameRevision,action:{type:'settlement',id:0}}});assert.equal(built.status,200);
  snapshot=await next(s=>s.game?.phase==='setup-road');assert.equal(snapshot.game.vertices[0].owner,0);
  const peer=(await call(`/api/rooms/${sessions[1].code}`,{token:sessions[1].token})).body.snapshot;assert.equal(peer.game.vertices[0].owner,2);assert.equal(peer.game.phase,'setup-road');
});
