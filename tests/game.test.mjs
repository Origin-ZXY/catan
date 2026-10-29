import test from 'node:test';
import assert from 'node:assert/strict';
import {RES,COST,newGame,isSetup,emptyResources,applyAction,points,publicPoints,total,legalSettlements,legalRoads,legalSetupRoads,legalCities,longestRoad,updateAwards,tradeRatio,tradeRecipient,distributeProduction,observe,conservation,adjacent,declineUnpayableOffer} from '../dist/game.js';
import {aiTurn,chooseAction} from '../dist/ai.js';
const fresh=(seed=42,options={})=>newGame(seed,{startPlayer:0,...options});
function ready(seed=42,options={}){const s=fresh(seed,options);for(let i=0;isSetup(s)&&i<8;i++)aiTurn(s,s.current);assert.equal(s.phase,'roll');return s;}
function emptyHands(s){for(const p of s.players)p.resources=emptyResources();s.bank=Object.fromEntries(RES.map(r=>[r,19]));}
function give(s,p,cards){for(const [r,n]of Object.entries(cards)){assert.ok(s.bank[r]>=n);s.bank[r]-=n;s.players[p].resources[r]+=n;}}
function funded(seed=42,options={}){const s=ready(seed,options);emptyHands(s);give(s,0,Object.fromEntries(RES.map(r=>[r,10])));s.phase='build';s.current=0;return s;}
function addCard(s,p,type,bought=0){const idx=s.deck.indexOf(type);assert.ok(idx>=0);s.deck.splice(idx,1);const card={type,bought,id:s.eventId++};s.players[p].dev.push(card);return card;}
function clearBoard(s){for(const v of s.vertices){v.owner=null;v.level=0;}for(const e of s.edges)e.owner=null;s.longestOwner=null;s.largestOwner=null;s.longest=s.players.map(()=>0);}
function cities(s,p,n){for(let i=0;i<n;i++){const id=legalSettlements(s,p,true)[0];s.vertices[id].owner=p;s.vertices[id].level=2;}}
function resolveRobber(s,p,tile){assert.equal(applyAction(s,p,{type:'robber',tile}).ok,true);if(s.phase==='victim')assert.equal(applyAction(s,p,{type:'victim',player:s.pendingVictims[0]}).ok,true);}
function path(s,length){function dfs(id,edges,seen){if(edges.length===length)return edges;for(const eid of s.vertices[id].edges){const e=s.edges[eid],next=e.a===id?e.b:e.a;if(seen.has(next))continue;const found=dfs(next,[...edges,eid],new Set([...seen,next]));if(found)return found;}return null;}return dfs(0,[],new Set([0]));}

