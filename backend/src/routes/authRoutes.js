
const express = require("express");

const router = express.Router();

const {
  login,
  getMe,
  logout,
} = require("../controllers/authController");

const { requireAuth } = require("../middleware/authMiddleware");

// Login
router.post("/login", login);

// Get current logged-in user
router.get("/me", requireAuth, getMe);

// Logout
router.post("/logout", requireAuth, logout);

module.exports = router;
