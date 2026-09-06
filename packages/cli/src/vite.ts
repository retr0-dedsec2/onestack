import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Wrap user configuration, retaining Vite behavior and enforcing the server boundary. */
export function secureViteArgs(root: string, args: string[]) {
  const explicit = args.indexOf('--config');
  const config = explicit >= 0 ? resolve(root, args[explicit + 1]) : ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'].map(p => resolve(root, p)).find(existsSync);
  const output = resolve(root, '.onestack/vite.config.mjs'); mkdirSync(resolve(root, '.onestack'), { recursive: true });
  const security = new URL('./security.js', import.meta.url).href;
  writeFileSync(output, `import { loadConfigFromFile, mergeConfig } from 'vite';\nimport { isServerOnly } from ${JSON.stringify(security)};\nexport default async env => {\n const loaded = ${config ? `await loadConfigFromFile(env, ${JSON.stringify(config)})` : 'null'};\n return mergeConfig(loaded?.config ?? {}, { plugins: [{ name: 'onestack-server-boundary', enforce: 'pre', resolveId(id, importer, options) { if (!options?.ssr && isServerOnly(id)) throw new Error('Server-only import in client: ' + id); }, transform(code, id, options) { if (!options?.ssr && isServerOnly(id)) throw new Error('Server-only client module: ' + id); } }] });\n};\n`);
  const forwarded = [...args]; if (explicit >= 0) forwarded.splice(explicit, 2);
  return [...forwarded, '--config', output];
}
