import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS } from "../../src/read/index.js";
import { fetchSource, USER_AGENT } from "../../src/read/url.js";
import { startFixtureServer, type FixtureServer } from "./http-server.js";

let server: FixtureServer;
beforeAll(async () => {
  server = await startFixtureServer();
});
afterAll(async () => {
  await server.close();
});

describe("fetchSource (STORY-003-10 R6)", () => {
  it("has the frozen limits", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(20_000);
    expect(DEFAULT_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it("sends the wikeeper user agent and an accept header, and follows redirects", async () => {
    const seen: Record<string, string> = {};
    const fake = (async (_u: unknown, init: RequestInit) => {
      Object.assign(seen, init.headers);
      return new Response("hello", { headers: { "content-type": "text/plain" } });
    }) as unknown as typeof fetch;
    const r = await fetchSource(new URL("http://example.test/x"), { timeoutMs: 1000, maxBytes: 100, fetch: fake });
    expect(seen["user-agent"]).toBe(USER_AGENT);
    expect(seen["accept"]).toContain("text/html");
    expect(r.contentType).toBe("text/plain");
    const moved = await fetchSource(new URL(server.url("/moved")), { timeoutMs: 5000, maxBytes: 1 << 20, fetch });
    expect(moved.finalUrl).toBe(server.url("/article"));
  });

  it("maps the failure kinds to error codes", async () => {
    const run = (p: string, o: { timeoutMs?: number; maxBytes?: number } = {}) =>
      fetchSource(new URL(server.url(p)), { timeoutMs: o.timeoutMs ?? 5000, maxBytes: o.maxBytes ?? 1 << 20, fetch });
    await expect(run("/slow", { timeoutMs: 200 })).rejects.toMatchObject({ code: "timeout" });
    await expect(run("/big", { maxBytes: 1024 })).rejects.toMatchObject({ code: "too_large", details: { limit_bytes: 1024 } });
    await expect(run("/stream", { maxBytes: 1024 })).rejects.toMatchObject({ code: "too_large" });
    await expect(run("/gone")).rejects.toMatchObject({ code: "http_error", details: { status: 404 } });
  });
});
