
const express = require("express");

const router = express.Router();

// Import inquiry controllers
const {
  createInquiry,
  getAllInquiries,
  getInquiryCategories,
  getRecentInquiryActivity,
  getInquiryById,
  updateInquiryStatus,
  assignInquiry,
  getInquiryHistory
} = require("../controllers/inquiryController");

// Import authentication middleware
const { requireAuth } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/authMiddleware");
const { getDashboard, getMyDeclinedInquiries, acceptInquiry, declineInquiry, resolveInquiry, getAssignmentHistory } = require("../controllers/handlerController");

// Protect all inquiry routes
router.use(requireAuth);

// 1. Create new inquiry
router.post("/", createInquiry);

// 2. Read-only category options for authenticated inquiry forms and filters
router.get("/categories", getInquiryCategories);
router.get("/activity", getRecentInquiryActivity);
router.get("/handler-dashboard", authorizeRoles("HANDLER"), getDashboard);
router.get("/handler-dashboard/declined", authorizeRoles("HANDLER"), getMyDeclinedInquiries);
router.get("/:id/assignments", getAssignmentHistory);
router.post("/:id/accept", authorizeRoles("HANDLER"), acceptInquiry);
router.post("/:id/decline", authorizeRoles("HANDLER"), declineInquiry);
router.post("/:id/resolve", authorizeRoles("HANDLER"), resolveInquiry);

// 2. View all inquiries + Search + Filter
router.get("/", getAllInquiries);

// 3. View inquiry history
router.get("/:id/history", getInquiryHistory);

// 4. Update inquiry status
router.patch("/:id/status", updateInquiryStatus);

// 5. Assign inquiry to staff
router.patch("/:id/assign", assignInquiry);

// 6. View inquiry by ID
router.get("/:id", getInquiryById);

module.exports = router;
