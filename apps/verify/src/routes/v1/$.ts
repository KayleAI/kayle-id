import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/config/env.server";

export const Route = createFileRoute("/v1/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const host =
          process.env.NODE_ENV === "production"
            ? "https://verify.kayle.id"
            : "https://localhost:2999";
        const url = new URL(request.url, host);

        const response = await env.API.fetch(
          `http://api/${url.pathname}${url.search}`.replaceAll("//", "/"),
          {
            credentials: "include",
            method: request.method,
            headers: (() => {
              const headers = new Headers(request.headers);

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
