
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL error:", error);
});

module.exports = pool;

//Pool -Manages database connections
//process.env	- Reads configuration from .env
//new Pool()	- Creates PostgreSQL connection pool
//module.exports	- Shares connection with other backend files