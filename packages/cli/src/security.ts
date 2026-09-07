import type { Plugin } from 'esbuild';

/** Reject privileged modules in all transitive client imports, including re-exports. */
export function isServerOnly(path: string) {
  return /(?:\.server(?:\.|$)|[/\\]server(?:[/\\]|\.[cm]?[jt]sx?(?:\?|$)|$)|onestack\.config\.)/.test(path) || /^@onestack\/(?:data\/(?:sqlite|postgres)|storage\/(?:local|s3)|payments\/stripe|auth\/(?:local|oauth))(?:$|\/)/.test(path);
}
export function clientBoundary(): Plugin {
  return { name: 'onestack-server-boundary', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (isServerOnly(args.path)) return { errors: [{ text: `Server-only module cannot enter a client/mobile bundle: ${args.path}` }] };
      return undefined;
    });
    build.onLoad({ filter: /(?:\.server\.[cm]?[jt]sx?$|onestack\.config\.)/ }, args => ({ errors: [{ text: `Server-only module cannot enter a client bundle: ${args.path}` }] }));
  } };
}
