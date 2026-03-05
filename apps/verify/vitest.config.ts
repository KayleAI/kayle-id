import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@api/shared": fileURLToPath(
        new URL("../api/src/shared", import.meta.url)
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
