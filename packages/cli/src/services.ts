import { secureViteArgs } from './vite.js';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { writeDeployment, type DeployProvider } from '@onestack/deploy';
import { loadOneStackConfig } from './config.js';
import { execute } from './mobile.js';
import type { ParsedCli } from './index.js';

export async function runServices(root: string, parsed: ParsedCli) {
  const config = loadOneStackConfig(root) ?? {};
  if (parsed.command === 'db') {
    const directory = resolve(root, 'migrations'); mkdirSync(directory, { recursive: true });
    if (parsed.args[0] === 'generate') {
      const name = String(parsed.flags.name ?? 'migration');
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Migration name must be alphanumeric');
      const id = new Date().toISOString().replace(/\D/g, '');
      const path = resolve(directory, `${id}_${name}.sql`);
      writeFileSync(path, '-- Write forward-only SQL here. Applied once, transactionally.\n', { flag: 'wx' }); console.log(path); return;
    }
    if (parsed.args[0] !== 'migrate') throw new Error('Usage: onestack db generate|migrate');
    const file = resolve(root, 'onestack.services.ts');
    if (!existsSync(file)) throw new Error('Create onestack.services.ts exporting database (a Database instance)');
    const out = resolve(root, '.onestack/services.mjs'); mkdirSync(resolve(root, '.onestack'), { recursive: true });
    await build({ entryPoints: [file], outfile: out, bundle: true, packages: 'external', platform: 'node', format: 'esm' });
    const service = await import(pathToFileURL(out).href);
    if (typeof service.database?.migrate !== 'function') throw new Error('onestack.services.ts must export database');
    try { await service.database.migrate(readdirSync(directory).filter(f => f.endsWith('.sql')).sort().map(id => ({ id, up: readFileSync(resolve(directory, id), 'utf8') }))); }
    finally { await service.database.adapter?.close?.(); }
    console.log('Database migrations applied'); return;
  }
  if (parsed.command === 'auth') {
    if (parsed.args[0] !== 'setup') throw new Error('Usage: onestack auth setup');
    const path = resolve(root, 'src/auth.server.ts'); mkdirSync(resolve(root, 'src'), { recursive: true });
    writeFileSync(path, `// Server-only: configure an AuthAdapter per request (never share session state between users).\nimport { createAuth, type AuthAdapter } from '@onestack/auth';\nexport const authForRequest = (adapter: AuthAdapter) => createAuth(adapter);\n`, { flag: 'wx' });
    console.log(path); return;
  }
  const provider = String(parsed.flags.provider ?? config.deploy?.provider ?? 'node') as DeployProvider;
  if (!['node', 'docker', 'static', 'vercel', 'netlify', 'cloudflare'].includes(provider)) throw new Error(`Unknown deployment provider: ${provider}`);
  execute(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'vite', 'build', ...secureViteArgs(root, [])], root);
  const server = resolve(root, 'src/server.ts'), bundle = resolve(root, '.onestack/server/handler.mjs');
  const hasServer = existsSync(server);
  if (provider === 'static' && hasServer) throw new Error('Static export is incompatible with src/server.ts');
  if (hasServer) await build({ entryPoints: [server], outfile: bundle, bundle: true, platform: provider === 'cloudflare' ? 'browser' : 'node', format: 'esm', target: 'es2022', banner: provider === 'cloudflare' ? undefined : { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
  const output = writeDeployment({ root, provider, assets: resolve(root, 'dist'), serverBundle: hasServer ? bundle : undefined });
  console.log(`Deployment output: ${output}`);
  if (parsed.flags.publish === true) {
    const commands: Partial<Record<DeployProvider, [string, string[]]>> = { vercel: ['vercel', ['deploy', '--prebuilt']], netlify: ['netlify', ['deploy', '--dir=public', '--functions=functions']], cloudflare: ['wrangler', ['deploy']] };
    const command = commands[provider]; if (!command) throw new Error(`Publish ${provider} using your own infrastructure`);
    execute(command[0], command[1], output);
  }
}
