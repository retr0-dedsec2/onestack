import type { DataAdapter, Migration, QueryOptions, Row } from './index.js';

export interface SqlConnection {
  script?(sql: string): Promise<void>;
  execute(sql: string, values: unknown[]): Promise<Row[]>;
  transaction<T>(fn: (connection: SqlConnection) => Promise<T>): Promise<T>;
}
export function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
  return `"${name}"`;
}
/** All values are bound parameters; SQL identifiers are validated separately. */
export function createSqlAdapter(provider: 'sqlite' | 'postgres', connection: SqlConnection): DataAdapter {
  const bind = (values: unknown[], value: unknown) => { values.push(value); return provider === 'postgres' ? `$${values.length}` : '?'; };
  function where(options: QueryOptions, values: unknown[]) {
    const terms = Object.entries(options.where ?? {}).map(([key, value]) => value === null ? `${identifier(key)} IS NULL` : `${identifier(key)} = ${bind(values, value)}`);
    return terms.length ? ` WHERE ${terms.join(' AND ')}` : '';
  }
  function page(options: QueryOptions, values: unknown[]) {
    let sql = '';
    if (options.orderBy?.length) sql += ' ORDER BY ' + options.orderBy.map(o => {
      if (o.direction && !['asc', 'desc'].includes(o.direction)) throw new Error('Invalid order direction');
      return `${identifier(o.field)} ${o.direction ?? 'asc'}`;
    }).join(', ');
    for (const field of ['limit', 'offset'] as const) {
      const n = options[field];
      if (n !== undefined && (!Number.isSafeInteger(n) || n < 0)) throw new Error(`Invalid ${field}`);
    }
    if (options.limit !== undefined) sql += ` LIMIT ${bind(values, options.limit)}`;
    else if (options.offset !== undefined && provider === 'sqlite') sql += ' LIMIT -1';
    if (options.offset !== undefined) sql += ` OFFSET ${bind(values, options.offset)}`;
    return sql;
  }
  function mutationOptions(options: QueryOptions) {
    if (options.limit !== undefined || options.offset !== undefined || options.orderBy?.length) throw new Error('Pagination is only supported on queries');
  }
  const adapter: DataAdapter = {
    provider,
    async query<T extends Row>(table: string, options: QueryOptions = {}) {
      const values: unknown[] = [];
      return await connection.execute(`SELECT * FROM ${identifier(table)}${where(options, values)}${page(options, values)}`, values) as T[];
    },
    async insert<T extends Row>(table: string, input: T | T[]) {
      const rows = Array.isArray(input) ? input : [input];
      if (rows.length > 1) return adapter.transaction(async tx => { const out: T[] = []; for (const row of rows) out.push(...await tx.insert<T>(table, row as T)); return out; });
      if (!rows.length) return [];
      const row = rows[0], values: unknown[] = [], keys = Object.keys(row);
      const sql = keys.length ? `(${keys.map(identifier).join(', ')}) VALUES (${keys.map(k => bind(values, row[k])).join(', ')})` : 'DEFAULT VALUES';
      return await connection.execute(`INSERT INTO ${identifier(table)} ${sql} RETURNING *`, values) as T[];
    },
    async update<T extends Row>(table: string, row: Partial<T>, options: QueryOptions = {}) {
      mutationOptions(options);
      if (!Object.keys(row).length) throw new Error('Update requires at least one value');
      const values: unknown[] = [];
      const assignments = Object.entries(row).map(([k, v]) => `${identifier(k)} = ${bind(values, v)}`).join(', ');
      return await connection.execute(`UPDATE ${identifier(table)} SET ${assignments}${where(options, values)} RETURNING *`, values) as T[];
    },
    async delete(table, options = {}) {
      mutationOptions(options); const values: unknown[] = [];
      return (await connection.execute(`DELETE FROM ${identifier(table)}${where(options, values)} RETURNING *`, values)).length;
    },
    transaction(fn) { return connection.transaction(tx => fn(createSqlAdapter(provider, tx))); },
    async migrate(migrations: Migration[]) {
      if (new Set(migrations.map(m => m.id)).size !== migrations.length) throw new Error('Duplicate migration IDs');
      await connection.transaction(async tx => {
        if (provider === 'postgres') await tx.execute('SELECT pg_advisory_xact_lock(1869509460)', []);
        await tx.execute('CREATE TABLE IF NOT EXISTS _onestack_migrations (id TEXT PRIMARY KEY)', []);
        const applied = new Set((await tx.execute('SELECT id FROM _onestack_migrations', [])).map(r => r.id));
        for (const migration of migrations) {
          if (applied.has(migration.id)) continue;
          if (typeof migration.up === 'string') { if (tx.script) await tx.script(migration.up); else await tx.execute(migration.up, []); }
          else await migration.up(createSqlAdapter(provider, tx));
          await tx.execute(`INSERT INTO _onestack_migrations (id) VALUES (${provider === 'postgres' ? '$1' : '?'})`, [migration.id]);
        }
      });
    },
  };
  return adapter;
}
