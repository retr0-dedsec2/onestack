import { expect, it } from 'vitest';
import { providerBoundary, OneStackError } from './index.js';
it('preserves provider context and original cause for failed operations', async () => {
  const cause = new Error('provider rejected operation');
  const adapter = providerBoundary({ provider: 'test', async read() { throw cause; } }, 'READ_FAILED');
  try { await adapter.read(); throw new Error('unexpected success'); }
  catch (error) { expect(error).toBeInstanceOf(OneStackError); expect(error).toMatchObject({ code: 'READ_FAILED', provider: 'test', cause, retryable: false }); }
});
