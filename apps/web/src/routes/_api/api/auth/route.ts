import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_api/api/auth")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const url = new URL(request.url);

        console.log(url.pathname?.replace("/api/auth/", ""));

        const response = await env.API.fetch(
          `http://internal/v1/auth/${url.pathname?.replace("/api/auth/", "")}`,
          {
            method: request.method,
            headers: request.headers,
            body: request.body || undefined,
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
