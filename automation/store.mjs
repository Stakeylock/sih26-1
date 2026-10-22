import {DatabaseSync} from 'node:sqlite';
export class AutomationStore{
  constructor(path){this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, actor TEXT NOT NULL, case_id TEXT NOT NULL, version INTEGER NOT NULL, report TEXT NOT NULL, event TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, completed_at INTEGER, UNIQUE(actor,case_id,version)); CREATE TABLE IF NOT EXISTS followups(id TEXT PRIMARY KEY REFERENCES jobs(id), actor TEXT NOT NULL, case_id TEXT NOT NULL, due_at TEXT, state TEXT NOT NULL DEFAULT 'scheduled', created_at INTEGER NOT NULL);`);}
  get(actor,caseId,version){return this.db.prepare('SELECT * FROM jobs WHERE actor=? AND case_id=? AND version=?').get(actor,caseId,version);}
  enqueue({id,actor,caseId,version,report,event}){this.db.prepare('INSERT OR IGNORE INTO jobs(id,actor,case_id,version,report,event,created_at) VALUES(?,?,?,?,?,?,?)').run(id,actor,caseId,version,JSON.stringify(report),JSON.stringify(event),Date.now());return this.get(actor,caseId,version);}
  pending(){return this.db.prepare("SELECT * FROM jobs WHERE state='queued' AND attempts<5 AND next_at<=? ORDER BY created_at LIMIT 10").all(Date.now());}
  attempt(id){this.db.prepare('UPDATE jobs SET attempts=attempts+1,next_at=? WHERE id=?').run(Date.now()+30000,id);}
  retry(id){this.db.prepare("UPDATE jobs SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END,next_at=? WHERE id=? AND state<>'completed'").run(Date.now()+30000,id);}
  acknowledge(id){const job=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(!job)throw new Error('Unknown automation event');const event=JSON.parse(job.event);this.db.exec('BEGIN');try{this.db.prepare('INSERT OR IGNORE INTO followups(id,actor,case_id,due_at,created_at) VALUES(?,?,?,?,?)').run(id,job.actor,job.case_id,event.due_at??null,Date.now());this.db.prepare("UPDATE jobs SET state='completed',completed_at=coalesce(completed_at,?) WHERE id=?").run(Date.now(),id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return {id,state:'completed'};}
  list(actor,caseId){return this.db.prepare('SELECT id,state,attempts,created_at,completed_at FROM jobs WHERE actor=? AND case_id=? ORDER BY created_at DESC LIMIT 20').all(actor,caseId);}
  due(){return this.db.prepare("SELECT id,case_id,due_at FROM followups WHERE state='scheduled' AND due_at IS NOT NULL AND due_at<=? LIMIT 50").all(new Date().toISOString());}
  remind(id){this.db.prepare("UPDATE followups SET state='reminder_ready' WHERE id=? AND state='scheduled'").run(id);return {id,state:'reminder_ready'};}
  close(){this.db.close();}
}
