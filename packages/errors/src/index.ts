export interface OneStackErrorOptions {
  code: string;
  message: string;
  cause?: unknown;
  provider?: string;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
}

export class OneStackError extends Error {
  readonly code: string;
  readonly provider?: string;
  readonly retryable: boolean;
  readonly metadata?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: OneStackErrorOptions) {
    super(options.message);
    this.name = "OneStackError";
    this.code = options.code;
    this.provider = options.provider;
    this.retryable = options.retryable ?? false;
    this.metadata = options.metadata;
    this.cause = options.cause;
  }
}

export function normalizeError(error: unknown, defaults: Omit<OneStackErrorOptions, "message" | "cause"> & { message?: string }): OneStackError {
  if (error instanceof OneStackError) return error;
  const message = error instanceof Error ? error.message : defaults.message ?? "Unknown OneStack error";
  return new OneStackError({ ...defaults, message, cause: error });
}

/** Normalize sync throws and rejected provider promises without changing return types. */
export function providerBoundary<T extends { readonly provider: string }>(adapter: T, code: string): T {
  return new Proxy(adapter, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const convert = (error: unknown) => normalizeError(error, { code, provider: target.provider });
        try {
          const result = Reflect.apply(value, target, args);
          return result && typeof result.then === 'function' ? result.catch((error: unknown) => { throw convert(error); }) : result;
        } catch (error) { throw convert(error); }
      };
    },
  });
}
