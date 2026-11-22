
const pool = require("../config/database");
const bcrypt = require("bcryptjs");

const seedUsers = async () => {
  try {
   
const users = [
  {
    fullName: "System Admin",
    email: "admin@example.com",
    password: "Admin@123",
    role: "ADMIN",
    specialization: null,
  },
  {
    fullName: "Intake Staff",
    email: "intake@example.com",
    password: "Intake@123",
    role: "INTAKE",
    specialization: null,
  },
  {
    fullName: "General Handler",
    email: "handler@example.com",
    password: "Handler@123",
    role: "HANDLER",
    specialization: "GENERAL",
  },
  {
    fullName: "Technical Handler",
    email: "technical@example.com",
    password: "Technical@123",
    role: "HANDLER",
    specialization: "TECHNICAL",
  },
  {
    fullName: "Repair Handler",
    email: "repair@example.com",
    password: "Repair@123",
    role: "HANDLER",
    specialization: "REPAIR",
  },
  {
    fullName: "Billing Handler",
    email: "billing@example.com",
    password: "Billing@123",
    role: "HANDLER",
    specialization: "BILLING",
  },
];


    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 12);

     await pool.query(
  `INSERT INTO users
    (full_name, email, password_hash, role, specialization, is_active)
   VALUES ($1, $2, $3, $4, $5, true)
   ON CONFLICT (email) DO NOTHING`,
  [
    user.fullName,
    user.email,
    passwordHash,
    user.role,
    user.specialization,
  ]
);
    }

    console.log("Test staff accounts created successfully!");
  } catch (error) {
    console.error("Seeding error:", error);
  } finally {
    await pool.end();
  }
};

seedUsers();
