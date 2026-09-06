import { defineConfig } from '@onestack/config';
export default defineConfig({
  app: { name: 'OneStack Universal', identifier: 'dev.onestack.universal', version: '0.4.0' },
  desktop: { width: 900, height: 800, permissions: { shell: { externalUrls: true } } },
  mobile: { permissions: { externalUrls: true, system: true }, allowWebViewFallback: true },
  data: { provider: 'sqlite' }, auth: { provider: 'local' }, storage: { provider: 'local' }, payments: { provider: 'stripe' }, deploy: { provider: 'node' },
});
