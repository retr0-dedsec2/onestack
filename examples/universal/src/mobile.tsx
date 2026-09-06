import { mountMobile, createNativeHost, createMobileBridge } from '@onestack/mobile';
import { createApp } from './app.js';
// Set to your deployed HTTPS backend. The native bundle contains no provider secrets.
const apiOrigin = 'https://your-onestack-backend.example';
const scope = globalThis as any;
const bridge = createMobileBridge(request => {
  const message = { type: 'invoke', request };
  if (scope.OneStackAndroid) scope.OneStackAndroid.postMessage(JSON.stringify(message));
  else scope.webkit.messageHandlers.onestack.postMessage(message);
});
scope.__onestackResponse = bridge.receive;
mountMobile(createApp(apiOrigin, url => { void bridge.invoke('externalUrls', 'open', url); }), createNativeHost(), { allowWebViewFallback: true });
