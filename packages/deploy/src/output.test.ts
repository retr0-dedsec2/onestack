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
