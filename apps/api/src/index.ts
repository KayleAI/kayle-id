import { env } from "@kayle-id/config/env";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  console.log(env.DATABASE_URL);
  return c.text("Hello Hono!");
});

export default app;
