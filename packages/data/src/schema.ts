import { identifier } from './sql.js';
export interface ColumnDefinition { type: 'text' | 'integer' | 'real' | 'boolean'; primaryKey?: boolean; nullable?: boolean; unique?: boolean; }
export type Schema = Record<string, Record<string, ColumnDefinition>>;
export function defineSchema<T extends Schema>(schema: T): T {
  for (const [table, columns] of Object.entries(schema)) { identifier(table); for (const field of Object.keys(columns)) identifier(field); }
  return schema;
}
/** Initial schema SQL. Schema evolution remains explicit versioned SQL migrations. */
export function schemaSql(schema: Schema) {
  return Object.entries(defineSchema(schema)).sort(([a], [b]) => a.localeCompare(b)).map(([table, columns]) => {
    const fields = Object.entries(columns).map(([name, column]) => {
      if (!['text', 'integer', 'real', 'boolean'].includes(column.type)) throw new Error('Unsupported column type');
      return `${identifier(name)} ${column.type.toUpperCase()}${column.primaryKey ? ' PRIMARY KEY' : ''}${column.nullable ? '' : ' NOT NULL'}${column.unique ? ' UNIQUE' : ''}`;
    });
    if (!fields.length) throw new Error('Table must have columns');
    return `CREATE TABLE ${identifier(table)} (${fields.join(', ')});`;
  }).join('\n');
}
