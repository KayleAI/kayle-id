import http from "node:http";
import https from "node:https";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const LOCAL_DEMO_WEBHOOK_BRIDGE_HOST = "127.0.0.1";
const LOCAL_DEMO_WEBHOOK_BRIDGE_PORT = 3001;
const PLATFORM_DEV_ORIGIN = "https://localhost:3000";

function createLocalDemoWebhookBridge(): Plugin {
  let bridgeServer: http.Server | null = null;

  const closeBridgeServer = (): void => {
    bridgeServer?.close();
    bridgeServer = null;
  };

  return {
    apply: "serve",
    name: "local-demo-webhook-bridge",
    configureServer(server) {
      if (bridgeServer) {
        return;
      }

      bridgeServer = http.createServer((request, response) => {
        if (
          !(
            request.method === "POST" &&
            request.url?.startsWith("/api/demo/webhooks/")
          )
        ) {
          response.writeHead(404, {
            "Content-Type": "application/json",
          });
          response.end(
            JSON.stringify({
              data: null,
              error: {
                message: "Demo webhook bridge route not found.",
              },
            })
          );
          return;
        }

        const targetUrl = new URL(request.url, PLATFORM_DEV_ORIGIN);
        const proxyRequest = https.request(
          {
            hostname: targetUrl.hostname,
            headers: request.headers,
            method: request.method,
            path: `${targetUrl.pathname}${targetUrl.search}`,
            port: targetUrl.port,
            rejectUnauthorized: false,
          },
          (proxyResponse) => {
            response.writeHead(proxyResponse.statusCode ?? 502, {
              ...proxyResponse.headers,
            });
            proxyResponse.pipe(response);
          }
        );

        proxyRequest.on("error", (error) => {
          response.writeHead(502, {
            "Content-Type": "application/json",
          });
          response.end(
            JSON.stringify({
              data: null,
              error: {
                message: error.message,
              },
            })
          );
        });

        request.pipe(proxyRequest);
      });

      bridgeServer.listen(
        LOCAL_DEMO_WEBHOOK_BRIDGE_PORT,
        LOCAL_DEMO_WEBHOOK_BRIDGE_HOST
      );
      server.httpServer?.once("close", closeBridgeServer);
    },
    closeBundle() {
      closeBridgeServer();
    },
  };
}

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
    ...(process.env.NODE_ENV === "development"
      ? [
          createLocalDemoWebhookBridge(),
          basicSsl({
            certDir: path.resolve(__dirname, "certificates"),
            name: "localhost",
          }),
        ]
      : []),
  ],
  envPrefix: ["PUBLIC_", "VITE_"],
  server: {
    port: 3000,
  },
});

export default config;
