
const pool = require("../config/database");

// ==========================================
// CONSTANTS
// ==========================================

const VALID_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "RESOLVED"
];

const VALID_CATEGORIES = [
  "GENERAL",
  "TECHNICAL",
  "REPAIR",
  "BILLING"
];


// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Get logged-in user
const getCurrentUser = (req) => {
  return req.session?.user;
};


// Validate positive integer ID
const isValidId = (id) => {
  return /^[1-9]\d*$/.test(String(id));
};


// Check inquiry access permissions
const canAccessInquiry = (user, inquiry) => {

  if (user.role === "ADMIN") {
    return true;
  }

  if (user.role === "INTAKE") {
    return Number(inquiry.created_by) === Number(user.id);
  }

  if (user.role === "HANDLER") {
    return Number(inquiry.assigned_to) === Number(user.id);
  }

  return false;
};


// ==========================================
// 1. CREATE NEW INQUIRY
// ==========================================

const createInquiry = async (req, res) => {

  const user = getCurrentUser(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  // Only ADMIN and INTAKE can create inquiries
  if (!["ADMIN", "INTAKE"].includes(user.role)) {
    return res.status(403).json({
      success: false,
      message: "You are not allowed to create inquiries."
    });
  }

  const {
    customer_name,
    contact,
    subject,
    description,
    category = "GENERAL"
  } = req.body;

  // Validate required fields
  if (
    typeof customer_name !== "string" ||
    !customer_name.trim() ||
    typeof contact !== "string" ||
    !contact.trim() ||
    typeof subject !== "string" ||
    !subject.trim() ||
    typeof description !== "string" ||
    !description.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "All required fields must be provided."
    });
  }

  // Validate category
  if (
    typeof category !== "string" ||
    !VALID_CATEGORIES.includes(category)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid inquiry category."
    });
  }

  let client;

  try {

    client = await pool.connect();

    await client.query("BEGIN");

    // Insert inquiry
    const result = await client.query(
      `INSERT INTO inquiries
       (
         customer_name,
         contact,
         subject,
         description,
         category,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        customer_name.trim(),
        contact.trim(),
        subject.trim(),
        description.trim(),
        category,
        user.id
      ]
    );

    const inquiry = result.rows[0];

    // Save inquiry creation history
    await client.query(
      `INSERT INTO inquiry_history
       (
         inquiry_id,
         changed_by,
         action,
         old_value,
         new_value
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        inquiry.id,
        user.id,
        "CREATED",
        null,
        "NEW"
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Inquiry created successfully.",
      data: inquiry
    });

  } catch (error) {

    if (client) {
      await client.query("ROLLBACK");
    }

    console.error("Create Inquiry Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create inquiry."
    });

  } finally {

    client?.release();

  }
};


// ==========================================
// 2. VIEW ALL INQUIRIES
// 3. SEARCH AND FILTER INQUIRIES
// ==========================================

const getAllInquiries = async (req, res) => {

  try {

    const user = getCurrentUser(req);

    const {
      search,
      status,
      category,
      assigned_to
    } = req.query;

    let query = `
      SELECT *
      FROM inquiries
      WHERE 1 = 1
    `;

    const values = [];

    // Apply role-based access
    if (user.role === "INTAKE") {

      values.push(user.id);

      query += `
        AND created_by = $${values.length}
      `;

    } else if (user.role === "HANDLER") {

      values.push(user.id);

      query += `
        AND assigned_to = $${values.length}
      `;

    }

    // Search by customer name, contact or subject
    if (search?.trim()) {

      values.push(`%${search.trim()}%`);

      query += `
        AND (
          customer_name ILIKE $${values.length}
          OR contact ILIKE $${values.length}
          OR subject ILIKE $${values.length}
        )
      `;

    }

    // Filter by status
    if (status) {

      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid inquiry status."
        });
      }

      values.push(status);

      query += `
        AND status = $${values.length}
      `;

    }

    // Filter by category
    if (category) {

      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid inquiry category."
        });
      }

      values.push(category);

      query += `
        AND category = $${values.length}
      `;

    }

    // Filter by assigned staff
    if (assigned_to) {

      if (!isValidId(assigned_to)) {
        return res.status(400).json({
          success: false,
          message: "Invalid staff ID."
        });
      }

      values.push(assigned_to);

      query += `
        AND assigned_to = $${values.length}
      `;

    }

    // Latest inquiries first
    query += `
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {

    console.error("Get All Inquiries Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve inquiries."
    });

  }

};


// ==========================================
// 4. VIEW INQUIRY BY ID
// ==========================================

const getInquiryById = async (req, res) => {

  try {

    const user = getCurrentUser(req);

    const { id } = req.params;

    // Validate inquiry ID
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inquiry ID."
      });
    }

    // Find inquiry
    const result = await pool.query(
      `SELECT *
       FROM inquiries
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found."
      });
    }

    const inquiry = result.rows[0];

    // Check access permission
    if (!canAccessInquiry(user, inquiry)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view this inquiry."
      });
    }

    return res.status(200).json({
      success: true,
      data: inquiry
    });

  } catch (error) {

    console.error("Get Inquiry Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve inquiry."
    });

  }

};


// ==========================================
// 5. UPDATE INQUIRY STATUS
// ==========================================

