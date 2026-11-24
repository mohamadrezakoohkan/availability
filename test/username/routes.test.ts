import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../../src/index";

describe("GET /api/v1/usernames/:username", () => {
  it("reports a free name as available", async () => {
    const response = await app.request("/api/v1/usernames/alice", undefined, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "available", username: "alice" });
  });

  it("is never cached and sets no cookie", async () => {
    const response = await app.request("/api/v1/usernames/alice", undefined, env);

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("reports a reserved name", async () => {
    const response = await app.request("/api/v1/usernames/admin", undefined, env);

    expect(await response.json()).toEqual({ status: "reserved", username: "admin" });
  });

  it("reports an invalid name with the reason", async () => {
    const response = await app.request("/api/v1/usernames/al_ice", undefined, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "invalid", reason: "characters" });
  });

  it("decodes a percent-encoded name before checking it", async () => {
    const response = await app.request("/api/v1/usernames/al%20ice", undefined, env);

    expect(await response.json()).toEqual({ status: "invalid", reason: "characters" });
  });

  it("only answers GET", async () => {
    const response = await app.request("/api/v1/usernames/alice", { method: "POST" }, env);

    expect(response.status).toBe(404);
  });
});
