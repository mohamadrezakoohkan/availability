import { Hono } from "hono";
import { usernameRoutes } from "./username/routes";

const app = new Hono<{ Bindings: Env }>();

// Liveness check for deploys and monitoring. It reads a real table, so a
// missing binding or an unmigrated database fails the request instead of
// passing unnoticed.
app.get("/health", async (c) => {
  await c.env.DB.prepare("SELECT 1 FROM users LIMIT 1").first();
  return c.json({ status: "ok" });
});

app.route("/", usernameRoutes);

export default app;
