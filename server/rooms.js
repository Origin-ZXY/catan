import {randomBytes} from 'node:crypto';
import {mkdirSync,readdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {RoomStore as RoomCore} from './room-core.js';
export {RoomError,projectGame} from './room-core.js';

export class RoomStore extends RoomCore {
  constructor({directory=null,seed}={}){
    super({seed:seed??(()=>randomBytes(4).readUInt32BE(0)),randomBytes:n=>new Uint8Array(randomBytes(n))});
    this.directory=directory;
    if(directory){
      mkdirSync(directory,{recursive:true,mode:0o700});
      for(const file of readdirSync(directory).filter(f=>/^[A-Z2-9]{6}\.json$/.test(f))){
        try{const room=JSON.parse(readFileSync(join(directory,file),'utf8'));if(room.schema===1&&[3,4].includes(room.capacity)&&room.seats?.length===room.capacity)this.rooms.set(room.code,room);}catch{}
      }
    }
  }
  persist(room){
    if(!this.directory)return;
    const file=join(this.directory,`${room.code}.json`),temporary=file+'.tmp';
    writeFileSync(temporary,JSON.stringify(room),{mode:0o600});renameSync(temporary,file);
  }
}
