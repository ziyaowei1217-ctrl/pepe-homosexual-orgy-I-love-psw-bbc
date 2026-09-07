import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const servers: Server[] = [];

async function startApi(source: string) {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ source, path: request.url }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test API did not listen");
  return `http://127.0.0.1:${address.port}/api/v1`;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("server and browser API routing", () => {
  it("fetches server-rendered page data from the internal API address", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", await startApi("public"));
    vi.stubEnv("API_INTERNAL_BASE_URL", await startApi("internal"));
    const { apiGet } = await import("../lib/api");
    expect(await apiGet("/listings")).toEqual({ source: "internal", path: "/api/v1/listings" });
  });

  it("uses the public address for browser requests even when an internal address is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", await startApi("public"));
    vi.stubEnv("API_INTERNAL_BASE_URL", await startApi("internal"));
    vi.stubGlobal("window", {});
    const { apiGet } = await import("../lib/api");
    expect(await apiGet("/listings")).toEqual({ source: "public", path: "/api/v1/listings" });
  });

  it("keeps native local development working without a separate internal address", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", await startApi("public"));
    vi.stubEnv("API_INTERNAL_BASE_URL", "");
    const { apiGet } = await import("../lib/api");
    expect(await apiGet("/listings")).toEqual({ source: "public", path: "/api/v1/listings" });
  });
});
