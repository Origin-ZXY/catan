import test from 'node:test';
import assert from 'node:assert/strict';
import {SQLiteD1} from '../server/sqlite-d1.js';
import {readFileSync} from 'node:fs';
import {CloudRooms} from '../worker/cloud-rooms.js';
import {createWorker} from '../worker/index.js';
import {chooseAction} from '../dist/ai.js';
import {tradeRecipient,conservation,points} from '../dist/game.js';

// Real SQLite executes every production query. Promise boundaries allow two
// requests to read the same revision before either performs its conditional write.
class D1 extends SQLiteD1 {constructor(){super();this.database.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));}}
const verificationEnv={TURNSTILE_SITE_KEY:'test-public-site-key',TURNSTILE_SECRET_KEY:'test-only-secret',TURNSTILE_EXPECTED_HOSTNAME:'catan.example'};
const acceptedVerification=()=>Response.json({success:true,hostname:'catan.example',action:'catan_room'});

let sequence=0;
async function command(api,session,kind,extra={}){return api.command(session.code,session.token,{command:kind,requestId:`cloud-test-${++sequence}`,...extra});}
async function started(api,capacity=3){
  const host=await api.create({name:'海风',capacity}),sessions=[host.session];
  for(let i=1;i<capacity;i++)sessions.push((await api.join(host.session.code,{name:`朋友${i}`})).session);
  for(const session of sessions.slice(1))await command(api,session,'ready',{ready:true});
  await command(api,sessions[0],'start');return sessions;
}

