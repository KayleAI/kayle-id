import { env } from "@kayle-id/config/env";
import { Redis } from "@upstash/redis";

const redis =
  process.env.NODE_ENV === "test"
    ? // TODO: Use a mock Redis for testing
      (null as unknown as Redis)
    : new Redis({
        url: env.REDIS_URL,
        token: env.REDIS_TOKEN,
      });

export { redis };
