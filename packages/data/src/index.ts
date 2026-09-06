import { normalizeError } from "@onestack/errors";

export type Row = Record<string, unknown>;
export interface QueryOptions { where?: Row; limit?: number; offset?: number; orderBy?: { field: string; direction?: "asc" | "desc" }[]; }
export interface Migration { id: string; up: string | ((db: DataAdapter) => Promise<void>); down?: string | ((db: DataAdapter) => Promise<void>); }
export interface DataAdapter {
  readonly provider: string;
  query<T extends Row = Row>(table: string, options?: QueryOptions): Promise<T[]>;
  insert<T extends Row = Row>(table: string, values: T | T[]): Promise<T[]>;
  update<T extends Row = Row>(table: string, values: Partial<T>, options?: QueryOptions): Promise<T[]>;
  delete(table: string, options?: QueryOptions): Promise<number>;
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T>;
  migrate?(migrations: Migration[]): Promise<void>;
}

export class Database {
  constructor(readonly adapter: DataAdapter) {}
  query<T extends Row = Row>(table: string, options?: QueryOptions) { return this.wrap(() => this.adapter.query<T>(table, options)); }
  insert<T extends Row = Row>(table: string, values: T | T[]) { return this.wrap(() => this.adapter.insert<T>(table, values)); }
  update<T extends Row = Row>(table: string, values: Partial<T>, options?: QueryOptions) { return this.wrap(() => this.adapter.update<T>(table, values, options)); }
  delete(table: string, options?: QueryOptions) { return this.wrap(() => this.adapter.delete(table, options)); }
  transaction<T>(fn: (tx: Database) => Promise<T>) { return this.wrap(() => this.adapter.transaction((tx) => fn(new Database(tx)))); }
  migrate(migrations: Migration[]) {
    if (!this.adapter.migrate) throw new Error(`OneStack data: ${this.adapter.provider} does not support migrations.`);
    return this.wrap(() => this.adapter.migrate!(migrations));
  }
  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (error) { throw normalizeError(error, { code: "DATA_PROVIDER_ERROR", provider: this.adapter.provider, retryable: false }); }
  }
}

export function createDatabase(adapter: DataAdapter) { return new Database(adapter); }

export function createMemoryAdapter(seed: Record<string, Row[]> = {}): DataAdapter {
  const store = new Map<string, Row[]>(Object.entries(seed).map(([key, rows]) => [key, rows.map((row) => structuredClone(row))]));
  const matches = (row: Row, where?: Row) => !where || Object.entries(where).every(([key, value]) => row[key] === value);
  const adapter: DataAdapter = {
    provider: "memory",
    async query<T extends Row>(table: string, options: QueryOptions = {}) {
      let rows = (store.get(table) ?? []).filter((row) => matches(row, options.where)).map((row) => structuredClone(row));
      for (const order of [...(options.orderBy ?? [])].reverse()) rows.sort((a, b) => (typeof a[order.field] === "number" && typeof b[order.field] === "number" ? (a[order.field] as number) - (b[order.field] as number) : String(a[order.field] ?? "").localeCompare(String(b[order.field] ?? ""))) * (order.direction === "desc" ? -1 : 1));
      const start = options.offset ?? 0; return rows.slice(start, options.limit === undefined ? undefined : start + options.limit) as T[];
    },
    async insert(table, values) { const rows = (Array.isArray(values) ? values : [values]).map((row) => structuredClone(row)); store.set(table, [...(store.get(table) ?? []), ...rows]); return structuredClone(rows); },
    async update<T extends Row>(table: string, values: Partial<T>, options: QueryOptions = {}) { const rows = store.get(table) ?? []; const updated: Row[] = []; store.set(table, rows.map((row) => matches(row, options.where) ? (updated.push({ ...row, ...values }), { ...row, ...values }) : row)); return structuredClone(updated) as T[]; },
    async delete(table, options = {}) { const rows = store.get(table) ?? []; const kept = rows.filter((row) => !matches(row, options.where)); store.set(table, kept); return rows.length - kept.length; },
    async transaction(fn) { const snapshot = new Map([...store].map(([key, rows]) => [key, rows.map((row) => structuredClone(row))])); try { return await fn(adapter); } catch (error) { store.clear(); snapshot.forEach((rows, key) => store.set(key, rows)); throw error; } },
  };
  return adapter;
}

export { defineSchema, schemaSql } from "./schema.js";
export type { Schema, ColumnDefinition } from "./schema.js";
