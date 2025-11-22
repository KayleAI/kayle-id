import { env } from "@kayle-id/config/env";
import { Pool } from "pg";

/**
 * Raw PostgreSQL pool.
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export { pool };
