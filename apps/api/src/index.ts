import { env } from "@kayle-id/config/env";
import { Hono } from "hono";
import auth from "./auth";

const app = new Hono();

app.get("/", (c) => {
  console.log(env.DATABASE_URL);
  return c.text("Hello Hono!");
});

app.route("/v1/auth", auth);

export default app;
