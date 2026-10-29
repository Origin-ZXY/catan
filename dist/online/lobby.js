import {RoomConnection,readRoomSession,saveRoomSession,clearRoomSession,forgetRoomSession,readRoomRecovery,roomRequest} from '../room-client.js?v=bdee77109356';
const $=selector=>document.querySelector(selector),params=new URLSearchParams(location.search),freshEntry=params.has('fresh');
let connection=null,snapshot=null,pending=false,noticeTimer;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
function fail(text){$('#lobby-error').textContent=text;}
function status(value){const el=$('#connection-state');el.dataset.status=value;el.textContent={connected:'已连接',connecting:'正在连接',offline:'连接中断，正在重连',invalid:'座位已失效'}[value];if(value==='invalid'){if(connection?.session)forgetRoomSession(connection.session);clearRoomSession();connection?.stop();connection=null;snapshot=null;$('#entry-panel').hidden=false;$('#room-panel').hidden=true;fail('原座位已失效，请重新加入。');}renderButtons();}
function renderButtons(){
  $('#create-room').disabled=pending;$('#join-room').disabled=pending;
  if(!snapshot)return;const me=snapshot.seats[snapshot.me],host=snapshot.hostSeat===snapshot.me,ready=snapshot.seats.every(s=>s?.ready);
  $('#ready-room').textContent=me?.ready?'取消准备':'准备';$('#ready-room').disabled=pending||!connection?.connected;
  $('#start-room').hidden=!host;$('#start-room').disabled=pending||!connection?.connected||!ready;
  $('#leave-room').disabled=pending||!connection?.connected;
  $('#room-hint').textContent=snapshot.seats.some(s=>!s)?`已入座 ${snapshot.seats.filter(Boolean).length}/${snapshot.capacity} 人，邀请朋友坐满这张棋桌。`:!ready?'等大家点击准备，就能出发。':host?'大家准备好了，点击「开始对局」。':'大家准备好了，等待房主开始对局。';
}
function renderRoom(next){
  const entering=$('#room-panel').hidden;
  snapshot=next;if(next.game){location.replace('/?online=1');return;}
  document.title=`卡坦岛 · ${next.seats[next.me].name} · 房间 ${next.code}`;
  $('#entry-panel').hidden=true;$('#room-panel').hidden=false;$('#display-code').textContent=next.code;
  $('#room-seats').dataset.capacity=next.capacity;
  $('#room-seats').innerHTML=next.seats.map((seat,id)=>seat?`<div class="room-seat" style="--player:${seat.color}"><span class="avatar">${escapeHtml(seat.letter)}</span><div><strong>${escapeHtml(seat.name)}${next.me===id?'<small>你</small>':''}${next.hostSeat===id?'<small>房主</small>':''}</strong><span>${seat.connected?'已连接':'暂时离线，可回到原窗口重连'}</span></div><b class="${seat.ready?'is-ready':''}">${seat.ready?'已准备':'未准备'}</b></div>`:`<div class="room-seat empty"><span class="empty-seat">＋</span><div><strong>空座位 ${id+1}</strong><span>等待朋友加入</span></div></div>`).join('');
  const invite=new URL('/online/',location.origin);invite.searchParams.set('room',next.code);$('#invite-link').value=invite.href;invite.searchParams.set('fresh','1');$('#new-player-window').href=invite.href;renderButtons();
  if(entering)window.scrollTo({top:0,behavior:'instant'});
}
function connect(session,initial){connection?.stop();connection=new RoomConnection(session,{onSnapshot:renderRoom,onStatus:status});if(initial)connection.accept(initial);connection.start();}
async function enter(type){
  if(pending)return;pending=true;fail('');renderButtons();
  try{const payload={name:$('#nickname').value.trim()};let path='/api/rooms';
    if(type==='create'){payload.capacity=Number($('#room-capacity').value);payload.combinedTradeBuild=$('#room-order').value==='combined';}
    else{const code=$('#room-code').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw new Error('请输入六位房间码');path+=`/${code}/join`;}
    const result=await roomRequest(path,{method:'POST',payload});saveRoomSession(result.session,{name:result.snapshot.seats[result.snapshot.me].name});history.replaceState(null,'',`/online/?room=${result.session.code}`);connect(result.session,result.snapshot);
  }catch(error){fail(error.message||'暂时无法连接联机服务，请稍后再试');}finally{pending=false;renderButtons();}
}
async function command(type,payload={}){if(pending||!connection?.connected)return;pending=true;fail('');renderButtons();const result=await connection.command(type,payload);if(!result.ok)fail(result.message);pending=false;renderButtons();return result;}
$('#create-room').addEventListener('click',()=>enter('create'));$('#join-room').addEventListener('click',()=>enter('join'));
$('#room-code').addEventListener('input',event=>{event.target.value=event.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'');});
$('#room-code').addEventListener('keydown',event=>{if(event.key==='Enter')enter('join');});
$('#ready-room').addEventListener('click',()=>command('ready',{ready:!snapshot.seats[snapshot.me].ready}));
$('#start-room').addEventListener('click',()=>command('start'));
$('#leave-room').addEventListener('click',async()=>{const result=await command('leave');if(!result?.ok)return;const session=connection.session;connection.stop();connection=null;snapshot=null;forgetRoomSession(session);clearRoomSession();renderRecovery();history.replaceState(null,'','/online/');$('#room-panel').hidden=true;$('#entry-panel').hidden=false;fail('');});
async function copy(text,input){try{await navigator.clipboard.writeText(text);notice('已复制');}catch{input?.select();notice('请复制已选中的内容');}}
$('#copy-code').addEventListener('click',()=>copy(snapshot.code));$('#copy-link').addEventListener('click',()=>copy($('#invite-link').value,$('#invite-link')));
$('#room-code').value=(params.get('room')??'').toUpperCase();
if(params.has('fresh')){clearRoomSession();params.delete('fresh');history.replaceState(null,'',`/online/${params.size?'?'+params:''}`);}
renderRecovery();
const session=readRoomSession(),requestedRoom=params.get('room')?.toUpperCase();
if(session&&(!requestedRoom||requestedRoom===session.code)){
  pending=true;renderButtons();
  try{const result=await roomRequest(`/api/rooms/${session.code}`,{token:session.token});connect(session,result.snapshot);}catch(error){if([401,404].includes(error.status)){forgetRoomSession(session);clearRoomSession();renderRecovery();}fail(error.message||'暂时无法连接，原座位已保留，稍后刷新重试。');}
  pending=false;renderButtons();
}
window.addEventListener('pagehide',()=>connection?.stop());

