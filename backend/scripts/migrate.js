
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../src/config/database");

async function migrate() {
  const client = await pool.connect();

  try {
    const directory = path.join(__dirname, "../src/db/migrations");

    const files = fs
      .readdirSync(directory)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    // Create migration tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITHOUT TIME ZONE
          NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    for (const file of files) {
      const result = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );

      if (result.rowCount > 0) {
        console.log(`Skipping ${file} (already applied).`);
        continue;
      }

      const sql = fs.readFileSync(
        path.join(directory, file),
        "utf8"
      );

      try {
        // The SQL migration manages its own transaction.
        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );

        console.log(`Migration ${file} applied successfully.`);
      } catch (error) {
        throw new Error(`Migration ${file} failed: ${error.message}`);
      }
    }

    console.log("All database migrations completed.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
});
