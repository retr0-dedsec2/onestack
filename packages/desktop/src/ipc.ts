import { DesktopError } from "./errors.js";
import { emitDesktopEvent } from "./events.js";
import type { DesktopEvent, DesktopRequest, DesktopResponse } from "./types.js";

export type DesktopTransport = (request: DesktopRequest) => DesktopResponse | Promise<DesktopResponse>;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timeout: ReturnType<typeof setTimeout>;
}

interface DesktopGlobals {
  window?: { ipc?: { postMessage(message: string): void } };
  __ONESTACK_DESKTOP_RECEIVE__?: (response: DesktopResponse | string) => void;
  __ONESTACK_DESKTOP_EVENT__?: (event: DesktopEvent | string) => void;
}

const pending = new Map<string, PendingRequest>();
let customTransport: DesktopTransport | null = null;
let requestSequence = 0;

function globals() {
  return globalThis as unknown as DesktopGlobals;
}

function parseMessage<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function receiveResponse(input: DesktopResponse | string) {
  const response = parseMessage<DesktopResponse>(input);
  const request = pending.get(response.id);
  if (!request) return;
  clearTimeout(request.timeout);
  pending.delete(response.id);
  if (response.ok) request.resolve(response.value);
  else request.reject(new DesktopError(response.error ?? {
    code: "OS_DESKTOP_UNKNOWN_ERROR",
    message: "The desktop host returned an unknown error.",
  }));
}

function receiveEvent(input: DesktopEvent | string) {
  const event = parseMessage<DesktopEvent>(input);
  const prevented = emitDesktopEvent(event);
  if (event.scope === "window" && event.name === "close-requested" && !prevented) {
    void invokeDesktop("window", "closeConfirmed", { id: event.target });
  }
}

function installReceivers() {
  const host = globals();
  host.__ONESTACK_DESKTOP_RECEIVE__ = receiveResponse;
  host.__ONESTACK_DESKTOP_EVENT__ = receiveEvent;
}

installReceivers();

export function setDesktopTransport(transport: DesktopTransport | null) {
  customTransport = transport;
}

export function isDesktopHost(): boolean {
  return customTransport !== null || typeof globals().window?.ipc?.postMessage === "function";
}

export async function invokeDesktop<T = unknown>(
  namespace: DesktopRequest["namespace"],
  command: string,
  payload: unknown = {},
  timeoutMs = 30_000,
): Promise<T> {
  const request: DesktopRequest = {
    protocol: "onestack.desktop.v1",
    id: `os_desktop_${Date.now().toString(36)}_${requestSequence++}`,
    namespace,
    command,
    payload,
  };

  if (customTransport) {
    const response = await customTransport(request);
    if (!response.ok) throw new DesktopError(response.error ?? {
      code: "OS_DESKTOP_UNKNOWN_ERROR",
      message: "The desktop transport returned an unknown error.",
    });
    return response.value as T;
  }

  const ipc = globals().window?.ipc;
  if (!ipc?.postMessage) {
    throw new DesktopError({
      code: "OS_DESKTOP_HOST_UNAVAILABLE",
      message: "This API requires the OneStack desktop host.",
    });
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(request.id);
      reject(new DesktopError({
        code: "OS_DESKTOP_TIMEOUT",
        message: `Desktop command ${namespace}.${command} timed out.`,
      }));
    }, timeoutMs);
    pending.set(request.id, { resolve: resolve as (value: unknown) => void, reject, timeout });
    ipc.postMessage(JSON.stringify(request));
  });
}