function renderRecovery(){
 const panel=$('#resume-options'),saved=freshEntry?[]:readRoomRecovery(params.get('room')?.toUpperCase());
 panel.hidden=!saved.length;
 panel.innerHTML=saved.length?`<p>曾在这个设备上入座？可以继续之前的对局。</p><div>${saved.map((entry,index)=>`<button data-recover="${index}">继续 ${escapeHtml(entry.name||'原座位')} · ${escapeHtml(entry.code)}</button>`).join('')}</div>`:'';
 panel.querySelectorAll('[data-recover]').forEach(button=>button.addEventListener('click',async()=>{
  if(pending)return;const session=saved[Number(button.dataset.recover)];pending=true;renderButtons();fail('');
  try{const result=await roomRequest(`/api/rooms/${session.code}`,{token:session.token});saveRoomSession(session,{name:result.snapshot.seats[result.snapshot.me].name});history.replaceState(null,'',`/online/?room=${session.code}`);connect(session,result.snapshot);}catch(error){if([401,404].includes(error.status))forgetRoomSession(session);fail(error.message||'暂时无法连接，请稍后重试');renderRecovery();}finally{pending=false;renderButtons();}
 }));
}
if(document.body.dataset.hosted==='true')$('#new-player-window').textContent='在新窗口加入';