test('random boards preserve tile/token/port inventories and keep every red number separated',()=>{
 for(let seed=1;seed<=600;seed++){const s=newGame(seed);assert.equal(s.tiles.length,19);assert.equal(s.vertices.length,54);assert.equal(s.edges.length,72);assert.equal(s.ports.length,9);assert.ok(s.vertices.every(v=>v.owner===null));assert.ok(s.edges.every(e=>e.owner===null));assert.ok(s.players.every(p=>total(p)===0));assert.ok(conservation(s));assert.deepEqual(s,newGame(seed));const red=s.tiles.filter(t=>[6,8].includes(t.number));assert.equal(red.length,4);for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)assert.notEqual(red[i].vertices.filter(id=>red[j].vertices.includes(id)).length,2);assert.equal(s.ports.filter(p=>p.type==='any').length,4);assert.deepEqual(s.ports.filter(p=>p.type!=='any').map(p=>p.type).sort(),[...RES].sort());const ends=s.ports.flatMap(p=>[p.a,p.b]);assert.equal(new Set(ends).size,18);for(const p of s.ports)assert.equal(s.vertices[p.a].tiles.filter(t=>s.vertices[p.b].tiles.includes(t)).length,1);}
});
test('three- and four-player setup rotates with any starting player and gives only second-village resources',()=>{
 for(const count of[3,4])for(let start=0;start<count;start++){let s=fresh(51,{playerCount:count,startPlayer:start});const order=Array.from({length:count},(_,i)=>(start+i)%count);assert.deepEqual(s.setupOrder,[...order,...[...order].reverse()]);for(let step=0;step<count*2;step++){const p=s.current,id=legalSettlements(s,p,true)[0],expected={...s.players[p].resources};if(step>=count)for(const tid of s.vertices[id].tiles){const t=s.tiles[tid];if(t.type!=='desert')expected[t.type]++;}assert.equal(applyAction(s,p,{type:'roll'}).ok,false);assert.equal(applyAction(s,p,{type:'settlement',id}).ok,true);assert.deepEqual(s.players[p].resources,expected);assert.ok(adjacent(s,s.vertices[id]).every(v=>v.owner===null));s=JSON.parse(JSON.stringify(s));assert.equal(s.setupVertex,id);assert.equal(applyAction(s,p,{type:'road',id:legalSetupRoads(s,p)[0]}).ok,true);assert.ok(conservation(s));}assert.equal(s.current,start);assert.equal(s.phase,'roll');assert.equal(s.turn,1);assert.equal(s.dice,null);for(const p of s.players){assert.equal(points(s,p.id),2);assert.equal(s.edges.filter(e=>e.owner===p.id).length,2);assert.ok(total(p)<=3);}}
});
test('setup forbids remote roads, double villages, premature dice and out-of-turn actions without mutations',()=>{
 const s=fresh(),before=structuredClone(s);for(const a of[{type:'roll'},{type:'end'},{type:'road',id:0},{type:'buyDev'}]){assert.equal(applyAction(s,0,a).ok,false);assert.deepEqual(s,before);}assert.equal(applyAction(s,1,{type:'settlement',id:0}).ok,false);const id=legalSettlements(s,0,true)[12];applyAction(s,0,{type:'settlement',id});const chosen=structuredClone(s),wrong=s.edges.find(e=>!s.vertices[id].edges.includes(e.id));assert.equal(applyAction(s,0,{type:'road',id:wrong.id}).ok,false);assert.equal(applyAction(s,0,{type:'settlement',id:30}).ok,false);assert.deepEqual(s,chosen);applyAction(s,0,{type:'road',id:legalSetupRoads(s,0)[0]});for(const p of[1,2,3,3,2,1]){assert.equal(s.current,p);aiTurn(s,p);}assert.equal(s.current,0);assert.equal(s.setupIndex,7);assert.equal(total(s.players[0]),0);const second=legalSettlements(s,0,true)[0];applyAction(s,0,{type:'settlement',id:second});const remote=s.vertices[id].edges.find(eid=>s.edges[eid].owner===null);assert.equal(applyAction(s,0,{type:'road',id:remote}).ok,false);
});
test('construction charges exact resources back into the bank and checks connection and distance',()=>{
 const s=funded(),id=legalRoads(s,0)[0];assert.equal(applyAction(s,0,{type:'road',id}).ok,true);assert.equal(s.players[0].resources.wood,9);assert.equal(s.bank.wood,10);const illegal=s.edges.find(e=>e.owner===null&&!legalRoads(s,0).includes(e.id)),before=structuredClone(s);assert.equal(applyAction(s,0,{type:'road',id:illegal.id}).ok,false);assert.deepEqual(s,before);const city=legalCities(s,0)[0];applyAction(s,0,{type:'city',id:city});assert.equal(s.vertices[city].level,2);assert.equal(s.players[0].resources.ore,7);assert.equal(s.bank.ore,12);assert.ok(conservation(s));
});
test('piece supplies limit cities, settlements and roads; upgrading returns a village piece',()=>{
 const s=funded();clearBoard(s);cities(s,0,4);assert.deepEqual(legalCities(s,0),[]);const chain=path(s,15);for(const id of chain)s.edges[id].owner=0;assert.deepEqual(legalRoads(s,0),[]);for(const v of s.vertices){v.owner=null;v.level=0;}for(let i=0;i<5;i++){const id=legalSettlements(s,0,true)[0];s.vertices[id].owner=0;s.vertices[id].level=1;}assert.deepEqual(legalSettlements(s,0,true),[]);const village=legalCities(s,0)[0];applyAction(s,0,{type:'city',id:village});assert.ok(legalSettlements(s,0,true).length>0);
});
test('multi-player resource shortages suppress only the short resource, while other resources still pay',()=>{
 const s=fresh();clearBoard(s);emptyHands(s);const a=s.tiles.find(t=>t.type==='wood'),b=s.tiles.find(t=>t.id!==a.id&&t.vertices.filter(v=>a.vertices.includes(v)).length===2);b.type='ore';for(const t of s.tiles)t.number=null;a.number=b.number=8;s.robber=s.tiles.find(t=>t.id!==a.id&&t.id!==b.id).id;const common=a.vertices.find(v=>b.vertices.includes(v)),other=a.vertices.find(v=>!b.vertices.includes(v)&&!adjacent(s,s.vertices[common]).some(n=>n.id===v));s.vertices[common].owner=0;s.vertices[common].level=1;s.vertices[other].owner=1;s.vertices[other].level=1;give(s,2,{wood:18});distributeProduction(s,8);assert.equal(s.players[0].resources.wood,0);assert.equal(s.players[1].resources.wood,0);assert.equal(s.bank.wood,1);assert.equal(s.players[0].resources.ore,1);assert.ok(conservation(s));
});
test('a sole resource recipient gets the available remainder instead of nothing',()=>{
 const s=fresh();clearBoard(s);emptyHands(s);const t=s.tiles.find(t=>t.type==='wood');for(const tile of s.tiles)tile.number=null;t.number=9;s.robber=(t.id+1)%19;s.vertices[t.vertices[0]].owner=0;s.vertices[t.vertices[0]].level=2;give(s,1,{wood:18});distributeProduction(s,9);assert.equal(s.players[0].resources.wood,1);assert.equal(s.bank.wood,0);assert.ok(conservation(s));
});
test('maritime trade supports quantity and ports but cannot overdraw finite stock',()=>{
 const s=funded();for(const port of s.ports)s.vertices[port.a].owner=0;for(const r of RES)assert.equal(tradeRatio(s,0,r),2);assert.equal(applyAction(s,0,{type:'bank',give:'wood',get:'ore',units:2}).ok,true);assert.equal(s.players[0].resources.wood,6);assert.equal(s.players[0].resources.ore,12);assert.equal(s.bank.wood,13);assert.equal(s.bank.ore,7);const before=structuredClone(s);assert.equal(applyAction(s,0,{type:'bank',give:'wood',get:'ore',units:8}).ok,false);assert.deepEqual(s,before);assert.equal(applyAction(s,1,{type:'bank',give:'wood',get:'ore'}).ok,false);assert.ok(conservation(s));
});
test('all seven-event discards finish before the robber moves and discarded cards return to the bank',()=>{
 const s=ready();emptyHands(s);give(s,0,{wood:8});give(s,1,{wood:8});s.current=2;s.phase='discard';s.returnPhase='build';s.discardRequired=[4,4,0,0];s.discardLeft=4;const before=structuredClone(s);assert.equal(applyAction(s,2,{type:'robber',tile:(s.robber+1)%19}).ok,false);assert.deepEqual(s,before);assert.equal(applyAction(s,0,{type:'discard',resources:{wood:3}}).ok,false);applyAction(s,0,{type:'discard',resources:{wood:4}});assert.equal(s.phase,'discard');assert.equal(s.bank.wood,7);applyAction(s,1,{type:'discard',resources:{wood:4}});assert.equal(s.phase,'robber');assert.equal(s.bank.wood,11);assert.equal(s.current,2);assert.ok(conservation(s));
});
test('knights can be played before dice, do not trigger discards and return to the pending roll',()=>{
 const s=funded();s.phase='roll';const card=addCard(s,0,'knight');assert.equal(applyAction(s,0,{type:'dev',id:card.id}).ok,true);assert.equal(s.phase,'robber');assert.ok(s.discardRequired.every(n=>n===0));const t=s.tiles.find(t=>t.id!==s.robber&&t.vertices.some(id=>s.vertices[id].owner===1));resolveRobber(s,0,t.id);assert.equal(s.phase,'roll');assert.equal(s.dice,null);assert.equal(s.playedDev,true);assert.ok(conservation(s));
});
test('empty-handed neighboring opponents remain legal robber victims',()=>{
 const s=ready();emptyHands(s);const tile=s.tiles.find(t=>t.id!==s.robber&&new Set(t.vertices.map(id=>s.vertices[id].owner).filter(p=>p!==null&&p!==0)).size>1);assert.ok(tile);s.phase='robber';s.returnPhase='build';applyAction(s,0,{type:'robber',tile:tile.id});assert.equal(s.phase,'victim');assert.ok(s.pendingVictims.length>1);applyAction(s,0,{type:'victim',player:s.pendingVictims[0]});assert.equal(s.phase,'build');assert.equal(total(s.players[0]),0);assert.ok(conservation(s));
});
test('road building resolves consecutive free roads before returning to the pre-roll phase',()=>{
 const s=funded();s.phase='roll';const card=addCard(s,0,'roads'),beforeRes={...s.players[0].resources};applyAction(s,0,{type:'dev',id:card.id});assert.equal(s.phase,'road-building');assert.equal(applyAction(s,0,{type:'bank',give:'wood',get:'ore'}).ok,false);assert.equal(applyAction(s,0,{type:'city',id:legalCities(s,0)[0]}).ok,false);applyAction(s,0,{type:'road',id:legalRoads(s,0)[0]});assert.equal(s.phase,'road-building');assert.equal(s.freeRoads,1);applyAction(s,0,{type:'road',id:legalRoads(s,0)[0]});assert.equal(s.phase,'roll');assert.equal(s.dice,null);assert.deepEqual(s.players[0].resources,beforeRes);assert.ok(conservation(s));
});
test('road card stops when the final available road piece is used',()=>{
 const s=funded();clearBoard(s);for(const id of path(s,14))s.edges[id].owner=0;const c=addCard(s,0,'roads');assert.ok(legalRoads(s,0).length);applyAction(s,0,{type:'dev',id:c.id});applyAction(s,0,{type:'road',id:legalRoads(s,0)[0]});assert.equal(s.edges.filter(e=>e.owner===0).length,15);assert.equal(s.phase,'build');
});
test('plenty validates finite bank inventory before consuming the card; one development card per turn',()=>{
 const s=ready();emptyHands(s);give(s,1,{ore:18});const c=addCard(s,0,'plenty'),other=addCard(s,0,'knight');const before=structuredClone(s);assert.equal(applyAction(s,0,{type:'dev',id:c.id,resources:['ore','ore']}).ok,false);assert.deepEqual(s,before);assert.equal(applyAction(s,0,{type:'dev',id:c.id,resources:['ore','wood']}).ok,true);assert.equal(s.phase,'roll');assert.equal(s.bank.ore,0);assert.equal(s.players[0].resources.wood,1);assert.equal(applyAction(s,0,{type:'dev',id:other.id}).ok,false);assert.ok(conservation(s));
});
test('new development cards cannot be played that turn and purchase returns the exact cost',()=>{
 const s=funded(),before={...s.bank};const type=s.deck[s.deck.length-1];applyAction(s,0,{type:'buyDev'});const card=s.players[0].dev.at(-1);assert.equal(card.type,type);for(const r of['ore','wheat','sheep'])assert.equal(s.bank[r],before[r]+1);assert.equal(applyAction(s,0,{type:'dev',id:card.id,resources:['ore','ore']}).ok,false);assert.ok(conservation(s));
});
test('multi-resource offers can be countered, accepted and rejected without transferring before consent',()=>{
 const s=funded();give(s,1,{ore:3,wheat:3});const offer={type:'offer',with:1,give:{wood:2,brick:1},get:{ore:1,wheat:2}},before0={...s.players[0].resources},before1={...s.players[1].resources};assert.equal(applyAction(s,0,offer).ok,true);assert.deepEqual(s.players[0].resources,before0);assert.deepEqual(s.players[1].resources,before1);assert.equal(tradeRecipient(s.offer),1);assert.equal(applyAction(s,2,{type:'respond',accept:true}).ok,false);assert.equal(applyAction(s,1,{type:'counter',give:{wood:3,brick:1},get:{ore:1,wheat:2}}).ok,true);assert.equal(tradeRecipient(s.offer),0);assert.equal(applyAction(s,0,{type:'respond',accept:true}).ok,true);assert.equal(s.players[0].resources.wood,7);assert.equal(s.players[0].resources.ore,11);assert.equal(s.players[1].resources.wood,3);assert.equal(s.offer,null);assert.ok(conservation(s));applyAction(s,0,offer);applyAction(s,1,{type:'respond',accept:false});assert.equal(s.offer,null);
});
test('trade rejects gifts, same-resource swaps and off-turn offers; unknown requested holdings are not leaked',()=>{
 const s=funded();for(const deal of[{give:{wood:1},get:{}},{give:{wood:1},get:{wood:2}},{give:{wood:-1},get:{ore:1}}])assert.equal(applyAction(s,0,{type:'offer',with:1,...deal}).ok,false);assert.equal(applyAction(s,1,{type:'offer',with:2,give:{wood:1},get:{ore:1}}).ok,false);assert.equal(applyAction(s,0,{type:'offer',with:1,give:{wood:1},get:{ore:19}}).ok,true);assert.equal(applyAction(s,1,{type:'respond',accept:true}).ok,false);assert.equal(s.players[0].resources.wood,10);applyAction(s,1,{type:'respond',accept:false});assert.ok(conservation(s));
});
test('classic trade/build order closes after paid construction, while development roads do not close it',()=>{
 const s=funded(42,{combinedTradeBuild:false}),card=addCard(s,0,'roads');applyAction(s,0,{type:'dev',id:card.id});for(let i=0;i<2;i++)applyAction(s,0,{type:'road',id:legalRoads(s,0)[0]});assert.equal(s.tradeOpen,true);applyAction(s,0,{type:'city',id:legalCities(s,0)[0]});assert.equal(s.tradeOpen,false);assert.equal(applyAction(s,0,{type:'bank',give:'wood',get:'ore'}).ok,false);const free=funded(42,{combinedTradeBuild:true});applyAction(free,0,{type:'city',id:legalCities(free,0)[0]});assert.equal(free.tradeOpen,true);assert.equal(applyAction(free,0,{type:'bank',give:'wood',get:'ore'}).ok,true);
});
test('longest route handles loops, interruptions, ties and minimum length',()=>{
 const s=fresh();clearBoard(s);const t=s.tiles.find(t=>t.q===0&&t.r===0);for(let j=0;j<6;j++){const a=t.vertices[j],b=t.vertices[(j+1)%6];s.edges.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)).owner=0;}assert.equal(longestRoad(s,0),6);s.vertices[t.vertices[0]].owner=1;assert.equal(longestRoad(s,0),6);s.vertices[t.vertices[3]].owner=1;assert.equal(longestRoad(s,0),3);updateAwards(s);assert.equal(s.longestOwner,null);s.vertices[t.vertices[3]].owner=null;updateAwards(s);assert.equal(s.longestOwner,0);
});
test('largest army can immediately win before dice without completing the robber event',()=>{
 const s=funded();clearBoard(s);cities(s,0,3);addCard(s,0,'point');addCard(s,0,'point');s.players[0].knights=2;s.phase='roll';const c=addCard(s,0,'knight');assert.equal(points(s,0),8);applyAction(s,0,{type:'dev',id:c.id});assert.equal(s.phase,'over');assert.equal(s.winner,0);assert.equal(s.dice,null);assert.equal(points(s,0),10);
});
test('the first free road can win immediately, without forcing the second road',()=>{
 const s=funded();clearBoard(s);cities(s,0,3);addCard(s,0,'point');addCard(s,0,'point');const route=path(s,5);for(const id of route.slice(0,4))s.edges[id].owner=0;updateAwards(s);const c=addCard(s,0,'roads');s.phase='roll';applyAction(s,0,{type:'dev',id:c.id});applyAction(s,0,{type:'road',id:route[4]});assert.equal(s.phase,'over');assert.equal(s.winner,0);assert.equal(s.freeRoads,1);assert.equal(s.dice,null);
});
test('a newly purchased victory point wins despite an earlier development card that turn',()=>{
 const s=funded();clearBoard(s);cities(s,0,4);addCard(s,0,'point');s.playedDev=true;const idx=s.deck.indexOf('point');s.deck.push(...s.deck.splice(idx,1));assert.equal(points(s,0),9);applyAction(s,0,{type:'buyDev'});assert.equal(s.phase,'over');assert.equal(s.winner,0);assert.equal(points(s,0),10);assert.ok(conservation(s));
});
test('ten points during another player\'s turn waits until the owner\'s turn begins',()=>{
 const s=funded();clearBoard(s);cities(s,1,4);addCard(s,1,'point');addCard(s,1,'point');assert.equal(points(s,1),10);assert.equal(s.phase,'build');applyAction(s,0,{type:'end'});assert.equal(s.phase,'over');assert.equal(s.winner,1);
});
test('AI observations omit secret hands, hidden points, future deck and RNG; decisions cannot depend on them',()=>{
 const s=ready();emptyHands(s);give(s,1,{wood:3});give(s,2,{ore:3});addCard(s,0,'monopoly');addCard(s,1,'knight');s.current=0;s.phase='build';const hidden=structuredClone(s);hidden.players[1].resources={...emptyResources(),ore:3};hidden.players[2].resources={...emptyResources(),wood:3};hidden.players[1].dev[0].type='point';hidden.rng=12345;hidden.seed=777;hidden.deck.reverse();const a=observe(s,0),b=observe(hidden,0);assert.deepEqual(a,b);assert.ok(!('resources'in a.players[1]));assert.ok(!('dev'in a.players[1]));assert.ok(!('deck'in a));assert.ok(!('rng'in a));assert.ok(!('seed'in a));assert.equal(a.players[1].publicScore,publicPoints(s,1));const before=structuredClone(a);assert.deepEqual(chooseAction(a),chooseAction(b));assert.deepEqual(a,before);
});
test('complete games with finite stock, fair AI, negotiations and all supported setups reach a valid winner',()=>{
 for(const playerCount of[3,4])for(const combinedTradeBuild of[false,true])for(let seed=1;seed<=8;seed++){const s=newGame(seed,{playerCount,combinedTradeBuild});let steps=0;while(s.phase!=='over'&&steps++<3500){const actor=s.phase==='discard'?s.discardRequired.findIndex(n=>n>0):s.offer?tradeRecipient(s.offer):s.current;const before=[s.eventId,s.turn,s.current,s.phase,s.setupIndex].join(',');aiTurn(s,actor);assert.ok(conservation(s),`resource conservation seed ${seed}`);assert.ok([s.eventId,s.turn,s.current,s.phase,s.setupIndex].join(',')!==before||s.phase==='over',`stalled ${s.phase} seed ${seed}`);for(const p of s.players)assert.ok(RES.every(r=>Number.isInteger(p.resources[r])&&p.resources[r]>=0));}assert.equal(s.phase,'over',`unfinished seed ${seed}`);assert.ok(points(s,s.winner)>=10);assert.equal(s.current,s.winner);}
});

