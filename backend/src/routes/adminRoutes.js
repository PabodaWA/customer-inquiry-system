const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getStaff,
  createStaff,
  updateStaff,
  resetStaffPassword,
  deleteStaff,
  setStaffActive,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/adminController");
const { getDeclinedAssignments, getActiveHandlers, updateDeclinedCategory, reassignDeclinedInquiry } = require("../controllers/reassignmentController");

const router = express.Router();
router.use(requireAuth, authorizeRoles("ADMIN"));

router.get("/staff", getStaff);
router.post("/staff", createStaff);
router.patch("/staff/:id", updateStaff);
router.post("/staff/:id/reset-password", resetStaffPassword);
router.delete("/staff/:id", deleteStaff);
router.patch("/staff/:id/status", setStaffActive);
router.get("/categories", getCategories);
router.post("/categories", createCategory);
router.patch("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);
router.get("/reassignment-requests", getDeclinedAssignments);
router.get("/active-handlers", getActiveHandlers);
router.patch("/reassignment-requests/:id/category", updateDeclinedCategory);
router.post("/reassignment-requests/:id/reassign", reassignDeclinedInquiry);

module.exports = router;
