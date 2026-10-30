import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server/index.js';

let sequence=0;
async function setup(t){
  const keys=['window','document','fetch','setTimeout','clearTimeout'],descriptors=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{for(const [key,descriptor] of descriptors)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  const {RoomVerification}=await import(`../dist/online-security.js?test=${++sequence}`);
  return RoomVerification;
}

test('async SDK callback enables a single-use token, with expiry, error and timeout disabling new seats',async t=>{
  const RoomVerification=await setup(t);let callbacks,renders=0,resets=0,removes=0;
  const api={
    ready(){throw new Error('An async SDK must use its onload callback');},
    render(container,options){callbacks=options;renders++;return 'widget';},reset(){resets++;},remove(){removes++;},
  };
  globalThis.window={};
  globalThis.document={createElement:()=>({remove(){}}),head:{append(script){
    assert.match(script.src,/^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit&onload=catanTurnstileReady$/);
    assert.equal(script.async,true);queueMicrotask(()=>{window.turnstile=api;window.catanTurnstileReady();});
  }}};
  globalThis.fetch=async()=>Response.json({required:true,siteKey:'unit-site-key'});
  const changes=[],verification=new RoomVerification({},(ready,message)=>changes.push({ready,message}));
  await verification.mount();assert.equal(renders,1);assert.equal(verification.ready,false);
  assert.equal(callbacks.action,'catan_room');assert.equal(callbacks['response-field'],false);
  callbacks.callback('single-use');assert.equal(verification.ready,true);
  assert.equal(verification.take(),'single-use');assert.equal(verification.ready,false);assert.throws(()=>verification.take(),/人机验证/);
  verification.reset();assert.equal(resets,1);
  for(const name of ['expired-callback','error-callback','timeout-callback']){callbacks.callback('fresh');assert.equal(verification.ready,true);callbacks[name]();assert.equal(verification.ready,false);}
  verification.destroy();assert.equal(removes,1);const before=changes.length;
  callbacks.callback('late');assert.equal(changes.length,before);assert.equal(verification.ready,false);
  let finish;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
  const closed=new RoomVerification({},()=>{}),mounting=closed.mount();closed.destroy();
  finish(Response.json({required:true,siteKey:'unit-site-key'}));await mounting;assert.equal(renders,1);
});

test('local development is explicitly ready without loading a widget or inventing a token',async t=>{
  const RoomVerification=await setup(t);globalThis.window={};globalThis.document={createElement(){assert.fail('Local mode must not load the SDK');}};
  globalThis.fetch=async(path)=>{assert.equal(path,'/api/security');return Response.json({required:false});};
  const changes=[],verification=new RoomVerification({},(ready,message)=>changes.push({ready,message}));
  await verification.mount();assert.equal(verification.ready,true);assert.equal(verification.take(),undefined);
  verification.reset();assert.equal(verification.ready,true);assert.equal(changes.at(-1).message,'本地联机已就绪');
});

test('missing configuration, failed config requests and SDK failures keep create and join blocked',async t=>{
  const RoomVerification=await setup(t);globalThis.window={};let script;
  globalThis.document={createElement:()=>({remove(){}}),head:{append(value){script=value;queueMicrotask(()=>script.onerror());}}};
  for(const response of [Response.json({message:'人机验证正在准备'},{status:503}),Response.json({required:true})]){
    globalThis.fetch=async()=>response;let message='';const verification=new RoomVerification({},(_,value)=>{message=value;});
    await verification.mount();assert.equal(verification.ready,false);assert.throws(()=>verification.take(),/人机验证/);assert.match(message,/准备|配置/);
  }
  globalThis.fetch=async()=>Response.json({required:true,siteKey:'unit-site-key'});let message='';
  const verification=new RoomVerification({},(_,value)=>{message=value;});await verification.mount();assert.equal(verification.ready,false);assert.match(message,/无法载入人机验证/);
});

test('SDK load timeout and security request timeout provide a retry message and remain blocked',async t=>{
  const RoomVerification=await setup(t);globalThis.window={};let timeout;
  globalThis.setTimeout=callback=>{timeout=callback;return 1;};globalThis.clearTimeout=()=>{};
  globalThis.document={createElement:()=>({remove(){}}),head:{append(){queueMicrotask(()=>timeout());}}};
  globalThis.fetch=async()=>Response.json({required:true,siteKey:'unit-site-key'});let message='';
  const verification=new RoomVerification({},(_,value)=>{message=value;});await verification.mount();assert.equal(verification.ready,false);assert.match(message,/刷新页面/);
  globalThis.fetch=async()=>{throw new DOMException('Timed out','TimeoutError');};
  const timedOut=new RoomVerification({},(_,value)=>{message=value;});await timedOut.mount();assert.equal(timedOut.ready,false);assert.match(message,/超时/);
});

test('a removed entry cannot render late while a new entry can share the pending SDK',async t=>{
  const RoomVerification=await setup(t);globalThis.window={};let script;const rendered=[];
  globalThis.document={createElement:()=>({remove(){}}),head:{append(value){script=value;}}};
  globalThis.fetch=async()=>Response.json({required:true,siteKey:'unit-site-key'});
  const oldContainer={},newContainer={},old=new RoomVerification(oldContainer,()=>{}),oldMount=old.mount();
  for(let attempt=0;!script&&attempt<10;attempt++)await new Promise(resolve=>setImmediate(resolve));assert.ok(script);
  old.destroy();const current=new RoomVerification(newContainer,()=>{}),newMount=current.mount();
  globalThis.window.turnstile={render(container){rendered.push(container);return 'widget';},remove(){}};
  window.catanTurnstileReady();await Promise.all([oldMount,newMount]);
  assert.deepEqual(rendered,[newContainer]);assert.equal(old.ready,false);current.destroy();
});

test('widget rendering uses compact only when the available entry width is below 300px',async t=>{
  const RoomVerification=await setup(t),sizes=[];
  globalThis.window={turnstile:{render(container,options){sizes.push(options.size);return 'widget';},remove(){}}};
  globalThis.fetch=async()=>Response.json({required:true,siteKey:'unit-site-key'});
  for(const clientWidth of [360,300,284]){const verification=new RoomVerification({clientWidth},()=>{});await verification.mount();verification.destroy();}
  assert.deepEqual(sizes,['flexible','flexible','compact']);
});

test('the local Node service advertises development mode without credentials',async t=>{
  const app=createApp({directory:null});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{app.stopStreams();app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));});
  const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/security`);
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual(await response.json(),{required:false});
});

async function lobbyFixture({savedSession=null,recovery=[]}={}){
  const elements=new Map(),requests=[],verifications=[],connections=[],failures=[],session={code:'ABC234',token:'original-seat-token'},snapshot={code:'ABC234',capacity:3,me:0,hostSeat:0,seats:[{name:'海风',letter:'海',color:'#abc',ready:true,connected:true},null,null]},events=new Map();
  const element=selector=>{if(!elements.has(selector))elements.set(selector,{value:'',hidden:selector==='#room-panel',dataset:{},listeners:new Map(),addEventListener(type,handler){this.listeners.set(type,handler);},querySelectorAll(){return recovery.map((_,index)=>{const button=element(`recover-${index}`);button.dataset.recover=String(index);return button;});}});return elements.get(selector);};
  element('#room-capacity').value='3';element('#room-order').value='combined';element('#nickname').value='海风';
  class Verification{
    constructor(container,onChange){this.onChange=onChange;this.ready=false;this.token='';this.takes=0;this.resets=0;this.removes=0;verifications.push(this);}
    mount(){this.onChange(false,'正在载入人机验证…');return new Promise(()=>{});}
    take(){if(!this.ready)throw new Error('请先完成人机验证');this.takes++;this.ready=false;const token=this.token;this.token='';return token;}
    reset(){this.resets++;this.ready=false;this.token='';this.onChange(false,'请重新完成人机验证');}
    destroy(){this.removes++;this.ready=false;this.token='';}
  }
  class Connection{constructor(value,handlers){this.session=value;this.handlers=handlers;this.connected=true;connections.push(this);}accept(value){this.handlers.onSnapshot(value);}start(){this.handlers.onStatus('connected');}stop(){}async command(){return {ok:true};}}
  const request=async(path,options={})=>{requests.push({path,options});if(failures.length)throw failures.shift();return {session,snapshot};};
  const source=readFileSync(new URL('../dist/online/lobby.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'');
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const run=new AsyncFunction('RoomVerification','RoomConnection','readRoomSession','saveRoomSession','clearRoomSession','forgetRoomSession','readRoomRecovery','roomRequest','document','location','history','window','navigator',source+'\nreturn {enter,get verification(){return verification;}};');
  const result=await run(Verification,Connection,()=>savedSession,()=>{},()=>{},()=>{},()=>recovery,request,{querySelector:element,body:{dataset:{hosted:'true'}}},{search:'?room=ABC234',origin:'https://example.test',replace(){}},{replaceState(){}},{scrollTo(){},addEventListener(type,handler){events.set(type,handler);}},{clipboard:{writeText:async()=>{}}});
  return Object.assign(result,{element,requests,session,verifications,connections,failNextRequest(error){failures.push(error);}});
}

test('automatic seat recovery skips verification and manual recovery removes a loading entry',async()=>{
  const session={code:'ABC234',token:'original-seat-token'};
  const restored=await lobbyFixture({savedSession:session});
  assert.equal(restored.verification,null);assert.equal(restored.verifications.length,0);assert.equal(restored.element('#room-panel').hidden,false);
  assert.deepEqual(restored.requests,[{path:'/api/rooms/ABC234',options:{token:'original-seat-token'}}]);
  const manual=await lobbyFixture({recovery:[session]}),loading=manual.verification;await manual.element('recover-0').listeners.get('click')();
  assert.equal(loading.takes,0);assert.equal(loading.removes,1);assert.equal(manual.verification,null);assert.equal(manual.element('#room-panel').hidden,false);
  assert.deepEqual(manual.requests,[{path:'/api/rooms/ABC234',options:{token:'original-seat-token'}}]);
});

test('failed submissions reset one token while successful new seats remove verification until leaving',async()=>{
  const lobby=await lobbyFixture();assert.equal(lobby.element('#create-room').disabled,true);assert.equal(lobby.element('#join-room').disabled,true);
  await lobby.enter('create');assert.equal(lobby.requests.length,0);assert.match(lobby.element('#lobby-error').textContent,/人机验证/);
  const first=lobby.verification;first.ready=true;first.token='failed-token';lobby.failNextRequest(new Error('网络中断'));await lobby.enter('create');
  assert.equal(lobby.requests.length,1);assert.equal(lobby.requests[0].options.payload.turnstileToken,'failed-token');assert.equal(first.takes,1);assert.equal(first.resets,1);assert.equal(first.removes,0);assert.equal(lobby.element('#entry-panel').hidden,false);
  first.ready=true;first.token='create-token';await lobby.enter('create');
  assert.equal(lobby.requests.length,2);assert.equal(lobby.requests[1].options.payload.turnstileToken,'create-token');assert.equal(first.takes,2);assert.equal(first.resets,1);assert.equal(first.removes,1);assert.equal(lobby.verification,null);
  await lobby.enter('create');assert.equal(lobby.requests.length,2);
  await lobby.element('#leave-room').listeners.get('click')();const second=lobby.verification;
  assert.notEqual(second,first);assert.equal(lobby.verifications.length,2);assert.equal(lobby.element('#entry-panel').hidden,false);assert.equal(lobby.element('#create-room').disabled,true);assert.equal(lobby.element('#join-room').disabled,true);
  lobby.element('#room-code').value='WRONG';second.ready=true;second.token='join-token';await lobby.enter('join');
  assert.equal(lobby.requests.length,2);assert.equal(second.takes,0);assert.equal(second.resets,0);
  lobby.element('#room-code').value='ABC234';await lobby.enter('join');
  assert.equal(lobby.requests.length,3);assert.equal(lobby.requests[2].path,'/api/rooms/ABC234/join');assert.equal(lobby.requests[2].options.payload.turnstileToken,'join-token');assert.equal(second.takes,1);assert.equal(second.resets,0);assert.equal(second.removes,1);assert.equal(lobby.verification,null);
});

test('an invalid restored seat returns to a fresh verification entry',async()=>{
  const lobby=await lobbyFixture({savedSession:{code:'ABC234',token:'original-seat-token'}});
  assert.equal(lobby.verification,null);lobby.connections[0].handlers.onStatus('invalid');
  assert.equal(lobby.verifications.length,1);assert.equal(lobby.element('#entry-panel').hidden,false);assert.equal(lobby.element('#room-panel').hidden,true);
  assert.equal(lobby.element('#create-room').disabled,true);assert.equal(lobby.element('#join-room').disabled,true);assert.match(lobby.element('#lobby-error').textContent,/座位已失效/);
});