test('unpayable incoming offers are privately declined without affecting outgoing or affordable deals',()=>{
 const s=funded();s.current=1;give(s,1,{ore:3});
 assert.equal(applyAction(s,1,{type:'offer',with:0,give:{ore:1},get:{wood:11}}).ok,true);
 const before=s.players.map(p=>({...p.resources}));
 assert.equal(declineUnpayableOffer(s,0),true);assert.equal(s.offer,null);
 assert.deepEqual(s.players.map(p=>p.resources),before);
 assert.equal(s.logs[0].text,'你拒绝了这笔交易');assert.equal(s.logs[0].kind,'trade-declined');
 applyAction(s,1,{type:'offer',with:0,give:{ore:1},get:{wood:1}});
 assert.equal(declineUnpayableOffer(s,0),false);assert.ok(s.offer);
 applyAction(s,0,{type:'respond',accept:false});s.current=0;
 applyAction(s,0,{type:'offer',with:1,give:{wood:1},get:{ore:19}});
 assert.equal(declineUnpayableOffer(s,0),false);assert.ok(s.offer);
 applyAction(s,1,{type:'counter',give:{wood:11},get:{ore:1}});
 assert.equal(declineUnpayableOffer(s,0),true);assert.equal(s.offer,null);assert.ok(conservation(s));
});

