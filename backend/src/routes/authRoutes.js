
const express = require("express");

const router = express.Router();

const {
  login,
  getMe,
  changePassword,
  logout,
} = require("../controllers/authController");

const { requireAuth } = require("../middleware/authMiddleware");

// Login
router.post("/login", login);

// Get current logged-in user
router.get("/me", requireAuth, getMe);
router.patch("/password", requireAuth, changePassword);

// Logout
router.post("/logout", requireAuth, logout);

module.exports = router;
