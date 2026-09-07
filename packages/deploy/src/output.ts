import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DeployProvider } from './index.js';

const nodeAdapter = `import { Readable } from 'node:stream';
export default async function nodeHandler(req, res) {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    const request = new Request(new URL(req.url, (req.socket?.encrypted || (process.env.ONESTACK_TRUST_PROXY === '1' && req.headers['x-forwarded-proto'] === 'https') ? 'https://' : 'http://') + (req.headers.host ?? 'localhost')), { method: req.method, headers, ...(!['GET','HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
    const response = await handler(request);
    res.statusCode = response.status;
    for (const [key, value] of response.headers) if (key !== 'set-cookie') res.setHeader(key, value);
    if (response.headers.getSetCookie().length) res.setHeader('set-cookie', response.headers.getSetCookie());
    if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch { res.statusCode = 500; res.end('Internal server error'); }
}
`;
/** Stage provider-owned layouts from a bundled Fetch handler and static output. */
export function writeDeployment(options: { root: string; provider: DeployProvider; assets: string; serverBundle?: string }) {
  const { root, provider, assets, serverBundle } = options;
  if (!['node', 'docker', 'static', 'vercel', 'netlify', 'cloudflare'].includes(provider)) throw new Error(`Unknown provider: ${provider}`);
  if (!existsSync(assets)) throw new Error('Build static assets first');
  if (provider === 'static' && serverBundle) throw new Error('Static export cannot contain server functions');
  const output = resolve(root, '.onestack/deploy', provider);
  const write = (path: string, content: string | object) => { const target = resolve(output, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2)); };
  const staticPath = provider === 'vercel' ? '.vercel/output/static' : 'public';
  mkdirSync(resolve(output, staticPath), { recursive: true }); cpSync(assets, resolve(output, staticPath), { recursive: true });
  write('package.json', { private: true, type: 'module', engines: { node: '>=22.13' }, scripts: { start: 'node server.mjs' } });
  const bundlePath = provider === 'vercel' ? '.vercel/output/functions/api.func/handler.mjs' : provider === 'netlify' ? 'functions/handler.mjs' : 'handler.mjs';
  if (serverBundle) { mkdirSync(dirname(resolve(output, bundlePath)), { recursive: true }); cpSync(serverBundle, resolve(output, bundlePath)); }
  else write(bundlePath, `export default () => new Response('Not found', {status:404});`);
  if (provider === 'vercel') {
    write('.vercel/output/config.json', { version: 3, routes: [{ src: '/api/(.*)', dest: '/api' }, { handle: 'filesystem' }, { src: '/(.*)', dest: '/index.html' }] });
    write('.vercel/output/functions/api.func/.vc-config.json', { runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs' });
    write('.vercel/output/functions/api.func/index.mjs', `import handler from './handler.mjs';\n${nodeAdapter}`);
  } else if (provider === 'netlify') {
    write('functions/api.mjs', `export { default } from './handler.mjs';\nexport const config = { path: '/api/*' };\n`);
    write('netlify.toml', '[build]\npublish = "public"\n[functions]\ndirectory = "functions"\nnode_bundler = "esbuild"\n[[redirects]]\nfrom = "/*"\nto = "/index.html"\nstatus = 200\n');
  } else if (provider === 'cloudflare') {
    write('worker.mjs', `import handler from './handler.mjs';\nexport default { fetch(request, env, ctx) { return new URL(request.url).pathname.startsWith('/api/') ? handler(request, env, ctx) : env.ASSETS.fetch(request); } };\n`);
    write('wrangler.json', { name: 'onestack-app', main: 'worker.mjs', compatibility_date: '2025-09-01', assets: { directory: './public', binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] } });
  } else if (provider === 'node' || provider === 'docker') {
    write('node-adapter.mjs', `import app from './handler.mjs';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const publicDir = resolve(import.meta.dirname, 'public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
async function handler(request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/api/')) return app(request);
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405});
  const key = decodeURIComponent(pathname);
  if (key.includes('..') || key.includes('\\\\') || key.includes('\\0')) return new Response('Bad path', {status:400});
  const path = resolve(publicDir, '.' + key);
  try { return new Response(await readFile(path), { headers: {'content-type': types[extname(path)] ?? 'application/octet-stream'} }); }
  catch { return new Response(await readFile(resolve(publicDir, 'index.html')), {headers: {'content-type': 'text/html'}}); }
}
${nodeAdapter}`);
    write('server.mjs', `import { createServer } from 'node:http';\nimport handler from './node-adapter.mjs';\ncreateServer(handler).listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0');\n`);
    if (provider === 'docker') write('Dockerfile', 'FROM node:22-slim\nWORKDIR /app\nCOPY --chown=node:node . .\nRUN mkdir -p /app/data && chown node:node /app/data\nENV DATA_DIR=/app/data\nUSER node\nEXPOSE 3000\nCMD ["node", "server.mjs"]\n');
  }
  write('deployment.json', { provider, staticAssets: staticPath, server: Boolean(serverBundle), environment: 'Provide secrets at runtime, never in the client build.' });
  return output;
}
