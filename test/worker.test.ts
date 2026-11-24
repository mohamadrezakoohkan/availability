import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("GET /health", () => {
  it("answers ok when the database is reachable", async () => {
    const response = await app.request("/health", undefined, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("unknown paths", () => {
  it("answer 404", async () => {
    const response = await app.request("/nothing-here", undefined, env);

    expect(response.status).toBe(404);
  });
});
