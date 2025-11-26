import { env } from "@kayle-id/config/env";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { magicClient } from "./magic/client";
import type { server } from "./server";

const client = createAuthClient({
  baseURL: env.PUBLIC_AUTH_URL,
  // NOTE: The API uses `/v1/auth`, but we proxy it via `/api/auth` in the web app.
  basePath: "/api/auth",
  plugins: [inferAdditionalFields<typeof server>(), magicClient()],
});

export { client };
