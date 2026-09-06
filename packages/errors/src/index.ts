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
