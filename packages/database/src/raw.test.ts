import { expect, test } from "bun:test";
import { resolveDatabaseConnectionString } from "./raw";

test("prefers Hyperdrive when a binding is available", () => {
  expect(
    resolveDatabaseConnectionString({
      DATABASE_URL: "postgres://direct.example/kayle-id",
      HYPERDRIVE: {
        connectionString: "postgres://hyperdrive.example/kayle-id",
      },
    })
  ).toBe("postgres://hyperdrive.example/kayle-id");
});

test("falls back to DATABASE_URL outside the worker runtime", () => {
  expect(
    resolveDatabaseConnectionString({
      DATABASE_URL: "postgres://direct.example/kayle-id",
    })
  ).toBe("postgres://direct.example/kayle-id");
});

test("throws when neither Hyperdrive nor DATABASE_URL is configured", () => {
  expect(() => resolveDatabaseConnectionString({})).toThrow(
    "DATABASE_URL or HYPERDRIVE is required to connect to Postgres."
  );
});