const updateInquiryStatus = async (req, res) => {

  const user = getCurrentUser(req);

  const { id } = req.params;

  const { status } = req.body;

  // Only ADMIN and HANDLER can update status
  if (!["ADMIN", "HANDLER"].includes(user.role)) {
    return res.status(403).json({
      success: false,
      message: "You cannot update inquiry status."
    });
  }

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid inquiry ID."
    });
  }

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid inquiry status."
    });
  }

  let client;

  try {

    client = await pool.connect();

    await client.query("BEGIN");

    // Lock inquiry row
    const result = await client.query(
      `SELECT *
       FROM inquiries
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (result.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Inquiry not found."
      });

    }

    const inquiry = result.rows[0];

    // Check permission
    if (!canAccessInquiry(user, inquiry)) {

      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "You cannot update this inquiry."
      });

    }

    const oldStatus = inquiry.status;

    // Allowed status transitions
    const allowedTransitions = {
      NEW: ["IN_PROGRESS"],
      IN_PROGRESS: ["RESOLVED"],
      RESOLVED: ["IN_PROGRESS"]
    };

    // Check same status
    if (oldStatus === status) {

      await client.query("ROLLBACK");

      return res.status(200).json({
        success: true,
        message: "Inquiry already has this status.",
        data: inquiry
      });

    }

    // Validate status transition
    if (!allowedTransitions[oldStatus]?.includes(status)) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${oldStatus} to ${status}.`
      });

    }

    // Update inquiry
    const updated = await client.query(
      `UPDATE inquiries
       SET status = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    // Record status history
    await client.query(
      `INSERT INTO inquiry_history
       (
         inquiry_id,
         changed_by,
         action,
         old_value,
         new_value
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        user.id,
        "STATUS_CHANGED",
        oldStatus,
        status
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Inquiry status updated successfully.",
      data: updated.rows[0]
    });

  } catch (error) {

    if (client) {
      await client.query("ROLLBACK");
    }

    console.error("Update Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update inquiry status."
    });

  } finally {

    client?.release();

  }

};


// ==========================================
// 6. ASSIGN INQUIRY TO STAFF
// ==========================================

const assignInquiry = async (req, res) => {

  const user = getCurrentUser(req);

  const { id } = req.params;

  const { assigned_to } = req.body;

  // Only ADMIN and INTAKE can assign inquiries
  if (!["ADMIN", "INTAKE"].includes(user.role)) {
    return res.status(403).json({
      success: false,
      message: "You are not allowed to assign inquiries."
    });
  }

  if (
    !isValidId(id) ||
    !isValidId(assigned_to)
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid inquiry ID and staff ID are required."
    });
  }

  let client;

  try {

    client = await pool.connect();

    await client.query("BEGIN");

    // Find and lock inquiry
    const inquiryResult = await client.query(
      `SELECT *
       FROM inquiries
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (inquiryResult.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Inquiry not found."
      });

    }

    const inquiry = inquiryResult.rows[0];

    // Check permission
    if (!canAccessInquiry(user, inquiry)) {

      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "You cannot assign this inquiry."
      });

    }

    // Check whether selected staff is an active HANDLER
    const staffResult = await client.query(
      `SELECT id
       FROM users
       WHERE id = $1
       AND role = 'HANDLER'
       AND is_active = TRUE`,
      [assigned_to]
    );

    if (staffResult.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Active handler not found."
      });

    }

    const oldStaff = inquiry.assigned_to;

    // Check existing assignment
    if (Number(oldStaff) === Number(assigned_to)) {

      await client.query("ROLLBACK");

      return res.status(200).json({
        success: true,
        message: "This staff member is already assigned.",
        data: inquiry
      });

    }

    // Update assignment
    const updated = await client.query(
      `UPDATE inquiries
       SET assigned_to = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [assigned_to, id]
    );

    // Record assignment history
    await client.query(
      `INSERT INTO inquiry_history
       (
         inquiry_id,
         changed_by,
         action,
         old_value,
         new_value
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        user.id,
        "ASSIGNED",
        oldStaff === null ? null : String(oldStaff),
        String(assigned_to)
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Inquiry assigned successfully.",
      data: updated.rows[0]
    });

  } catch (error) {

    if (client) {
      await client.query("ROLLBACK");
    }

    console.error("Assign Inquiry Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to assign inquiry."
    });

  } finally {

    client?.release();

  }

};


// ==========================================
// 7. VIEW INQUIRY HISTORY
// ==========================================

const getInquiryHistory = async (req, res) => {

  try {

    const user = getCurrentUser(req);

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inquiry ID."
      });
    }

    // Find inquiry
    const inquiryResult = await pool.query(
      `SELECT *
       FROM inquiries
       WHERE id = $1`,
      [id]
    );

    if (inquiryResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found."
      });
    }

    const inquiry = inquiryResult.rows[0];

    // Check access permission
    if (!canAccessInquiry(user, inquiry)) {
      return res.status(403).json({
        success: false,
        message: "You cannot view this inquiry history."
      });
    }

    // Get inquiry history with staff name
    const historyResult = await pool.query(
      `SELECT
         h.*,
         u.full_name AS changed_by_name
       FROM inquiry_history h
       JOIN users u
         ON h.changed_by = u.id
       WHERE h.inquiry_id = $1
       ORDER BY h.created_at DESC`,
      [id]
    );

    return res.status(200).json({
      success: true,
      count: historyResult.rows.length,
      data: historyResult.rows
    });

  } catch (error) {

    console.error("Get Inquiry History Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve inquiry history."
    });

  }

};


// ==========================================
// EXPORT ALL CONTROLLERS
// ==========================================

module.exports = {
  createInquiry,
  getAllInquiries,
  getInquiryById,
  updateInquiryStatus,
  assignInquiry,
  getInquiryHistory
};
