import { file } from "bun";
import { pool } from "./raw";

async function main() {
  const seedFile = file(new URL("../../../database/seed.sql", import.meta.url));
  const sql = await seedFile.text();

  if (!sql.trim()) {
    console.log("`seed.sql` is empty, nothing to seed.");
    return;
  }

  const client = await pool.connect();

  try {
    await client.query(sql);
    console.log("Database seeded successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to seed database:", error);
  process.exit(1);
});
