import { expect, test } from "bun:test";
import app from "./index";

test("GET /", async () => {
  const response = await app.request("/");
  expect(response.status).toBe(200);
});
