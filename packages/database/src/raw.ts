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

let poolInstance: Pool | undefined;

const getPool = (): Pool => {
  poolInstance ??= new Pool({
    connectionString: resolveDatabaseConnectionString(env),
    maxUses: 1,
  });

  return poolInstance;
};

/**
 * Raw PostgreSQL pool.
 *
 * Hyperdrive bindings cannot be touched during Worker module evaluation, so the
 * underlying Pool is created lazily on first use.
 */
const pool = new Proxy(Object.create(Pool.prototype) as Pool, {
  get(_target, property) {
    const value = Reflect.get(getPool(), property, getPool());

    return typeof value === "function" ? value.bind(getPool()) : value;
  },
  getPrototypeOf() {
    return Pool.prototype;
  },
});

export { pool, resolveDatabaseConnectionString };
