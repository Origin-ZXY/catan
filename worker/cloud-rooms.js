import {RoomStore,RoomError} from '../server/room-core.js';

const lifetime=7*24*60*60*1000;
const validConnection=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(id);
export class CloudRooms {
  constructor(database,{now=()=>Date.now(),seed}={}){
    if(!database)throw new RoomError('联机服务正在准备，请稍后再试',503);
    this.db=database.withSession?.('first-primary')??database;this.now=now;this.seed=seed;
  }
  authority(row){const store=new RoomStore({seed:this.seed});if(row){const room=JSON.parse(row.body);store.rooms.set(room.code,room);}return store;}
  async load(code){
    if(typeof code!=='string'||!/^[A-Z2-9]{6}$/i.test(code))throw new RoomError('房间码无效',404);
    const row=await this.db.prepare('SELECT code, body, version, expires_at FROM catan_rooms WHERE code = ? AND expires_at > ?').bind(code.toUpperCase(),this.now()).first();
    if(!row)throw new RoomError('房间不存在或已过期，请检查邀请链接',404);return row;
  }
  async limit(category,identity,maximum,windowMs){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
    const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    const now=this.now(),key=`${category}:${hash}:${Math.floor(now/windowMs)}`;
    const row=await this.db.prepare('INSERT INTO catan_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count').bind(key,now+windowMs*2).first();
    if(row.count>maximum)throw new RoomError('操作太频繁，请稍后再试',429);
  }
  async cleanup(){
    const now=this.now();await this.db.batch([
      this.db.prepare('DELETE FROM catan_presence WHERE last_seen < ?').bind(now-120000),
      this.db.prepare('DELETE FROM catan_rooms WHERE expires_at < ?').bind(now),
      this.db.prepare('DELETE FROM catan_limits WHERE expires_at < ?').bind(now)
    ]);
  }
  async snapshot(code,token,connection){
    const row=await this.load(code),store=this.authority(row),room=store.room(row.code),seat=store.member(room,token),now=this.now();
    if(validConnection(connection))await this.db.prepare('INSERT INTO catan_presence (room_code, seat, connection_id, last_seen) VALUES (?, ?, ?, ?) ON CONFLICT(room_code, seat, connection_id) DO UPDATE SET last_seen = excluded.last_seen').bind(room.code,seat,connection,now).run();
    const present=await this.db.prepare('SELECT DISTINCT seat FROM catan_presence WHERE room_code = ? AND last_seen > ?').bind(room.code,now-35000).all();
    for(const {seat:id}of present.results)if(room.seats[id])store.connections.set(`${room.code}:${room.seats[id].token}`,1);
    return {...store.snapshot(room.code,token),transport:'poll',hosted:true};
  }
  async create(payload){
    for(let attempt=0;attempt<4;attempt++){
      const store=this.authority(),created=store.create(payload),room=store.room(created.session.code);
      const result=await this.db.prepare('INSERT OR IGNORE INTO catan_rooms (code, body, version, expires_at) VALUES (?, ?, 1, ?)').bind(room.code,JSON.stringify(room),this.now()+lifetime).run();
      if(result.meta.changes)return {session:created.session,snapshot:await this.snapshot(room.code,created.session.token)};
    }
    throw new RoomError('暂时无法创建房间，请重试',503);
  }
  async join(code,payload){return this.change(code,null,store=>store.join(code,payload));}
  async command(code,token,payload){return this.change(code,token,store=>store.command(code,token,payload));}
  async change(code,token,operation){
    for(let attempt=0;attempt<6;attempt++){
      const row=await this.load(code),store=this.authority(row),result=operation(store),room=store.room(row.code);
      const updated=await this.db.prepare('UPDATE catan_rooms SET body = ?, version = version + 1, expires_at = ? WHERE code = ? AND version = ?').bind(JSON.stringify(room),this.now()+lifetime,row.code,row.version).run();
      if(!updated.meta.changes)continue;
      const session=result.session??{code:row.code,token};
      if(!room.seats.some(member=>member?.token===session.token))return {ok:true};
      return {...result,snapshot:await this.snapshot(row.code,session.token)};
    }
    throw new RoomError('房间正在同步，请稍后再试',409);
  }
  async disconnect(code,token,connection){
    const row=await this.load(code),store=this.authority(row),seat=store.member(store.room(row.code),token);
    if(validConnection(connection))await this.db.prepare('DELETE FROM catan_presence WHERE room_code = ? AND seat = ? AND connection_id = ?').bind(row.code,seat,connection).run();
    return {ok:true};
  }
}
