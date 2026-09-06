# OneStack v0.4

OneStack adds native mobile hosts and provider adapters while retaining the v0.2 web/desktop model. This document describes the implemented surface and its boundaries; a successful package build alone is not proof of an app-store-ready release.

## Install and build

Use Node **22.13 or newer**, pnpm **10.15.0**, and the committed lockfile:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @onestack/example-counter build
pnpm --filter @onestack/example-universal build
```

The CLI source launcher exists before compilation, so fresh installs can link `onestack`. `pnpm build` no longer implicitly installs dependencies. Install explicitly first. Build outputs and TypeScript incremental state are ignored by Git.

## Mobile

An app supplies `src/mobile.tsx`. Bundle application code with `mountMobile(view, createNativeHost())`; reuse OneStack JSX, signal accessors and the router. The native renderer preserves component-local signals and evaluates dynamic children/props on reactive updates.

```ts
import { defineConfig } from '@onestack/config';
export default defineConfig({
  app: { name: 'My app', identifier: 'com.example.app', version: '0.4.0' },
  mobile: {
    orientation: 'portrait',
    permissions: { filesystem: true, clipboard: true, system: true },
    deepLinks: ['myapp'],
    allowWebViewFallback: false,
    android: { minSdk: 26, targetSdk: 35 },
    ios: { deploymentTarget: '15.0' },
  },
});
```

`icon` and `splash` reference existing PNG files. Use a 1024×1024 icon for iOS. Generated projects, the public permission manifest and the bundled JS live under `.onestack/mobile/android` or `.onestack/mobile/ios`. Configuration is read by the CLI; provider secrets are not serialized into these manifests.

```sh
onestack build --target android --generate-only
onestack build --target ios --generate-only
onestack build --target android
onestack build --target ios
onestack run --target android
onestack run --target ios
onestack dev --target android
onestack release --target android --unsigned
onestack release --target ios --unsigned
```

Android requires JDK 17, Gradle 8.11.1, Android SDK 35 and `adb`. iOS requires macOS, full Xcode, XcodeGen and a booted simulator for `run`. `dev` builds, installs and launches; it does not yet implement hot reload. `--generate-only` does not compile or launch a native app.

Release produces an Android AAB or an iOS **device** `.xcarchive`. By default release requires signing configuration. Android reads `ONESTACK_ANDROID_KEYSTORE`, `ONESTACK_ANDROID_STORE_PASSWORD`, `ONESTACK_ANDROID_KEY_ALIAS` and `ONESTACK_ANDROID_KEY_PASSWORD` from the environment. iOS reads `ONESTACK_IOS_TEAM` and uses installed Apple signing/provisioning credentials. `--unsigned` explicitly generates an unsigned artifact. Export/upload to the stores remains an application release operation; this repository does not submit apps.

### Rendering and native access

Visible controls are Android views or UIKit views, not an HTML application. A private, non-visible WebView executes bundled JavaScript and transports tree snapshots/events. This provides browser-compatible JavaScript APIs while keeping visible UI native. Explicit content WebViews are separate instances **without** the privileged bridge.

Portable controls include `View`, `Text`, `Image`, `ScrollView`, `Pressable`, `TextInput`, `Switch`, `ActivityIndicator`, `SafeArea`, and `WebView`. The UI package exposes the portable variants. Unsupported native tags throw; there is no automatic WebView replacement. Network images and embedded URLs require HTTPS. Native layout is a stack layout, not a full CSS/Grid engine. Use dynamic signal accessors for reactive children and props, just as with the DOM renderer.

Available bridge operations on both hosts:

| Capability | Operations |
| --- | --- |
| `filesystem` | `read(key)`, `write(key, text)`, `remove(key)` in the app's private OneStack directory; text files up to 1 MiB |
| `clipboard` | `read`, `write(text)` |
| `system` | `info` |
| `notifications` | `request` OS permission, `show(title, body)` local notification |
| `externalUrls` | `open(httpOrHttpsUrl)` |
| `share` | `text(value)` |
| `haptics` | `impact` |

Call `bridge.invoke(namespace, method, ...args)`. Every host checks `permissions[namespace]` before dispatch. The TypeScript runtime also rejects mismatched capability/namespace requests. Camera, photo-library, microphone and location are reserved capability contracts; operations currently return an explicit unsupported error. They are not implemented device integrations.

`onMobileLifecycle(handler)` receives active/background/deep-link notifications. `deepLinks` currently means custom URL schemes; universal links/app links require additional application-specific domain association. There is no automatic route interpretation of an incoming URL: resolve the permitted route in the app.

## Data

Keep database providers in `.server.ts` files:

```ts
import { createDatabase } from '@onestack/data';
import { createSQLiteAdapter } from '@onestack/data/sqlite';
const adapter = createSQLiteAdapter('app.sqlite');
const db = createDatabase(adapter);
await db.migrate([{ id: '001', up: 'CREATE TABLE notes (id TEXT PRIMARY KEY, text TEXT)' }]);
await db.insert('notes', { id: 'one', text: 'Hello' });
const notes = await db.query('notes', { where: { id: 'one' } });
await db.transaction(async tx => { await tx.update('notes', { text: 'Updated' }, { where: { id: 'one' } }); });
await adapter.close();
```

For PostgreSQL use `createPostgresAdapter({ connectionString: process.env.DATABASE_URL })` from `@onestack/data/postgres`. The official `pg` pool pins one client per transaction; nested transactions use savepoints. SQLite uses Node's SQLite engine and serializes async transactions. Always use the supplied `tx` inside a transaction, not the outer database. SQL values are bound parameters and identifiers are validated. Portable predicates are equality/NULL equality. Sorting/pagination apply only to queries; paginated mutations are rejected by SQL adapters.

`defineSchema` and `schemaSql` generate initial portable DDL. Schema evolution uses explicit SQL migrations. `onestack db generate --name add_notes` creates an exclusive, timestamped SQL file; edit it before running migrations. `onestack db migrate` loads `onestack.services.ts`, which must export `database`, and applies sorted `migrations/*.sql` transactionally. `_onestack_migrations` records IDs; PostgreSQL also takes an advisory transaction lock. Applied files are immutable by convention: changing an applied file does not rerun it. Down migrations are not automatically executed.

The in-memory adapter is intended for isolated tests/development. Use SQL adapters for persistence and concurrent transactions.

## Auth

`createAuth(adapter)` provides sessions, guards, sign-in, sign-up, sign-out and magic links. Instantiate request/session state **per request**, never as a process-wide user's session.

`@onestack/auth/local` supplies SQL-backed password sessions. Apply `authMigrations`; provide `data`, `getToken` and `setToken` functions to `createLocalAuth`. Passwords are scrypt-hashed with random salts; database session records store token digests. Sessions expire and logout revokes the token. `sendMagicLink(email, token)` is an application delivery callback; `consumeMagicLink(token)` consumes a short-lived token once. The adapter does not send email on its own.

`@onestack/auth/oauth` provides an OAuth2 authorization-code/PKCE flow. Configure provider URLs, client credentials, scopes, redirect URI, `mapUser`, and durable request-bound `saveState`/atomic `takeState` callbacks. `begin()` returns the authorization URL; `complete(code, state)` exchanges the code and returns a provider identity. Provision/link that identity and issue an application session in trusted server code. Do not link accounts solely by an unverified email. This is an OAuth2 profile flow, not an ID-token verifier or an automatic account-linking system.

`onestack auth setup` scaffolds `src/auth.server.ts` and refuses to overwrite it. Production HTTP applications must add rate limits, their email verification/recovery policy, HTTPS, and secure cookie or native secure-token storage at their request boundary. The universal example deliberately holds its demonstration bearer token only in memory.

## Storage

`createStorage(adapter)` exposes upload, download, remove, list, metadata and signed URLs where supported.

- `@onestack/storage/local`: `createLocalStorage(directory)`. Private development storage, atomic envelope writes, binary round trips and metadata. Path traversal and symlinks are rejected. Keep the directory private to the server process. This is not a public static file directory and has no signed-URL endpoint.
- `@onestack/storage/s3`: `createS3Storage({ bucket, region, endpoint?, forcePathStyle? })`. Uses the AWS SDK credential chain, including S3-compatible servers. Implements pagination, object metadata and expiring GET URLs. Buckets are not made public. Call `close()` when disposing the client.

## Payments

`createStripePayments({ secretKey, webhookSecret })` from `@onestack/payments/stripe` uses the official Stripe SDK. Wrap it with `createPayments` for normalized errors. Supported operations: customer creation, hosted checkout (`subscription` by default or `payment`), subscription lookup, billing portal, webhook verification and dispatch.

Pass the **unaltered raw request body** and the `Stripe-Signature` header to `verifyWebhook`/`dispatchWebhook`. Verification and timestamp tolerance precede dispatch. Fulfillment handlers must persist/deduplicate `event.id`; retries are normal. Tests use SDK-generated valid, invalid and stale signatures, not real charges.

## Deployment

`src/server.ts` exports a Fetch handler `(request: Request) => Response | Promise<Response>`. Keep `/api/*` on that boundary and static UI in the Vite output. `onestack deploy --provider ...` builds and stages output under `.onestack/deploy/<provider>`; it does not publish unless `--publish` is explicitly supplied.

| Provider | Generated output | Notes |
| --- | --- | --- |
| Node | `server.mjs`, Fetch-to-Node adapter, static files | `node server.mjs`; `PORT`, `HOST` supported |
| Docker | Node output plus Dockerfile | Build the staged directory; mount durable storage externally |
| Vercel | Build Output API v3 `.vercel/output` | Node 22 function, static routes; `--publish` calls `vercel deploy --prebuilt` |
| Netlify | `netlify.toml`, Fetch function, public files | `--publish` calls Netlify CLI; credentials/project selection belong to your environment |
| Cloudflare | module Worker, asset binding, `wrangler.json` | Requires an edge-compatible Fetch handler; Node-only modules fail the build explicitly |
| Static | public assets | Rejects an application containing `src/server.ts` |

Use persistent external data/storage on serverless providers. The universal example's SQLite/local-filesystem defaults target Node/Docker; select PostgreSQL/S3 for compatible Node serverless deployments. They do not become Cloudflare-compatible merely by changing a provider name. Set provider credentials at runtime. Deployment output generation is tested locally; publication to actual cloud projects requires your project configuration and credentials.

## Security boundary and errors

The CLI injects a Vite plugin for web/desktop builds and an esbuild plugin for mobile. Transitive `.server` imports, `onestack.config` and privileged provider entrypoints are rejected in clients. Use explicit RPC/HTTP calls instead of importing the server implementation into a component. Custom builds outside the OneStack CLI must install equivalent protection themselves. Do not put secrets in public `VITE_*` variables.

Data/auth/storage/payments clients normalize provider failures as `OneStackError` with `code`, `provider`, `retryable` and original `cause`. Keep causes/logs on the server; do not serialize provider exceptions to clients. The example returns generic request errors.

## Compatibility and validation

Existing app/desktop config and the legacy desktop JSON config remain supported. Existing web/server functions are retained. The existing counter and universal app both build for the web. CI builds the native desktop host on Linux, Windows and macOS, builds the Android/iOS apps, launches them in emulators/simulators and runs SQL/S3 contracts. Local checks can enable service tests with:

```sh
TEST_DATABASE_URL=postgres://... TEST_S3_ENDPOINT=http://127.0.0.1:5000 pnpm test
```

Without those variables only the external-service tests are skipped; SQLite and filesystem contracts still run. S3 CI uses Moto, not an AWS account. Signing, live Stripe checkout/OAuth, production S3 credentials and actual cloud publishing require the application's environment and are not certified by these tests.

## Reference example

See [examples/universal](../../examples/universal/README.md) for the runnable shared UI, routing, auth, notes database, text-file upload, checkout and portal example.

Provider format references: [Vercel Build Output](https://vercel.com/docs/build-output-api), [Netlify Functions](https://docs.netlify.com/build/functions/api/), [Node SQLite](https://nodejs.org/api/sqlite.html), [PostgreSQL transactions](https://node-postgres.com/features/transactions), [AWS S3 SDK](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html), [Stripe webhooks](https://docs.stripe.com/webhooks).