test('cloud rooms survive new request instances while each guest receives only their own hand',async t=>{
  const db=new D1();t.after(()=>db.close());const api=new CloudRooms(db,{seed:()=>42}),sessions=await started(api,4);
  for(let i=0;i<4;i++){
    const snapshot=await new CloudRooms(db).snapshot(sessions[i].code,sessions[i].token);
    assert.equal(snapshot.me,i);assert.equal(snapshot.transport,'poll');assert.equal(snapshot.hosted,true);assert.equal(snapshot.game.me,0);
    assert.equal(snapshot.game.players[0].name,i?`朋友${i}`:'海风');
    for(const peer of snapshot.game.players.slice(1)){assert.equal('resources' in peer,false);assert.equal('dev' in peer,false);}
    assert.equal('rng' in snapshot.game,false);assert.equal('seed' in snapshot.game,false);assert.equal('deck' in snapshot.game,false);assert.equal(JSON.stringify(snapshot).includes(sessions[i].token),false);
  }
  await assert.rejects(()=>api.snapshot(sessions[0].code,'forged-token'),error=>error.status===401);
});
test('simultaneous joins reserve distinct seats without losing either participant',async t=>{
  const db=new D1();t.after(()=>db.close());const api=new CloudRooms(db),created=await api.create({capacity:3});
  const joined=await Promise.allSettled(['青山','小满','晚风'].map(name=>new CloudRooms(db).join(created.session.code,{name})));
  assert.equal(joined.filter(x=>x.status==='fulfilled').length,2);assert.equal(joined.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
  const snapshot=await api.snapshot(created.session.code,created.session.token);assert.equal(snapshot.seats.filter(Boolean).length,3);assert.equal(new Set(snapshot.seats.map(s=>s.name)).size,3);
});
test('concurrent repeated actions commit once and distinct stale actions are rejected',async t=>{
  const db=new D1();t.after(()=>db.close());const api=new CloudRooms(db),sessions=await started(api),host=sessions[0],snapshot=await api.snapshot(host.code,host.token);
  const request={command:'game',requestId:'same-network-retry',expectedRevision:snapshot.gameRevision,action:{type:'settlement',id:0}};
  const duplicate=await Promise.all([new CloudRooms(db).command(host.code,host.token,request),new CloudRooms(db).command(host.code,host.token,request)]);assert.ok(duplicate.every(r=>r.ok));
  const after=await api.snapshot(host.code,host.token);assert.equal(after.gameRevision,snapshot.gameRevision+1);assert.equal(after.game.phase,'setup-road');assert.equal(after.game.vertices.filter(v=>v.owner!==null).length,1);
  const roads=after.game.vertices[0].edges;
  const competing=await Promise.allSettled(roads.slice(0,2).map(id=>new CloudRooms(db).command(host.code,host.token,{command:'game',requestId:`different-road-${id}`,expectedRevision:after.gameRevision,action:{type:'road',id}})));
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(competing.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
});
test('presence supports multiple connections per seat and expires disconnected guests',async t=>{
  const db=new D1();t.after(()=>db.close());let now=100000;const api=new CloudRooms(db,{now:()=>now}),{session}=await api.create();
  await api.snapshot(session.code,session.token,'window-connection-1');await api.snapshot(session.code,session.token,'window-connection-2');
  await api.disconnect(session.code,session.token,'window-connection-1');assert.equal((await api.snapshot(session.code,session.token)).seats[0].connected,true);
  now+=36000;assert.equal((await api.snapshot(session.code,session.token)).seats[0].connected,false);
  now+=7*24*60*60*1000;await assert.rejects(()=>api.snapshot(session.code,session.token),error=>error.status===404);await api.cleanup();assert.equal(db.database.prepare('SELECT count(*) AS n FROM catan_rooms').get().n,0);
});
test('public creation and join limits are atomic and store hashed identities',async t=>{
  const db=new D1();t.after(()=>db.close());let now=1000;const api=new CloudRooms(db,{now:()=>now});
  const results=await Promise.allSettled(Array.from({length:5},()=>api.limit('test','203.0.113.8',2,60000)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===429).length,3);
  assert.equal(JSON.stringify(db.database.prepare('SELECT key FROM catan_limits').all()).includes('203.0.113.8'),false);
  now+=60000;await api.limit('test','203.0.113.8',2,60000);
});
test('hosted HTTP serves anonymous invitations, authenticates room state and blocks private source paths',async t=>{
  const db=new D1();t.after(()=>db.close());const tasks=[],ctx={waitUntil(promise){tasks.push(promise);}},worker=createWorker({'/online/index.html':'<body class="lobby-page">好友联机 · 本地试玩</body>','/app.js':'console.log("game")'},{verifyFetch:acceptedVerification});
  async function call(path,{method='GET',body,token,origin}={}){
    const response=await worker.fetch(new Request('https://catan.example'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB:db,...verificationEnv},ctx);
    return {response,value:response.headers.get('Content-Type')?.includes('json')?await response.json():await response.text()};
  }
  const page=await call('/online/');assert.equal(page.response.status,200);assert.match(page.value,/data-hosted="true"/);assert.doesNotMatch(page.value,/本地试玩/);
  const created=await call('/api/rooms',{method:'POST',body:{name:'海风',capacity:3,turnstileToken:'http-host-token'}});assert.equal(created.response.status,201);const session=created.value.session;
  assert.equal((await call(`/api/rooms/${session.code}`)).response.status,401);
  assert.equal((await call(`/api/rooms/${session.code}`,{token:session.token})).value.snapshot.seats[0].name,'海风');
  assert.equal((await call('/api/rooms',{method:'POST',body:{},origin:'https://evil.example'})).response.status,403);
  for(const path of ['/server/rooms.js','/.catan-rooms/private.json','/.openai/hosting.json'])assert.equal((await call(path)).response.status,404);
  await Promise.all(tasks);
});
test('hosted three- and four-player games finish using persisted public command snapshots',async t=>{
  const db=new D1();t.after(()=>db.close());const api=new CloudRooms(db,{seed:()=>42});
  for(const capacity of [3,4]){
    const sessions=await started(api,capacity),host=sessions[0];let moves=0,snapshot=await api.snapshot(host.code,host.token);
    while(snapshot.game.phase!=='over'&&moves++<2400){
      const game=snapshot.game,actor=game.phase==='discard'?game.discardRequired.findIndex(n=>n>0):game.offer?tradeRecipient(game.offer):game.current;
      const own=await api.snapshot(host.code,sessions[actor].token),action=chooseAction(own.game);assert.ok(action,`stalled in ${game.phase}`);
      await command(api,sessions[actor],'game',{expectedRevision:own.gameRevision,action});snapshot=await api.snapshot(host.code,host.token);
    }
    assert.equal(snapshot.game.phase,'over');assert.ok(points(snapshot.game,snapshot.game.winner)>=10);
    const authoritative=JSON.parse((await api.load(host.code)).body).game;assert.ok(conservation(authoritative));
  }
});

function hostedVerificationHarness(t,verifyFetch){
  const db=new D1(),tasks=[],worker=createWorker({},{verifyFetch});
  t.after(async()=>{await Promise.all(tasks);db.close();});
  return {db,worker,async call(path,{method='GET',body,token,ip='203.0.113.8',environment={DB:db,...verificationEnv}}={}){
    const request=new Request('https://catan.example'+path,{
      method,headers:{'CF-Connecting-IP':ip,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},
      ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    });
    const response=await worker.fetch(request,environment,{waitUntil(task){tasks.push(task);}});
    return {status:response.status,value:await response.json()};
  }};
}

test('hosted security publishes no private configuration and needs no database connection',async()=>{
  const worker=createWorker({});
  const response=await worker.fetch(new Request('https://catan.example/api/security'),verificationEnv);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{required:true,siteKey:verificationEnv.TURNSTILE_SITE_KEY});
});

test('hosted creation and join require fresh verified tokens while existing seats restore and command without challenges',async t=>{
  const consumed=new Set(),calls=[];
  const {db,call}=hostedVerificationHarness(t,async(url,options)=>{
    const token=options.body.get('response');calls.push(token);
    assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options.body.get('secret'),verificationEnv.TURNSTILE_SECRET_KEY);
    assert.equal(options.body.get('remoteip'),'203.0.113.8');
    if(consumed.has(token))return Response.json({success:false,'error-codes':['timeout-or-duplicate']});
    consumed.add(token);return acceptedVerification();
  });
  const created=await call('/api/rooms',{method:'POST',body:{name:'海风',capacity:3,turnstileToken:'host-fresh'}});
  assert.equal(created.status,201);const host=created.value.session;
  assert.equal((await call('/api/rooms',{method:'POST',body:{turnstileToken:'host-fresh'}})).status,403);
  assert.equal(db.database.prepare('SELECT count(*) AS n FROM catan_rooms').get().n,1);
  assert.equal((await call(`/api/rooms/${host.code}/join`,{method:'POST',body:{name:'重复',turnstileToken:'host-fresh'}})).status,403);
  const joined=await call(`/api/rooms/${host.code}/join`,{method:'POST',body:{name:'小满',turnstileToken:'guest-fresh'}});
  assert.equal(joined.status,201);const guest=joined.value.session;
  assert.equal((await call(`/api/rooms/${host.code}/join`,{method:'POST',body:{name:'重复',turnstileToken:'guest-fresh'}})).status,403);
  const restored=await call(`/api/rooms/${host.code}`,{token:host.token,environment:{DB:db}});
  assert.equal(restored.status,200);assert.equal(restored.value.snapshot.seats.filter(Boolean).length,2);
  const ready=await call(`/api/rooms/${host.code}/commands`,{method:'POST',token:guest.token,body:{command:'ready',ready:true,requestId:'verified-seat-ready'},environment:{DB:db}});
  assert.equal(ready.status,200);assert.equal(ready.value.snapshot.seats[1].ready,true);
  assert.equal((await call(`/api/rooms/${host.code}`,{token:'forged-token',environment:{DB:db}})).status,401);
  assert.equal((await call(`/api/rooms/${host.code}/presence`,{method:'DELETE',token:host.token,environment:{DB:db}})).status,200);
  assert.deepEqual(calls,['host-fresh','host-fresh','host-fresh','guest-fresh','guest-fresh']);
});

