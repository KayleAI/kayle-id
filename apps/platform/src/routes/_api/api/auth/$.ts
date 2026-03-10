import { createHmac } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/config/env";

export const Route = createFileRoute("/_api/api/auth/$")({
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

        // If response is a redirect, rewrite the Location header to use the public-facing URL
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("Location");
          if (location) {
            let redirectUrl: string;

            // If the Location header points to the internal API, rewrite it to the public URL
            if (location.startsWith("http://api/v1/auth/")) {
              // Rewrite internal URL to public-facing URL
              const publicPath = location.replace(
                "http://api/v1/auth/",
                "/api/"
              );
              redirectUrl = new URL(publicPath, host).toString();
            } else if (location.startsWith("/v1/auth/")) {
              // Handle relative paths starting with /internal/
              const publicPath = location.replace("/v1/auth/", "/api/v1/auth/");
              redirectUrl = new URL(publicPath, host).toString();
            } else {
              // Already a public URL or relative path - use as-is
              redirectUrl = new URL(location, host).toString();
            }

            // Copy all headers from the original response (including Set-Cookie)
            // but update the Location header with the rewritten URL
            const headers = new Headers(response.headers);
            headers.set("Location", redirectUrl);

            return new Response(null, {
              status: response.status,
              headers,
            });
          }
        }

        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
        });
      },
    },
  },
});