// This fixed map and two accepted trades are the route taught by the click guide.
test('the guided first turn can reach a third village using only real setup, production and trade',()=>{
 const s=newGame(25,{playerCount:3,startPlayer:0,combinedTradeBuild:true});
 const act=(type,id)=>{assert.equal(applyAction(s,0,{type,id}).ok,true);assert.ok(conservation(s));};
 act('settlement',31);act('road',39);while(s.current!==0)aiTurn(s,s.current);
 assert.equal(s.setupIndex,5);act('settlement',19);act('road',23);
 assert.deepEqual(s.players[0].resources,{wood:1,brick:1,sheep:1,wheat:0,ore:0});
 act('roll');assert.equal(s.dice[0]+s.dice[1],5);
 for(const deal of [{with:1,give:{sheep:1},get:{wheat:1}},{with:2,give:{wood:1},get:{brick:1}}]){
  assert.equal(applyAction(s,0,{type:'offer',...deal}).ok,true);aiTurn(s,deal.with);assert.equal(s.offer,null);
 }
 assert.deepEqual(s.players[0].resources,{wood:2,brick:2,sheep:1,wheat:1,ore:0});
 act('road',16);act('settlement',2);assert.equal(points(s,0),3);assert.equal(total(s.players[0]),0);
 act('end');assert.equal(s.current,1);
});
