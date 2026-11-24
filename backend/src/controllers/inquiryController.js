
const pool = require("../config/database");
const { assignInquiryAutomatically } = require("../services/assignmentService");
const { getInquiryScope, canAccessInquiry } = require("../services/inquiryAccess");

// ==========================================
// CONSTANTS
// ==========================================

const VALID_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "RESOLVED"
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

  // Inquiry registration belongs to intake staff.
  if (user.role !== "INTAKE") {
    return res.status(403).json({
      success: false,
      message: "You are not allowed to create inquiries."
    });
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "assigned_to")) {
    return res.status(400).json({ success: false, message: "Handler assignment is managed automatically and cannot be provided." });
  }

  const {
    customer_name,
    contact,
    subject,
    description,
    category = "GENERAL"
  } = req.body;
  const categoryName = typeof category === "string" ? category.trim().toUpperCase().replace(/\s+/g, "_") : "";
  const contactDigits = typeof contact === "string" ? contact.replace(/\D/g, "") : "";

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

  if (
    customer_name.trim().length > 120 ||
    subject.trim().length > 160 ||
    description.trim().length > 5000 ||
    !/^\+?[\d\s().-]{7,24}$/.test(contact.trim()) ||
    contactDigits.length < 7 || contactDigits.length > 15
  ) {
    return res.status(400).json({ success: false, message: "Check the customer name, contact number, subject, and description lengths and formats." });
  }

  if (!categoryName) {
    return res.status(400).json({
      success: false,
      message: "Invalid inquiry category."
    });
  }

  let client;

  try {

    client = await pool.connect();

    await client.query("BEGIN");

    const categoryResult = await client.query(
      "SELECT id FROM inquiry_categories WHERE name = $1 AND is_active = TRUE",
      [categoryName]
    );
    if (!categoryResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Select an active inquiry category." });
    }

    // Insert unassigned first. The assignment service runs in this transaction.
    const result = await client.query(
      `INSERT INTO inquiries
       (
         customer_name,
         contact,
         subject,
         description,
         category,
         created_by,
         status,
         assignment_status,
         handler_response_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'NEW', 'PENDING', 'NOT_REQUIRED')
       RETURNING *`,
      [
        customer_name.trim(),
        contact.trim(),
        subject.trim(),
        description.trim(),
        categoryName,
        user.id
      ]
    );

    let inquiry = result.rows[0];

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

    const assignment = await assignInquiryAutomatically(client, categoryName);
    if (assignment.handler) {
      const assignedResult = await client.query(
        `UPDATE inquiries
         SET assigned_to = $1,
             assignment_status = 'ASSIGNED',
             handler_response_status = 'WAITING',
             status = 'NEW',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [assignment.handler.id, inquiry.id]
      );
      inquiry = assignedResult.rows[0];

      await client.query(
        `INSERT INTO inquiry_history (inquiry_id, changed_by, action, old_value, new_value)
         VALUES ($1, $2, 'ASSIGNED', NULL, $3)`,
        [inquiry.id, user.id, String(assignment.handler.id)]
      );
      await client.query(
        `INSERT INTO inquiry_assignments (inquiry_id, handler_id, assigned_by, status)
         VALUES ($1, $2, $3, 'PENDING_ACCEPTANCE')`,
        [inquiry.id, assignment.handler.id, user.id]
      );
      await client.query(
        `INSERT INTO user_notifications (user_id, inquiry_id, kind, message)
         VALUES ($1, $2, 'NEW_ASSIGNMENT', $3)`,
        [assignment.handler.id, inquiry.id, `Inquiry CN-${String(inquiry.id).padStart(4, "0")} has been assigned to you.`]
      );
    }

    const detailedResult = await client.query(
      `SELECT i.*, assigned.full_name AS assigned_staff_name
       FROM inquiries i
       LEFT JOIN users assigned ON assigned.id = i.assigned_to
       WHERE i.id = $1`,
      [inquiry.id]
    );
    inquiry = detailedResult.rows[0];

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: assignment.handler
        ? `Inquiry created successfully and assigned to ${assignment.handler.full_name}.`
        : "Inquiry created successfully. No eligible handler is currently available; assignment is pending.",
      data: inquiry,
      assignment: {
        status: inquiry.assignment_status,
        handler: assignment.handler ? { id: assignment.handler.id, full_name: assignment.handler.full_name } : null,
      },
    });

  } catch (error) {

    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original transaction error. */ }
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
    const { search, status, category, assigned_to, assignment, date_from, date_to, page, pageSize } = req.query;
    if ([search, status, category, assigned_to, assignment, date_from, date_to, page, pageSize].some((value) => value !== undefined && typeof value !== "string")) {
      return res.status(400).json({ success: false, message: "Invalid inquiry filters." });
    }
    const normalizedStatus = status ? String(status).toUpperCase() : "";
    const normalizedCategory = category ? String(category).trim().toUpperCase() : "";
    const normalizedAssignment = assignment ? String(assignment).toUpperCase() : "ALL";
    if (search && search.length > 200) return res.status(400).json({ success: false, message: "Search text must be 200 characters or fewer." });
    if (normalizedCategory.length > 40) return res.status(400).json({ success: false, message: "Invalid inquiry category." });
    if (normalizedStatus && !VALID_STATUSES.includes(normalizedStatus)) return res.status(400).json({ success: false, message: "Invalid inquiry status." });
    if (normalizedAssignment && !["ALL", "ASSIGNED", "UNASSIGNED"].includes(normalizedAssignment)) return res.status(400).json({ success: false, message: "Invalid assignment filter." });
    if (assigned_to && !isValidId(assigned_to)) return res.status(400).json({ success: false, message: "Invalid staff ID." });
    const validDate = (value) => {
      if (!value) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!validDate(date_from) || !validDate(date_to) || (date_from && date_to && date_from > date_to)) return res.status(400).json({ success: false, message: "Invalid inquiry date range." });

    const paginated = page !== undefined || pageSize !== undefined;
    const pageNumber = page === undefined ? 1 : Number(page);
    const limit = pageSize === undefined ? 10 : Number(pageSize);
    if (paginated && (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 100000 || ![10, 25, 50].includes(limit))) return res.status(400).json({ success: false, message: "Page must be between 1 and 100000 and pageSize must be 10, 25, or 50." });

    if (normalizedCategory) {
      const categoryResult = await pool.query("SELECT 1 FROM inquiry_categories WHERE name = $1", [normalizedCategory]);
      if (!categoryResult.rows.length) return res.status(400).json({ success: false, message: "Invalid inquiry category." });
    }

    const inquiryScope = getInquiryScope(user);
    if (!inquiryScope) return res.status(403).json({ success: false, message: "You cannot access inquiries." });
    const scopeSql = inquiryScope.clause ? ` AND ${inquiryScope.clause}` : "";
    const clauses = inquiryScope.clause ? [inquiryScope.clause] : [];
    const values = [...inquiryScope.values];
    const addClause = (sql, value) => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };

    if (search?.trim()) {
      const term = `%${String(search).trim()}%`;
      values.push(term);
      const p = `$${values.length}`;
      clauses.push(`(i.customer_name ILIKE ${p} OR i.contact ILIKE ${p} OR i.subject ILIKE ${p} OR assigned.full_name ILIKE ${p} OR i.id::text ILIKE ${p} OR ('CN-' || LPAD(i.id::text, 4, '0')) ILIKE ${p})`);
    }
    if (normalizedStatus) addClause("i.status = ?", normalizedStatus);
    if (normalizedCategory) addClause("i.category = ?", normalizedCategory);
    if (assigned_to) addClause("i.assigned_to = ?", assigned_to);
    if (normalizedAssignment === "ASSIGNED") clauses.push("i.assigned_to IS NOT NULL");
    if (normalizedAssignment === "UNASSIGNED") clauses.push("i.assigned_to IS NULL");
    if (date_from) addClause("i.created_at >= ?::date", date_from);
    if (date_to) addClause("i.created_at < (?::date + INTERVAL '1 day')", date_to);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM inquiries i LEFT JOIN users assigned ON assigned.id = i.assigned_to ${where}`,
      values
    );
    const count = countResult.rows[0].count;
    const listValues = [...values];
    let paginationSql = "";
    if (paginated) {
      listValues.push(limit, (pageNumber - 1) * limit);
      paginationSql = `LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`;
    }
    const result = await pool.query(
      `SELECT i.*, assigned.full_name AS assigned_staff_name
       FROM inquiries i LEFT JOIN users assigned ON assigned.id = i.assigned_to
       ${where} ORDER BY i.created_at DESC, i.id DESC ${paginationSql}`,
      listValues
    );
    const statsResult = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE i.status = 'NEW')::int AS new_count,
              COUNT(*) FILTER (WHERE i.status = 'IN_PROGRESS')::int AS in_progress,
              COUNT(*) FILTER (WHERE i.status = 'RESOLVED')::int AS resolved
       FROM inquiries i WHERE TRUE ${scopeSql}`,
      inquiryScope.values
    );
    return res.status(200).json({
      success: true,
      count,
      data: result.rows,
      stats: statsResult.rows[0],
      ...(paginated ? { pagination: { page: pageNumber, pageSize: limit, total: count, totalPages: Math.ceil(count / limit) } } : {})
    });

  } catch (error) {

    console.error("Get All Inquiries Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve inquiries."
    });

  }

};

const getInquiryCategories = async (_req, res) => {
  try {
    const result = await pool.query("SELECT name, is_active FROM inquiry_categories ORDER BY name");
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error("Get Inquiry Categories Error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve inquiry categories." });
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
      `SELECT i.*, assigned.full_name AS assigned_staff_name, creator.full_name AS created_by_name
       FROM inquiries i
       LEFT JOIN users assigned ON assigned.id = i.assigned_to
       LEFT JOIN users creator ON creator.id = i.created_by
       WHERE i.id = $1`,
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

  // Admins review status but do not change it; status changes happen through handler workflow actions.
  if (user.role === "ADMIN") {
    return res.status(403).json({ success: false, message: "Admins can view inquiry status but cannot change it." });
  }

  if (user.role !== "HANDLER") {
    return res.status(403).json({
      success: false,
      message: "You cannot update inquiry status."
    });
  }

  if (user.role === "HANDLER") {
    return res.status(403).json({ success: false, message: "Use the handler workflow actions to update this inquiry." });
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
  if (user.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "You are not allowed to assign inquiries." });
  }
  return res.status(403).json({
    success: false,
    message: "Only declined inquiries can be reassigned through the Declined inquiries queue."
  });
};

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


const getRecentInquiryActivity = async (req, res) => {
  const user = getCurrentUser(req);
  const inquiryScope = getInquiryScope(user);
  if (!inquiryScope) return res.status(403).json({ success: false, message: "You cannot access inquiry activity." });
  const rawLimit = req.query.limit === undefined ? "8" : req.query.limit;
  if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 20) {
    return res.status(400).json({ success: false, message: "Activity limit must be between 1 and 20." });
  }
  const values = [...inquiryScope.values, Number(rawLimit)];
  const scope = inquiryScope.clause ? `AND ${inquiryScope.clause}` : "";
  const limitParameter = `$${values.length}`;
  try {
    const result = await pool.query(
      `SELECT h.id, h.inquiry_id, h.action, h.old_value, h.new_value, h.created_at,
              i.customer_name, i.assigned_to, assigned.full_name AS assigned_staff_name,
              actor.full_name AS changed_by_name
       FROM inquiry_history h
       JOIN inquiries i ON i.id = h.inquiry_id
       LEFT JOIN users assigned ON assigned.id = i.assigned_to
       LEFT JOIN users actor ON actor.id = h.changed_by
       WHERE TRUE ${scope}
       ORDER BY h.created_at DESC, h.id DESC
       LIMIT ${limitParameter}`,
      values
    );
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error("Get Recent Inquiry Activity Error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve inquiry activity." });
  }
};

// ==========================================
// EXPORT ALL CONTROLLERS
// ==========================================

module.exports = {
  createInquiry,
  getAllInquiries,
  getInquiryCategories,
  getInquiryById,
  updateInquiryStatus,
  assignInquiry,
  getInquiryHistory,
  getRecentInquiryActivity
};
