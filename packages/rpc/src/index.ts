import type { ServerFunction, ServerRegistry } from "@onestack/server";

export interface RpcRequest {
  id: string;
  args: unknown[];
}

export type RpcResponse =
  | { ok: true; value: unknown }
  | { ok: false; error: { name: string; message: string } };

interface TaggedValue {
  __osType: "Date" | "Error";
  value: unknown;
}

function encodeRpc(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Date) {
    return { __osType: "Date", value: value.toISOString() } satisfies TaggedValue;
  }

  if (value instanceof Error) {
    return {
      __osType: "Error",
      value: { name: value.name, message: value.message },
    } satisfies TaggedValue;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("OneStack RPC cannot serialize circular arrays.");
    seen.add(value);
    const encoded = value.map((entry) => encodeRpc(entry, seen));
    seen.delete(value);
    return encoded;
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (seen.has(object)) throw new TypeError("OneStack RPC cannot serialize circular objects.");
    seen.add(object);
    const encoded: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(object)) encoded[key] = encodeRpc(entry, seen);
    seen.delete(object);
    return encoded;
  }

  return value;
}

export function serializeRpc(value: unknown): string {
  return JSON.stringify(encodeRpc(value));
}

export function deserializeRpc(payload: string): unknown {
  return JSON.parse(payload, (_key, entry) => {
    if (!entry || typeof entry !== "object" || !("__osType" in entry)) return entry;
    const tagged = entry as TaggedValue;
    if (tagged.__osType === "Date") return new Date(String(tagged.value));
    if (tagged.__osType === "Error") {
      const details = tagged.value as { name?: string; message?: string };
      const error = new Error(details.message ?? "OneStack RPC error");
      error.name = details.name ?? "Error";
      return error;
    }
    return entry;
  });
}

export function createRpcHandler(registry: ServerRegistry) {
  return async (request: RpcRequest): Promise<RpcResponse> => {
    try {
      return { ok: true, value: await registry.invoke(request.id, request.args) };
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      return { ok: false, error: { name: error.name, message: error.message } };
    }
  };
}

export type RpcTransport = (request: RpcRequest) => Promise<RpcResponse>;

export function createRpcStub<Args extends unknown[], Result>(
  fn: Pick<ServerFunction<Args, Result>, "id">,
  transport: RpcTransport,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    const response = await transport({ id: fn.id, args });
    if (!response.ok) {
      const error = new Error(response.error.message);
      error.name = response.error.name;
      throw error;
    }
    return response.value as Result;
  };
}
