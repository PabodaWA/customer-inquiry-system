const fs = require("node:fs");
const path = require("node:path");
const pool = require("../src/config/database");

async function migrate() {
  const migrationPath = path.join(__dirname, "../src/db/migrations/001_inquiry_categories.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  try {
    await pool.query(sql);
    console.log("Database migration 001_inquiry_categories applied.");
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
});
