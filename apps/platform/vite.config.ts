import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: 9230 }),
    tailwindcss(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "src", // This is the default
      router: {
        // Specifies the directory TanStack Router uses for your routes.
        routesDirectory: "routes", // Defaults to "routes", relative to srcDirectory
      },
    }),
    viteReact(),
  ],
  envPrefix: ["PUBLIC_", "VITE_"],
  server: {
    port: 3000,
  },
});

export default config;
