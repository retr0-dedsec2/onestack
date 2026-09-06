import { loadOneStackConfig } from './config.js';
export function publicApiOrigin(root: string) {
  const value = process.env.ONESTACK_API_ORIGIN ?? loadOneStackConfig(root)?.api?.origin ?? '';
  if (!value) return '';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('api.origin must be an HTTP(S) origin without credentials or a path');
  return url.origin;
}
