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

export function serializeRpc(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry instanceof Date) return { __osType: "Date", value: entry.toISOString() } satisfies TaggedValue;
    if (entry instanceof Error) return { __osType: "Error", value: { name: entry.name, message: entry.message } } satisfies TaggedValue;
    return entry;
  });
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
