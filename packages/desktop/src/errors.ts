import type { DesktopBridgeError } from "./types.js";

export class DesktopError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(error: DesktopBridgeError) {
    super(error.message);
    this.name = "DesktopError";
    this.code = error.code;
    this.details = error.details;
  }
}
