import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: 9229 }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    ...(process.env.NODE_ENV === "development"
      ? [
          basicSsl({
            certDir: path.resolve(__dirname, "certificates"),
            name: "localhost",
          }),
        ]
      : []),
  ],
  envPrefix: "PUBLIC_",
  envDir: new URL("../../", import.meta.url).pathname,
});

export default config;
