import { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Development only: Vite owns the HTTP port and reloads the Fetch server module. */
export function devApiPlugin(root: string) {
  const entry = resolve(root, 'src/server.ts');
  return {
    name: 'onestack-dev-api', apply: 'serve',
    configureServer(server: any) {
      if (!existsSync(entry)) return;
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const module = await server.ssrLoadModule(entry);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
          const host = headers.get('host') ?? 'localhost';
          const request = new Request(new URL(req.url, `http://${host}`), { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) } as RequestInit);
          const response: Response = await module.default(request);
          res.statusCode = response.status;
          for (const [key, value] of response.headers) if (key !== 'set-cookie') res.setHeader(key, value);
          if (response.headers.getSetCookie().length) res.setHeader('set-cookie', response.headers.getSetCookie());
          if (response.body && req.method !== 'HEAD') {
            const stream = Readable.fromWeb(response.body as any);
            stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
          } else res.end();
        } catch (error) {
          server.config.logger.error(String(error));
          res.statusCode = 500; res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ code: 'INTERNAL_ERROR', error: 'The development backend failed; see the terminal' }));
        }
      });
    },
  };
}
