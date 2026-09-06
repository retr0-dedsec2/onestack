import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateMobile, runMobile } from './mobile.js';
it('generates auditable mobile manifests without serializing backend secrets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'onestack-mobile-project-'));
  try {
    mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/mobile.tsx'), 'console.log("public mobile app");');
    writeFileSync(join(root, 'onestack.config.json'), JSON.stringify({ app: { name: 'Contract', identifier: 'dev.test.contract' }, mobile: { permissions: { notifications: true }, deepLinks: ['contract'], orientation: 'portrait' }, payments: { provider: 'stripe', secretKey: 'sk_test_MUST_NOT_SHIP' } }));
    const android = await generateMobile(root, 'android'), ios = await generateMobile(root, 'ios');
    expect(readFileSync(join(android.output, 'app/src/main/AndroidManifest.xml'), 'utf8')).toContain('POST_NOTIFICATIONS');
    expect(readFileSync(join(ios.output, 'Info.plist'), 'utf8')).toContain('contract');
    for (const [directory, prefix] of [[android.output, 'app/src/main/assets/'], [ios.output, '']]) {
      expect(readFileSync(join(directory, prefix + 'manifest.json'), 'utf8')).not.toContain('sk_test_MUST_NOT_SHIP');
      expect(readFileSync(join(directory, prefix + 'app.js'), 'utf8')).not.toContain('sk_test_MUST_NOT_SHIP');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
