import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createSqlAdapter, type SqlConnection } from './sql.js';

/** Node >=22.13. A single connection serializes async transactions and outside calls. */
export function createSQLiteAdapter(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
  let tail: Promise<unknown> = Promise.resolve(), savepoint = 0;
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn); tail = result.catch(() => {}); return result;
  }
  const direct: SqlConnection = {
    async script(sql) { db.exec(sql); },
    async execute(sql, values) {
      if (!values.length && !/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) { db.exec(sql); return []; }
      return db.prepare(sql).all(...values as SQLInputValue[]);
    },
    async transaction(fn) {
      const name = `onestack_${++savepoint}`; db.exec(`SAVEPOINT ${name}`);
      try { const value = await fn(direct); db.exec(`RELEASE SAVEPOINT ${name}`); return value; }
      catch (error) { db.exec(`ROLLBACK TO SAVEPOINT ${name}; RELEASE SAVEPOINT ${name}`); throw error; }
    },
  };
  const connection: SqlConnection = {
    execute: (sql, values) => exclusive(() => direct.execute(sql, values)),
    transaction: fn => exclusive(async () => {
      db.exec('BEGIN IMMEDIATE');
      try { const value = await fn(direct); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }),
  };
  return { ...createSqlAdapter('sqlite', connection), close: () => exclusive(async () => db.close()) };
}
