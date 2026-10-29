import test from 'node:test';
import assert from 'node:assert/strict';
import {saveRoomSession,readRoomSession,clearRoomSession,readRoomRecovery,forgetRoomSession} from '../dist/room-client.js';
class Storage{constructor(){this.values=new Map();}getItem(key){return this.values.get(key)??null;}setItem(key,value){this.values.set(key,String(value));}removeItem(key){this.values.delete(key);}}
test('a closed window can recover its seat without merging identities in other local windows',()=>{
  globalThis.localStorage=new Storage();globalThis.sessionStorage=new Storage();
  saveRoomSession({code:'ABC234',token:'host-secret'},{name:'红帆'});const originalWindow=globalThis.sessionStorage;
  globalThis.sessionStorage=new Storage();saveRoomSession({code:'ABC234',token:'blue-secret'},{name:'蓝湾'});
  assert.equal(readRoomSession().token,'blue-secret');assert.equal(readRoomRecovery('ABC234').length,2);
  clearRoomSession();assert.equal(readRoomSession(),null);const recovered=readRoomRecovery('ABC234').find(s=>s.name==='蓝湾');saveRoomSession(recovered);assert.equal(readRoomSession().token,'blue-secret');
  globalThis.sessionStorage=originalWindow;assert.equal(readRoomSession().token,'host-secret');
  forgetRoomSession(recovered);assert.equal(readRoomSession().token,'host-secret');assert.equal(readRoomRecovery('ABC234').length,1);assert.equal(readRoomRecovery('OTHER2').length,0);
  delete globalThis.localStorage;delete globalThis.sessionStorage;
});
