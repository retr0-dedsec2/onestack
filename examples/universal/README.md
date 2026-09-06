# Universal example

Shared JSX/signals/router run as web, desktop or native Android/iOS UI. The server demonstrates authentication, persistent notes through a server function, text-file upload, Stripe checkout and a billing portal.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @onestack/example-universal deploy:node
cd examples/universal/.onestack/deploy/node
node server.mjs
```

Visit `http://localhost:3000`, create an account with a 12+ character password, save a note and upload its contents as a file. Data is stored in `.data/` relative to the server working directory. `DATA_DIR` overrides that directory. `DATABASE_URL` selects PostgreSQL; otherwise SQLite is used. `S3_BUCKET`, `AWS_REGION`, optional `S3_ENDPOINT` and the AWS credential chain select S3 instead of local storage.

To test subscriptions, configure **test-mode** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` and `APP_URL`. The webhook is `/api/webhook`. The example verifies events and acknowledges them; production entitlement fulfillment and durable event deduplication belong to the application. No checkout is fabricated when credentials are missing: the server returns 503.

For mobile, set the public HTTPS backend URL in `src/mobile.tsx` and add `https://onestack.invalid` to the backend's comma-separated `ALLOWED_ORIGINS`. This origin is the private bundled JavaScript host. Then run `pnpm build:android`, `pnpm build:ios`, or `onestack run --target android|ios` from this example directory. The app does not embed a database or any provider secret; service operations go to the backend. The placeholder backend in source is not a deployed service.

Desktop uses `onestack build --target desktop`. For a packaged app, configure the client API origin in `src/main.tsx` to your HTTPS backend; the local Node demonstration serves both UI and API on one origin. Production deployments should add request rate limits and choose a persistent session-token mechanism appropriate to web/native clients.

`onestack deploy --provider node|docker` supports the defaults. Node serverless deployments require PostgreSQL/S3 and a runtime-writable temporary directory for any local startup needs. Cloudflare and static export intentionally reject the Node-only backend. See [v0.4 documentation](../../docs/v0.4/README.md) for adapter APIs, mobile signing and remaining capability boundaries.

## Simplified development and design

`onestack dev` serves this frontend and backend together. The shared UI uses `createDesignSystem`, and `contract.ts` defines typed API requests. Set `api.origin` or `ONESTACK_API_ORIGIN` for packaged clients, or use the Backend URL field. See [the guide](../../docs/design-and-platforms.md).
