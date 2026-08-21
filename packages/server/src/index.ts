export const SERVER_FUNCTION = Symbol.for("onestack.server-function");

export type ServerHandler<Args extends unknown[] = unknown[], Result = unknown> = (...args: Args) => Result | Promise<Result>;

export interface ServerFunction<Args extends unknown[] = unknown[], Result = unknown> {
  (...args: Args): Promise<Result>;
  readonly [SERVER_FUNCTION]: true;
  readonly id: string;
  readonly handler: ServerHandler<Args, Result>;
}

let serverFunctionSequence = 0;

export function server<Args extends unknown[], Result>(
  handler: ServerHandler<Args, Result>,
  options: { id?: string } = {},
): ServerFunction<Args, Awaited<Result>> {
  const id = options.id ?? `os_server_${serverFunctionSequence++}`;
  const callable = (async (...args: Args) => handler(...args)) as ServerFunction<Args, Awaited<Result>>;
  Object.defineProperties(callable, {
    [SERVER_FUNCTION]: { value: true },
    id: { value: id, enumerable: true },
    handler: { value: handler },
  });
  return callable;
}

export function isServerFunction(value: unknown): value is ServerFunction {
  return typeof value === "function" && (value as Partial<ServerFunction>)[SERVER_FUNCTION] === true;
}

export interface ServerRegistry {
  register(fn: ServerFunction): void;
  get(id: string): ServerFunction | undefined;
  invoke(id: string, args: unknown[]): Promise<unknown>;
  ids(): string[];
}

export function createServerRegistry(initial: ServerFunction[] = []): ServerRegistry {
  const functions = new Map<string, ServerFunction>();
  const register = (fn: ServerFunction) => {
    if (functions.has(fn.id)) throw new Error(`OneStack server: duplicate server function id ${fn.id}.`);
    functions.set(fn.id, fn);
  };
  initial.forEach(register);

  return {
    register,
    get: (id) => functions.get(id),
    async invoke(id, args) {
      const fn = functions.get(id);
      if (!fn) throw new Error(`OneStack server: unknown server function ${id}.`);
      return fn.handler(...args);
    },
    ids: () => [...functions.keys()],
  };
}
