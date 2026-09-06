export interface StorageObject { key: string; size?: number; contentType?: string; etag?: string; metadata?: Record<string, string>; }
export interface StorageAdapter {
  readonly provider: string;
  upload(key: string, data: Uint8Array | string, options?: { contentType?: string; metadata?: Record<string, string> }): Promise<StorageObject>;
  download(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
  list(prefix?: string): Promise<StorageObject[]>;
  signedUrl?(key: string, expiresInSeconds?: number): Promise<string>;
}
export class StorageClient {
  constructor(readonly adapter: StorageAdapter) {}
  upload(key: string, data: Uint8Array | string, options?: { contentType?: string; metadata?: Record<string, string> }) { return this.adapter.upload(key, data, options); }
  download(key: string) { return this.adapter.download(key); }
  remove(key: string) { return this.adapter.remove(key); }
  list(prefix?: string) { return this.adapter.list(prefix); }
  signedUrl(key: string, expiresInSeconds?: number) { if (!this.adapter.signedUrl) throw new Error(`OneStack storage: ${this.adapter.provider} does not support signed URLs.`); return this.adapter.signedUrl(key, expiresInSeconds); }
}
export function createStorage(adapter: StorageAdapter) { return new StorageClient(adapter); }
