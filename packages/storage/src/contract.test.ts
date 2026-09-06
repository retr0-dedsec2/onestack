import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import { createLocalStorage } from './local.js';
import { createS3Storage } from './s3.js';
const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
async function directory() { const path = await mkdtemp(join(tmpdir(), 'onestack-storage-')); directories.push(path); return path; }
for (const provider of ['local', 's3']) describe.skipIf(provider === 's3' && !process.env.TEST_S3_ENDPOINT)(`${provider} storage contract`, () => {
  it('round trips binary data, lists and deletes', async () => {
    const adapter = provider === 'local' ? createLocalStorage(await directory()) : createS3Storage({ bucket: 'onestack-test', endpoint: process.env.TEST_S3_ENDPOINT, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });
    if (provider === 's3') { const setup = new S3Client({ endpoint: process.env.TEST_S3_ENDPOINT, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }); try { await setup.send(new CreateBucketCommand({ Bucket: 'onestack-test' })); } finally { setup.destroy(); } }
    const key = `contract/${Date.now()}.bin`, bytes = new Uint8Array([0, 255, 13, 10]);
    try {
      expect((await adapter.upload(key, bytes, { contentType: 'application/octet-stream' })).size).toBe(4);
      expect((await adapter.metadata!(key)).contentType).toBe('application/octet-stream');
      expect(Array.from(await adapter.download(key))).toEqual(Array.from(bytes));
      expect((await adapter.list('contract/')).some(o => o.key === key)).toBe(true);
      if (adapter.signedUrl) expect(await adapter.signedUrl(key, 60)).toContain('X-Amz-Signature');
      await adapter.remove(key);
      await expect(adapter.download(key)).rejects.toThrow();
    } finally { if ('close' in adapter) adapter.close(); }
  });
});
it('rejects traversal and symlink escape', async () => {
  const root = await directory(), outside = await directory(), storage = createLocalStorage(root);
  for (const key of ['../secret', '/etc/passwd', 'a/../../secret', 'a\\secret']) await expect(storage.upload(key, 'bad')).rejects.toThrow();
  await symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(storage.upload('escape/secret', 'bad')).rejects.toThrow('symlink');
});
