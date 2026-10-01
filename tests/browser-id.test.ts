import { afterEach, expect, it, vi } from "vitest";
import { newBrowserCommandId } from "../lib/browser-id";

afterEach(() => vi.unstubAllGlobals());

it("creates a valid cryptographic UUID on mobile browsers without randomUUID", () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => { bytes.fill(255); return bytes; });
  vi.stubGlobal("crypto", { getRandomValues });
  expect(newBrowserCommandId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  expect(getRandomValues).toHaveBeenCalledOnce();
});
