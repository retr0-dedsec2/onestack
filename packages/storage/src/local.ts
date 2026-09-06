import { mkdir, readFile, writeFile, rename, rm, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageAdapter, StorageObject } from './index.js';

/** Development storage. The root must be private to the server process. */
export function createLocalStorage(root: string): StorageAdapter {
  const directory = resolve(root);
  async function path(key: string) {
    if (!key || key.includes('\\') || key.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.onestack-write-')) || key.startsWith('/') || key.includes('\0')) throw new Error('Invalid storage key');
    await mkdir(directory, { recursive: true });
    const base = await realpath(directory), target = resolve(base, key);
    if (!target.startsWith(base + sep)) throw new Error('Storage key escapes root');
    let current = base;
    for (const part of key.split('/')) {
      current = resolve(current, part);
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Storage symlinks are forbidden'); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    return target;
  }
  return {
    provider: 'local',
    async upload(key, data, options = {}) {
      const target = await path(key); await mkdir(dirname(target), { recursive: true });
      const bytes = typeof data === 'string' ? Buffer.from(data) : data;
      const object: StorageObject = { key, size: bytes.byteLength, ...options };
      const temporary = resolve(dirname(target), `.onestack-write-${randomUUID()}`);
      try { await writeFile(temporary, JSON.stringify({ object, data: Buffer.from(bytes).toString('base64') }), { flag: 'wx', mode: 0o600 }); await rename(temporary, target); }
      finally { await rm(temporary, { force: true }); }
      return object;
    },
    async metadata(key) { return JSON.parse(await readFile(await path(key), 'utf8')).object; },
    async download(key) { return Buffer.from(JSON.parse(await readFile(await path(key), 'utf8')).data, 'base64'); },
    async remove(key) { await rm(await path(key), { force: true }); },
    async list(prefix = '') {
      await mkdir(directory, { recursive: true }); const objects: StorageObject[] = [];
      async function visit(dir: string, relative = ''): Promise<void> {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue;
          const key = relative + entry.name;
          if (entry.isDirectory()) await visit(resolve(dir, entry.name), key + '/');
          else if (key.startsWith(prefix) && !entry.name.startsWith('.onestack-write-')) objects.push(JSON.parse(await readFile(await path(key), 'utf8')).object);
        }
      }
      await visit(directory); return objects.sort((a, b) => a.key.localeCompare(b.key));
    },
  };
}
