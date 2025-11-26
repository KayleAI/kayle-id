import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
  path: new URL("./.env", import.meta.url).pathname,
  debug: false,
  // Always prefer the repo's .env for drizzle config, even if DATABASE_URL
  // is set globally in the shell. This keeps local dev & CI predictable.
  override: true,
});

export default defineConfig({
  schema: ["./src/schema/*.ts"],
  out: "../../database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
  schemaFilter: ["public"],
});
