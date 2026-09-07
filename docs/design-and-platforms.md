# Design once, connect one backend

## Start the full application

```sh
pnpm install --frozen-lockfile
pnpm build
cd examples/universal
onestack dev
```

One development command now serves the Vite frontend and `src/server.ts` Fetch handler on the same port. `/api/*` goes to the backend; Vite reloads the server module after edits. There is no separate backend port or CORS proxy to maintain for web development. Restart the dev process after environment/configuration changes or database-provider changes. Production still uses `onestack deploy` output, not the development server.

## Design without repeating CSS

Run `onestack add theme` inside your application to create `src/components/ui/theme.tsx` (existing files are preserved; the command refuses to overwrite them). Import its components in shared web/desktop/mobile JSX:

```tsx
import { createDesignSystem } from '@onestack/ui';
const { Screen, Card, Title, Input, Button } = createDesignSystem({
  colors: { primary: '#3157d5', background: '#f5f6fa' },
  spacing: { md: 16 }, radius: 12,
});

export function App() {
  return <Screen>
    <Title>My application</Title>
    <Card>
      <Input aria-label="Name" placeholder="Your name" />
      <Button onClick={() => console.log('saved')}>Save</Button>
    </Card>
  </Screen>;
}
```

Each design system owns its tokens; no global theme leaks between apps or SSR requests. Use `tone="secondary"`, `gap`, `padding`, or `style` for local changes. Stack defaults survive style overrides. Numeric gap/padding, hex colors, radius, borders, font size/weight and minimum control height are mapped to native controls. Web-only properties such as maxWidth, margin auto and cursor do not imply full native CSS support. Rows do not wrap natively; prefer vertical stacks for narrow screens. Native text fields retain platform-specific insets.

## A single API contract

Keep a shared type-only contract describing each action's `input` and `output`. `createApiClient<Contract>` makes calls type-safe on every platform and `createApiHandler<Contract>` makes implementations conform to that contract. Each server route must supply a runtime `parse` validator. TypeScript cannot validate arbitrary server responses at runtime; use application schemas when communicating with independently deployed/untrusted servers.

The HTTP client bounds request duration (15 seconds by default), accepts AbortSignal, clears session state through `onUnauthorized`, and reports `ApiError` codes such as TIMEOUT, ABORTED, NETWORK_ERROR and AUTH_REQUIRED. It never retries mutations automatically. The handler bounds request bytes, validates JSON/content type, supports an explicit CORS allowlist, and returns safe JSON failures. Use `ApiError(code, publicMessage, status)` only for errors safe to show to users; unexpected exceptions remain server-side. These HTTP helpers are additive: existing transport-neutral RPC remains supported.

See `examples/universal/src/contract.ts`, `app.tsx` and `server.ts`. The example prevents overlapping actions and clears notes/tokens when changing backend or logging out. Tokens stay in memory. Production authorization, rate limiting, recovery and webhook fulfillment remain application responsibilities.

## One endpoint across builds

Set the public backend origin once:

```ts
export default defineConfig({
  app: { name: 'My app', identifier: 'dev.example.app' },
  api: { origin: 'https://api.example.com' },
});
```

`ONESTACK_API_ORIGIN` overrides this value at build/dev time. Only the validated public origin is injected as `__ONESTACK_API_ORIGIN__`; credentials and provider configuration remain server-only. Web development can leave it empty for same-origin requests. Packaged desktop/mobile clients need a deployed HTTPS backend. Allow their concrete origins in the server's `ALLOWED_ORIGINS`; do not use wildcard credential access. The universal demo also has a Backend URL field for testing a downloaded app without rebuilding. A changed endpoint clears its session token.

## Download applications from GitHub

Every successful PR CI run uploads:

- `desktop-Windows-*`: complete portable Windows applications containing `.exe`, assets and hidden manifests (ZIP).
- `desktop-macOS-*`: application bundles in tar.gz plus DMG images.
- `desktop-Linux-*`: executable bundles in tar.gz plus Debian packages when available.
- `android-debug`: installable debug APK of the universal example.
- `ios-simulator-app`: a simulator `.app` archive, not a signed iPhone IPA.

Open the CI run and download its **Artifacts**. Desktop artifacts include both the offline counter demo and the universal client; the framework itself is a TypeScript library/CLI, not a standalone GUI executable. Keep each portable bundle intact. SHA256SUMS.txt accompanies desktop archives. Archives preserve executable permissions and hidden application manifests. Windows/Linux builds use x64 runners; macOS follows the runner architecture shown in the filename. These are development builds, not notarized/store-signed releases. No backend database or provider secrets are packaged.

Implementation references: [Vite SSR middleware](https://vite.dev/guide/ssr) and [GitHub artifact preservation](https://github.com/actions/upload-artifact).

When a trusted reverse proxy terminates TLS for Node output, set `ONESTACK_TRUST_PROXY=1` so its `X-Forwarded-Proto: https` header determines the Fetch request origin. Configure this only behind that proxy. Same-origin development and direct HTTP Node requests work without it.

Packaged desktop assets are served through the restricted `onestack` protocol, including direct route refreshes. The native mobile engine uses `https://onestack.invalid`; desktop origins are `onestack://localhost` on macOS/Linux and `http://onestack.localhost` on Windows. Add only the origins of clients you support to `ALLOWED_ORIGINS`. Requests with no configured backend return an explicit configuration error; no local Node server is bundled into the client executable.
