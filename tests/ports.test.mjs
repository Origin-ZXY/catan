import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame} from '../dist/game.js';
import {portGeometry} from '../dist/ports.js';
const cross=(u,v)=>u.x*v.y-u.y*v.x;

test('every coastal harbour lies on both outward side extensions and follows the shore normal',()=>{
  const state=newGame(42),before=structuredClone(state),angles=new Set();
  const coast=state.edges.filter(e=>state.vertices[e.a].tiles.filter(id=>state.vertices[e.b].tiles.includes(id)).length===1);
  assert.equal(coast.length,30);
  for(const port of coast){
    const g=portGeometry(state,port),tile=state.tiles[g.a.tiles.find(id=>g.b.tiles.includes(id))];
    for(const [v,inner] of [[g.a,g.innerA],[g.b,g.innerB]]){
      const direction={x:v.x-inner.x,y:v.y-inner.y},toHarbour={x:g.x-v.x,y:g.y-v.y};
      assert.ok(Math.abs(cross(direction,toHarbour))<1e-8);
      assert.ok(direction.x*toHarbour.x+direction.y*toHarbour.y>0);
    }
    assert.ok(Math.abs(Math.hypot(g.x-g.a.x,g.y-g.a.y)-Math.hypot(g.x-g.b.x,g.y-g.b.y))<1e-8);
    assert.ok((g.x-g.mx)*(g.mx-tile.x)+(g.y-g.my)*(g.my-tile.y)>0);
    const radians=g.angle*Math.PI/180,axis={x:-Math.sin(radians),y:Math.cos(radians)};
    assert.ok(Math.abs(cross(axis,{x:g.x-g.mx,y:g.y-g.my}))<1e-8);
    assert.ok(Math.abs(g.length-Math.hypot(g.a.x-g.b.x,g.a.y-g.b.y)*Math.sqrt(3)/2)<1e-8);
    angles.add(Math.round(g.angle));
  }
  assert.equal(angles.size,6);
  assert.deepEqual(state,before);
});

test('random harbour arrangements keep distinct seals inside the padded board',()=>{
  for(let seed=1;seed<=600;seed++){
    const state=newGame(seed),ports=state.ports.map(port=>portGeometry(state,port));
    for(const g of ports){
      assert.ok(g.x-29>=0&&g.x+29<=780);
      assert.ok(g.y+18-29>=-18&&g.y+18+29<=668);
    }
    for(let i=0;i<ports.length;i++)for(let j=i+1;j<ports.length;j++){
      assert.ok(Math.hypot(ports[i].x-ports[j].x,ports[i].y-ports[j].y)>58);
    }
  }
});
