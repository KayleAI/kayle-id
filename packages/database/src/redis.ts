import { env } from "@kayle-id/config/env";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: env.REDIS_URL,
  token: env.REDIS_TOKEN,
});

export { redis };
