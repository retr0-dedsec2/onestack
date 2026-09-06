import { Pool, type PoolConfig, type PoolClient } from 'pg';
import { createSqlAdapter, type SqlConnection } from './sql.js';

export function createPostgresAdapter(config: PoolConfig) {
  const pool = new Pool(config); let sequence = 0;
  function scoped(client: PoolClient): SqlConnection {
    const tx: SqlConnection = {
      async execute(sql, values) { const result = await client.query(sql, values); return Array.isArray(result) ? result.flatMap(r => r.rows ?? []) : result.rows; },
      async transaction(fn) {
        const name = `onestack_${++sequence}`; await client.query(`SAVEPOINT ${name}`);
        try { const result = await fn(tx); await client.query(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await client.query(`ROLLBACK TO SAVEPOINT ${name}`); throw error; }
      },
    }; return tx;
  }
  const connection: SqlConnection = {
    async execute(sql, values) { return (await pool.query(sql, values)).rows; },
    async transaction(fn) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await fn(scoped(client)); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
  return { ...createSqlAdapter('postgres', connection), close: () => pool.end() };
}
