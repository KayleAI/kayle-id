import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/schema/*.ts"],
  out: "../../database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
  schemaFilter: ["public"],
});
