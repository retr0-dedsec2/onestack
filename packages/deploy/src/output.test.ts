import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeDeployment } from './output.js';

it('stages inspectable provider routing, runtimes and assets', () => {
  const root = mkdtempSync(join(tmpdir(), 'onestack-deploy-'));
  try {
    const assets = join(root, 'dist'); mkdirSync(assets); writeFileSync(join(assets, 'index.html'), '<h1>OneStack</h1>');
    const bundle = join(root, 'handler.mjs'); writeFileSync(bundle, "export default () => Response.json({ok:true});");
    for (const provider of ['vercel', 'netlify', 'cloudflare', 'node', 'docker'] as const) {
      const output = writeDeployment({ root, provider, assets, serverBundle: bundle });
      expect(existsSync(join(output, 'deployment.json'))).toBe(true);
      if (provider === 'vercel') expect(JSON.parse(readFileSync(join(output, '.vercel/output/config.json'), 'utf8')).version).toBe(3);
      if (provider === 'cloudflare') expect(JSON.parse(readFileSync(join(output, 'wrangler.json'), 'utf8')).assets.binding).toBe('ASSETS');
    }
    expect(() => writeDeployment({ root, provider: 'static', assets, serverBundle: bundle })).toThrow('server functions');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('executes generated Fetch handlers and the Cloudflare asset fallback', async () => {
  const { pathToFileURL } = await import('node:url');
  const root = mkdtempSync(join(tmpdir(), 'onestack-deploy-fetch-'));
  try {
    const assets = join(root, 'dist'); mkdirSync(assets); writeFileSync(join(assets, 'index.html'), 'static');
    const bundle = join(root, 'handler.mjs'); writeFileSync(bundle, "export default request => Response.json({ path: new URL(request.url).pathname });");
    const netlify = writeDeployment({ root, provider: 'netlify', assets, serverBundle: bundle });
    const fn = await import(pathToFileURL(join(netlify, 'functions/api.mjs')).href);
    expect(await (await fn.default(new Request('https://app.example/api/test'))).json()).toEqual({ path: '/api/test' });
    const cloudflare = writeDeployment({ root, provider: 'cloudflare', assets, serverBundle: bundle });
    const worker = (await import(pathToFileURL(join(cloudflare, 'worker.mjs')).href)).default;
    const env = { ASSETS: { fetch: async () => new Response('static') } };
    expect(await (await worker.fetch(new Request('https://app.example/'), env, {})).text()).toBe('static');
    expect(await (await worker.fetch(new Request('https://app.example/api/test'), env, {})).json()).toEqual({ path: '/api/test' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
