import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {resolve,relative,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('dist'),assets={};
function collect(folder){for(const item of readdirSync(folder,{withFileTypes:true})){
  if(['server','.openai','_appgen_meta'].includes(item.name))continue;
  const path=resolve(folder,item.name);if(item.isDirectory())collect(path);else if(['.html','.js','.css','.svg'].includes(extname(path)))assets['/'+relative(root,path).replaceAll('\\','/')]=readFileSync(path,'utf8');
}}
collect(root);
function module(file,name,bindings=''){
  let source=readFileSync(file,'utf8');const names=[...source.matchAll(/export\s+(?:const|(?:async\s+)?function|class)\s+(\w+)/g)].map(m=>m[1]);
  source=source.replace(/^import[^\n]*\n/gm,'').replace(/\bexport\s+(?=(?:const|(?:async\s+)?function|class)\b)/g,'');
  return `const ${name}=(()=>{${bindings}\n${source}\nreturn {${names.join(',')}};})();\n`;
}
const gameNames=[...readFileSync('dist/game.js','utf8').matchAll(/export\s+(?:const|function|class)\s+(\w+)/g)].map(m=>m[1]);
let output='// Generated single-module Sites Worker. Rebuild with npm run build.\n';
output+=module('dist/game.js','Rules');
output+=module('server/room-core.js','Authority',`const {${gameNames.join(',')}}=Rules;`);
output+=module('worker/cloud-rooms.js','Cloud','const {RoomStore,RoomError}=Authority;');
output+=module('worker/turnstile.js','Verification','const {RoomError}=Authority;');
output+=module('worker/index.js','Runtime','const {CloudRooms}=Cloud;const {RoomError}=Authority;const {turnstileConfig,verifyTurnstile}=Verification;');
output+=`const assets=${JSON.stringify(assets)};\nexport default Runtime.createWorker(assets);\n`;
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
writeFileSync('dist/server/index.js',output);copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
const worker=await import(resolve('dist/server/index.js')+'?build='+Date.now());assert.equal(typeof worker.default.fetch,'function');
assert.ok(assets['/online/index.html']);assert.ok(!Object.keys(assets).some(path=>path.startsWith('/server/')));
console.log(`Built Sites Worker: ${Object.keys(assets).length} embedded assets, ${Buffer.byteLength(output)} bytes.`);
