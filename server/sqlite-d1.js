// Local preview and tests only; the hosted Worker uses the platform D1 binding.
import {DatabaseSync} from 'node:sqlite';
export class SQLiteD1 {
  constructor(filename=':memory:'){this.database=new DatabaseSync(filename);this.database.exec('PRAGMA foreign_keys=ON;');}
  withSession(){return this;}
  prepare(sql){
    const database=this.database;let values=[];
    const statement={bind(...args){values=args;return statement;},sync(){const result=database.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}};},async first(){await Promise.resolve();return database.prepare(sql).get(...values)??null;},async all(){await Promise.resolve();return {results:database.prepare(sql).all(...values)};},async run(){await Promise.resolve();return statement.sync();}};
    return statement;
  }
  async batch(statements){this.database.exec('BEGIN');try{const results=statements.map(s=>s.sync());this.database.exec('COMMIT');return results;}catch(error){this.database.exec('ROLLBACK');throw error;}}
  close(){this.database.close();}
}