test('hosted verification failures never allocate a room or a new seat',async t=>{
  const cases=[
    {name:'missing token',body:{},fetch:()=>assert.fail('missing tokens must not contact Siteverify'),status:403},
    {name:'replayed token',fetch:async()=>Response.json({success:false,'error-codes':['timeout-or-duplicate']}),status:403},
    {name:'wrong hostname',fetch:async()=>Response.json({success:true,hostname:'evil.example',action:'catan_room'}),status:403},
    {name:'wrong action',fetch:async()=>Response.json({success:true,hostname:'catan.example',action:'patchwork_room'}),status:403},
    {name:'network unavailable',fetch:async()=>{throw new Error('offline');},status:503},
    {name:'upstream unavailable',fetch:async()=>new Response('unavailable',{status:503}),status:503},
    {name:'malformed response',fetch:async()=>new Response('invalid json'),status:503},
    {name:'verification timeout',fetch:async()=>{throw new DOMException('timed out','TimeoutError');},status:503},
    ...Object.keys(verificationEnv).map(key=>({name:`missing ${key}`,environment:{...verificationEnv,[key]:undefined},fetch:()=>assert.fail('missing configuration must not contact Siteverify'),status:503})),
  ];
  for(const scenario of cases)await t.test(scenario.name,async sub=>{
    const {db,call}=hostedVerificationHarness(sub,scenario.fetch),api=new CloudRooms(db),existing=await api.create({capacity:3});
    const options={method:'POST',body:scenario.body??{turnstileToken:'attempt-token'},environment:{DB:db,...(scenario.environment??verificationEnv)}};
    assert.equal((await call('/api/rooms',options)).status,scenario.status);
    assert.equal((await call(`/api/rooms/${existing.session.code}/join`,options)).status,scenario.status);
    assert.equal(db.database.prepare('SELECT count(*) AS n FROM catan_rooms').get().n,1);
    assert.equal((await api.snapshot(existing.session.code,existing.session.token)).seats.filter(Boolean).length,1);
    if(scenario.environment)assert.equal((await call('/api/security',{environment:options.environment})).status,503);
  });
});
