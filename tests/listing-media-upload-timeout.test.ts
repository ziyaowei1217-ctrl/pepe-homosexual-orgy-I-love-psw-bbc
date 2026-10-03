import { afterEach, expect, it, vi } from "vitest";
import { LISTING_MEDIA_UPLOAD_TIMEOUT_MS, putPresignedFile } from "../lib/listing-media";

afterEach(() => vi.unstubAllGlobals());

it("bounds interrupted uploads and rejects once without automatically repeating the PUT", async () => {
  let request!: FakeRequest;
  class FakeRequest {
    timeout = 0;
    upload = {};
    ontimeout?: () => void;
    open = vi.fn();
    setRequestHeader = vi.fn();
    send = vi.fn();
    constructor() { request = this; }
  }
  vi.stubGlobal("XMLHttpRequest", FakeRequest);
  const promise = putPresignedFile("https://media.example.test/upload", { type: "image/png" } as File, vi.fn());
  expect(request.timeout).toBe(LISTING_MEDIA_UPLOAD_TIMEOUT_MS);
  const rejected = expect(promise).rejects.toMatchObject({ status: 408, retryable: true });
  request.ontimeout?.();
  await rejected;
  expect(request.send).toHaveBeenCalledOnce();
});
