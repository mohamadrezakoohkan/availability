import { Hono } from "hono";
import { checkUsername } from "./availability";

export const usernameRoutes = new Hono<{ Bindings: Env }>();

// Live "is this name free" hint for the sign-up form (SPEC.md §3.1). It is a
// custom API call, so it is never cached (§5).
usernameRoutes.get("/api/v1/usernames/:username", async (c) => {
  const result = await checkUsername(c.env.DB, c.req.param("username"), Date.now());
  c.header("Cache-Control", "no-store");
  return c.json(result);
});
