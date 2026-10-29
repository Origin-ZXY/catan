import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
const sql=readFileSync('db/schema.sql','utf8'),file='drizzle/0000_shared_rooms.sql';
mkdirSync('drizzle/meta',{recursive:true});
if(existsSync(file)&&readFileSync(file,'utf8')!==sql)throw new Error('Keep an existing migration immutable; append a new migration for schema changes.');
if(!existsSync(file))writeFileSync(file,sql);
if(!existsSync('drizzle/meta/_journal.json'))writeFileSync('drizzle/meta/_journal.json',JSON.stringify({version:'7',dialect:'sqlite',entries:[{idx:0,version:'6',when:Date.now(),tag:'0000_shared_rooms',breakpoints:true}]},null,2)+'\n');
console.log('Shared room migration is ready.');
