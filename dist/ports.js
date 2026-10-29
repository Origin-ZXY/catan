// A coastal hexagon's neighbouring sides continue into the shared sea vertex.
// This keeps each harbour centred on the two edge extensions at every angle.
export function portGeometry(state, port) {
  const a=state.vertices[port.a],b=state.vertices[port.b];
  const tile=state.tiles[a.tiles.find(id=>b.tiles.includes(id))];
  const neighbour=(vertex,other)=>{
    const i=tile.vertices.indexOf(vertex.id),next=tile.vertices[(i+1)%6];
    return state.vertices[next===other.id?tile.vertices[(i+5)%6]:next];
  };
  const innerA=neighbour(a,b),innerB=neighbour(b,a);
  const da={x:a.x-innerA.x,y:a.y-innerA.y},db={x:b.x-innerB.x,y:b.y-innerB.y};
  const det=da.x*db.y-da.y*db.x;
  const t=((b.x-a.x)*db.y-(b.y-a.y)*db.x)/det;
  const x=a.x+t*da.x,y=a.y+t*da.y,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  return {a,b,innerA,innerB,x,y,mx,my,length:Math.hypot(x-mx,y-my),angle:Math.atan2(y-my,x-mx)*180/Math.PI-90};
}

function dockMarkup(from,to) {
  const length=Math.hypot(to.x-from.x,to.y-from.y),angle=Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI-90;
  const planks=Array.from({length:Math.ceil(length/7)},(_,i)=>{
    const y=i*7,height=Math.min(7,length-y);
    return `<rect x="-4.5" y="${y}" width="9" height="${height}" rx=".6" fill="${i%2?'#bf8b50':'#d2a268'}"/><path d="M-4 ${y+height-.6}H4M-2 ${y+2}h3" stroke="#845731" stroke-width=".6" opacity=".8"/><circle cx="-3" cy="${y+2}" r=".45" fill="#684b32"/><circle cx="3" cy="${y+2}" r=".45" fill="#684b32"/>`;
  }).join('');
  const posts=[5,length-7].map(y=>[-5.5,5.5].map(x=>`<ellipse cx="${x+.7}" cy="${y+2}" rx="1.8" ry="2.3" fill="#082b3c" opacity=".35"/><rect x="${x-1.4}" y="${y-.5}" width="2.8" height="3.5" rx=".7" fill="#79502e"/><ellipse cx="${x}" cy="${y-.5}" rx="1.6" ry="1.3" fill="#e3ba7d" stroke="#845b35" stroke-width=".6"/>`).join('')).join('');
  return `<g class="port-dock" transform="translate(${from.x} ${from.y}) rotate(${angle}) scale(.72 1)" aria-hidden="true">
    <rect x="-5" y="2" width="12" height="${length+3}" rx="1.5" fill="#082b3c" opacity=".3"/>
    <rect class="dock-base" x="-5" y="-1" width="10" height="${length+2}" rx="1.5" fill="#93663c" stroke="#684a2f" stroke-width="1"/>
    ${planks}<path d="M-4.5-1V${length+1}M4.5-1V${length+1}" stroke="#e4ba7b" stroke-width=".8"/>${posts}
  </g>`;
}

export function portMarkup(state,port,id,{label,ratio,icon}) {
  const g=portGeometry(state,port);
  const title=port.type==='any'?'3 张同一种资源换 1 张其他资源':`2 张${label.replace('港','')}换 1 张其他资源`;
  return `<g class="port-assembly">
    ${dockMarkup(g.a,g)}${dockMarkup(g.b,g)}
    <g class="port-marker" transform="translate(${g.x} ${g.y}) scale(.82)" data-action="port-info" data-port="${id}" role="button" tabindex="0" aria-label="${label}，${ratio}，点击查看兑换说明">
      <title>${label}：${title}</title>
      <circle class="port-focus" r="29" aria-hidden="true"/>
      <circle cy="2.5" r="26" fill="#082b3c" opacity=".35" pointer-events="none"/>
      <circle class="port-rim" r="26" fill="#a77443" stroke="#674b31" stroke-width="1.2"/>
      <circle class="port-token" r="23.5"/>
      <text class="port-icon" x="-11" y="0" aria-hidden="true">${icon}</text>
      <text class="port-text port-ratio" x="10.5" y="0">${ratio}</text>
      <text class="port-caption" x="0" y="14">${label}</text>
    </g>
  </g>`;
}
