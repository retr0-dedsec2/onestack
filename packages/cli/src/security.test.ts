import { expect, it } from 'vitest';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clientBoundary } from './security.js';
it('rejects server-only secrets through transitive client re-exports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'onestack-security-'));
  try {
    await writeFile(join(root, 'secret.server.ts'), 'export const secret = "sk_test_MUST_NEVER_SHIP";');
    await writeFile(join(root, 'shared.ts'), 'export { secret } from "./secret.server";');
    await writeFile(join(root, 'main.ts'), 'import { secret } from "./shared"; console.log(secret);');
    await expect(build({ entryPoints: [join(root, 'main.ts')], bundle: true, write: false, platform: 'browser', plugins: [clientBoundary()], logLevel: 'silent' })).rejects.toThrow('Server-only');
    const output = await build({ stdin: { contents: 'console.log("public")' }, write: false, plugins: [clientBoundary()] });
    expect(output.outputFiles[0].text).not.toContain('sk_test_MUST_NEVER_SHIP');
  } finally { await rm(root, { recursive: true, force: true }); }
});
