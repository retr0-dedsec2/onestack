import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, type S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageAdapter, StorageObject } from './index.js';

export function createS3Storage(options: S3ClientConfig & { bucket: string }): StorageAdapter & { close(): void } {
  const { bucket, ...config } = options;
  if (!bucket) throw new Error('S3 bucket is required');
  const client = new S3Client(config);
  return {
    provider: 's3', close: () => client.destroy(),
    async upload(key, data, options = {}) {
      const result = await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: options.contentType, Metadata: options.metadata }));
      return { key, size: typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength, etag: result.ETag, ...options };
    },
    async download(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error('Empty S3 response body');
      return result.Body.transformToByteArray();
    },
    async remove(key) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
    async list(prefix) {
      const objects: StorageObject[] = []; let token: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        objects.push(...(page.Contents ?? []).filter(o => o.Key !== undefined).map(o => ({ key: o.Key!, size: o.Size, etag: o.ETag })));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !token) throw new Error('S3 returned a truncated page without continuation token');
      } while (token);
      return objects;
    },
    signedUrl(key, expiresInSeconds = 900) {
      if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 604800) throw new Error('Invalid signed URL lifetime');
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
    },
  };
}
