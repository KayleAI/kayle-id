import { env } from "@kayle-id/config/env";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { server } from "./server";

const client = createAuthClient({
  baseURL: env.PUBLIC_BETTER_AUTH_URL,
  basePath: "/v1/auth",
  plugins: [inferAdditionalFields<typeof server>()],
});

export { client };
