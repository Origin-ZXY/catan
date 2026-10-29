import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,conservation,points,total,legalRoads} from '../dist/game.js';
import {aiTurn} from '../dist/ai.js';
import {LESSON_INFO,createLessonState} from '../dist/lessons.js';
import {advanceGuide,getGuideSteps,getGuideTarget} from '../dist/tutorial.js';

const play=(s,a)=>{const result=applyAction(s,0,a);assert.equal(result.ok,true,result.message);assert.ok(conservation(s));return result;};
const advance=(lesson,step,s,ui={})=>advanceGuide(step,s,ui,lesson);

test('every lesson starts with independent, conserved resource and development-card supplies',()=>{
 for(const lesson of Object.keys(LESSON_INFO)){
  const s=createLessonState(lesson);assert.ok(conservation(s));
  assert.equal(s.deck.length+s.playedCards.length+s.players.reduce((n,p)=>n+p.dev.length,0),25);
  assert.ok(getGuideSteps(lesson).length>0);
  s.players[0].resources.wood=999;
  assert.ok(conservation(createLessonState(lesson)));
 }
});
test('robber lesson reaches a legal blocked tile only after everyone discards, then steals one card',()=>{
 const s=createLessonState('robber');let step=0;
 step=advance('robber',step,s,{discarded:{wood:3}});assert.equal(step,1);
 step=advance('robber',step,s,{discarded:{wood:3,brick:2}});assert.equal(step,2);
 aiTurn(s,1);assert.equal(s.phase,'discard');
 play(s,{type:'discard',resources:{wood:3,brick:2}});
 step=advance('robber',step,s);assert.equal(step,3);
 play(s,{type:'robber',tile:1});assert.equal(total(s.players[0]),6);assert.equal(s.robber,1);
 step=advance('robber',step,s);assert.ok(getGuideSteps('robber')[step].done);
});
test('purchase lessons charge the real cost, draw the intended teaching card and explain its timing',()=>{
 for(const lesson of['buy','point']){
  const s=createLessonState(lesson),step=advance(lesson,0,s,{modal:'dev'});assert.equal(step,1);
  play(s,{type:'buyDev'});assert.equal(total(s.players[0]),0);
  assert.equal(s.players[0].dev[0].type,lesson==='buy'?'knight':'point');
  const end=advance(lesson,step,s,{modal:'dev'});assert.ok(getGuideSteps(lesson)[end].done);
  assert.equal(points(s,0),lesson==='buy'?3:4);
  if(lesson==='buy')assert.equal(applyAction(s,0,{type:'dev',id:s.players[0].dev[0].id}).ok,false);
 }
});
test('third knight lesson awards two points before moving the robber and preserves the pending roll',()=>{
 const s=createLessonState('knight');assert.equal(points(s,0),3);
 let step=advance('knight',0,s,{modal:'dev'});assert.equal(step,1);
 play(s,{type:'dev',id:s.players[0].dev[0].id});
 step=advance('knight',step,s);assert.equal(step,2);assert.equal(s.largestOwner,0);assert.equal(points(s,0),5);
 assert.equal(total(s.players[0]),10);assert.ok(s.discardRequired.every(n=>n===0));
 play(s,{type:'robber',tile:1});assert.equal(s.phase,'roll');assert.equal(s.dice,null);
 step=advance('knight',3,s);assert.ok(getGuideSteps('knight')[step].done);
});
test('road-building lesson highlights legal roads and adds exactly two without resources',()=>{
 const s=createLessonState('roads');assert.equal(total(s.players[0]),0);
 let step=advance('roads',0,s,{modal:'dev'});play(s,{type:'dev',id:s.players[0].dev[0].id});
 step=advance('roads',step,s);assert.equal(step,2);
 for(let i=0;i<2;i++){
  const selector=getGuideTarget(getGuideSteps('roads')[step],s),id=Number(selector.match(/\d+/)[0]);
  assert.ok(legalRoads(s,0).includes(id));play(s,{type:'road',id});step=advance('roads',step,s);
 }
 assert.ok(getGuideSteps('roads')[step].done);assert.equal(total(s.players[0]),0);assert.equal(s.edges.filter(e=>e.owner===0).length,5);
});
test('plenty lesson guides two different selections and gives exactly those two bank cards',()=>{
 const s=createLessonState('plenty'),id=s.players[0].dev[0].id;
 let step=advance('plenty',0,s,{modal:'dev'});step=advance('plenty',step,s,{modal:'picker'});assert.equal(step,2);
 step=advance('plenty',step,s,{picked:['brick']});assert.equal(step,3);
 step=advance('plenty',step,s,{picked:['brick','wheat']});assert.equal(step,4);
 play(s,{type:'dev',id,resources:['brick','wheat']});step=advance('plenty',step,s);
 assert.ok(getGuideSteps('plenty')[step].done);assert.deepEqual(s.players[0].resources,{wood:1,brick:1,sheep:0,wheat:1,ore:0});
});
test('monopoly lesson collects every opponent ore card without drawing any from the bank',()=>{
 const s=createLessonState('monopoly'),bank=s.bank.ore,id=s.players[0].dev[0].id;
 let step=advance('monopoly',0,s,{modal:'dev'});step=advance('monopoly',step,s,{modal:'picker'});
 step=advance('monopoly',step,s,{picked:['ore']});assert.equal(step,3);
 play(s,{type:'dev',id,resource:'ore'});step=advance('monopoly',step,s);
 assert.ok(getGuideSteps('monopoly')[step].done);assert.equal(s.players[0].resources.ore,6);assert.equal(s.players[1].resources.ore,0);assert.equal(s.players[2].resources.ore,0);assert.equal(s.bank.ore,bank);
});
