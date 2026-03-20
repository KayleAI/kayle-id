import { createHmac } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/config/env";

export const Route = createFileRoute("/_api/api/webhooks/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const host =
          process.env.NODE_ENV === "production"
            ? "https://kayle.id"
            : "https://localhost:3000";
        const url = new URL(request.url, host);
        const cf = JSON.stringify(request.cf);
        const cfSignature = createHmac("sha256", env.KAYLE_INTERNAL_TOKEN)
          .update(cf)
          .digest("hex");

        const targetPath = `v1/${url.pathname?.replace("/api/", "")}`
          .replace(/\/+$/g, "")
          .replace(/\/\/+/g, "/");

        const response = await env.API.fetch(
          `http://api/${targetPath}${url.search}`,
          {
            credentials: "include",
            method: request.method,
            headers: (() => {
              const headers = new Headers(request.headers);
              if (cf) {
                headers.set("x-cf-geolocation", btoa(cf));
                headers.set("x-cf-signature", cfSignature);
              }

              const clientIp =
                request.headers.get("cf-connecting-ip") ||
                request.headers.get("x-real-ip") ||
                request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

              if (clientIp) {
                headers.set("x-forwarded-client-ip", clientIp);
              }

              return headers;
            })(),
            body: request.body ?? undefined,
            redirect: "manual",
          }
        );

        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
        });
      },
    },
  },
});
