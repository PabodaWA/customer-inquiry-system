const fs = require("node:fs");
const path = require("node:path");
const pool = require("../src/config/database");

async function migrate() {
  try {
    const directory = path.join(__dirname, "../src/db/migrations");
    const files = fs.readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      await pool.query(fs.readFileSync(path.join(directory, file), "utf8"));
      console.log(`Database migration ${file} applied.`);
    }
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
});
