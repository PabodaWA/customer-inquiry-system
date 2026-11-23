const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getStaff,
  createStaff,
  updateStaff,
  setStaffActive,
  getCategories,
  createCategory,
  updateCategory,
} = require("../controllers/adminController");

const router = express.Router();
router.use(requireAuth, authorizeRoles("ADMIN"));

router.get("/staff", getStaff);
router.post("/staff", createStaff);
router.patch("/staff/:id", updateStaff);
router.patch("/staff/:id/status", setStaffActive);
router.get("/categories", getCategories);
router.post("/categories", createCategory);
router.patch("/categories/:id", updateCategory);

module.exports = router;
