
const express = require("express");

const router = express.Router();

// Import inquiry controllers
const {
  createInquiry,
  getAllInquiries,
  getInquiryById,
  updateInquiryStatus,
  assignInquiry,
  getInquiryHistory
} = require("../controllers/inquiryController");

// Import authentication middleware
const { requireAuth } = require("../middleware/authMiddleware");

// Protect all inquiry routes
router.use(requireAuth);

// 1. Create new inquiry
router.post("/", createInquiry);

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
