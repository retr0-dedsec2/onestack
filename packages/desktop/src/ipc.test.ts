import { afterEach, describe, expect, it } from "vitest";
import { filesystem } from "./filesystem.js";
import { invokeDesktop, setDesktopTransport } from "./ipc.js";

const protocol = "onestack.desktop.v1" as const;

afterEach(() => setDesktopTransport(null));

describe("desktop IPC", () => {
  it("routes typed API calls through the configured transport", async () => {
    setDesktopTransport(async (request) => ({
      protocol,
      id: request.id,
      ok: true,
      value: request.namespace === "filesystem" ? "hello" : null,
    }));
    await expect(filesystem.readText("notes.txt")).resolves.toBe("hello");
  });

  it("turns host errors into DesktopError instances", async () => {
    setDesktopTransport(async (request) => ({
      protocol,
      id: request.id,
      ok: false,
      error: { code: "OS_DESKTOP_PERMISSION_DENIED", message: "denied" },
    }));
    await expect(invokeDesktop("clipboard", "readText", {})).rejects.toMatchObject({
      code: "OS_DESKTOP_PERMISSION_DENIED",
    });
  });
});
