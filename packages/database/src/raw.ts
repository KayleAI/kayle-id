import { env } from "@kayle-id/config/env";
import { Pool } from "pg";

type RuntimeDatabaseEnv = {
  DATABASE_URL?: string;
  HYPERDRIVE?: {
    connectionString?: string;
  };
};

const resolveDatabaseConnectionString = (
  runtimeEnv: RuntimeDatabaseEnv
): string => {
  const hyperdriveConnectionString = runtimeEnv.HYPERDRIVE?.connectionString;

  if (hyperdriveConnectionString) {
    return hyperdriveConnectionString;
  }

  if (runtimeEnv.DATABASE_URL) {
    return runtimeEnv.DATABASE_URL;
  }

  throw new Error(
    "DATABASE_URL or HYPERDRIVE is required to connect to Postgres."
  );
};

/**
 * Raw PostgreSQL pool.
 */
const pool = new Pool({
  connectionString: resolveDatabaseConnectionString(env),
  maxUses: 1,
});

export { pool, resolveDatabaseConnectionString };
