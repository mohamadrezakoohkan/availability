# Routes

- One Hono sub-app per feature, in `src/<feature>/routes.ts`, mounted in `src/index.ts` with `app.route("/", featureRoutes)`. Routes carry their full path (`/api/v1/usernames/:username`), so `index.ts` shows no prefix logic.
- JSON API paths start with `/api/v1/`. Each format has its own URL; never branch on the `Accept` header (invariants.md, "URLs and caching").
- A response that must not be cached sets `Cache-Control: no-store` itself. Only the three default-window public responses are cached (invariants.md).
- A route reads the clock once (`Date.now()`) and passes it down. Logic below the route takes `now` as an argument.
- Business logic lives next to the routes in plain functions that take `db` and values (`checkUsername(db, input, now)`), so tests call them without HTTP. Route tests go through `app.request(path, init, env)` and check status, body and headers.
- A name reserved for a route of this app goes in `BUILT_IN_RESERVED` in `src/username/rules.ts` when the route is added.
