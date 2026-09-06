import { describe, it, expect } from 'vitest';
import { createSQLiteAdapter } from './sqlite.js';
import { createPostgresAdapter } from './postgres.js';
import type { DataAdapter } from './index.js';

for (const provider of ['sqlite', 'postgres'] as const) describe.skipIf(provider === 'postgres' && !process.env.TEST_DATABASE_URL)(`${provider} adapter contract`, () => {
  async function database() {
    const db = provider === 'sqlite' ? createSQLiteAdapter() : createPostgresAdapter({ connectionString: process.env.TEST_DATABASE_URL });
    await db.migrate!([{ id: 'contract_1', up: 'CREATE TABLE IF NOT EXISTS contract_items (id INTEGER PRIMARY KEY, name TEXT, count INTEGER); DELETE FROM contract_items;' }]);
    await db.delete('contract_items'); return db;
  }
  it('CRUD, typed sorting, null predicates and parameter binding', async () => {
    const db = await database();
    try {
      await db.insert('contract_items', [{ id: 1, name: "O'Reilly; DROP TABLE contract_items", count: 10 }, { id: 2, name: null, count: 2 }]);
      expect((await db.query('contract_items', { orderBy: [{ field: 'count' }], limit: 1 }))[0].id).toBe(2);
      expect(await db.query('contract_items', { where: { name: null } })).toHaveLength(1);
      expect((await db.update('contract_items', { count: 3 }, { where: { id: 1 } }))[0].count).toBe(3);
      expect(await db.delete('contract_items', { where: { id: 2 } })).toBe(1);
      await expect(db.query('contract_items; DROP TABLE x')).rejects.toThrow('identifier');
      await expect(db.query('contract_items', { limit: -1 })).rejects.toThrow('limit');
    } finally { await db.close(); }
  });
  it('rolls back writes and supports nested savepoints', async () => {
    const db = await database();
    try {
      await expect(db.transaction(async tx => { await tx.insert('contract_items', { id: 1 }); throw new Error('rollback'); })).rejects.toThrow('rollback');
      expect(await db.query('contract_items')).toEqual([]);
      await db.transaction(async tx => {
        await tx.insert('contract_items', { id: 1 });
        await expect(tx.transaction(async nested => { await nested.insert('contract_items', { id: 2 }); throw new Error('inner'); })).rejects.toThrow('inner');
        await tx.insert('contract_items', { id: 3 });
      });
      expect((await db.query('contract_items', { orderBy: [{ field: 'id' }] })).map(r => r.id)).toEqual([1, 3]);
    } finally { await db.close(); }
  });
  it('applies migrations once, atomically', async () => {
    const db = await database(); const id = `migration_${Date.now()}`;
    try {
      const migrations = [{ id, up: "INSERT INTO contract_items (id, name) VALUES (9, 'migration')" }];
      await db.migrate!(migrations); await db.migrate!(migrations);
      expect(await db.query('contract_items')).toHaveLength(1);
      await expect(db.migrate!([{ id: id + '_bad', up: 'INSERT INTO contract_items (id) VALUES (10); INVALID SQL' }])).rejects.toThrow();
      expect(await db.query('contract_items', { where: { id: 10 } })).toEqual([]);
    } finally { await db.close(); }
  });
});
