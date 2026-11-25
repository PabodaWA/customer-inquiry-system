const pool = require("../config/database");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const STAFF_ROLES = ["INTAKE", "HANDLER"];
const isValidId = (value) => /^[1-9]\d*$/.test(String(value));
const isValidEmail = (value) => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function normalizeCategory(value) {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
}

async function getStaff(req, res) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.specialization, u.is_active, u.created_at,
              COUNT(i.id)::int AS assigned_inquiry_count
       FROM users u
       LEFT JOIN inquiries i ON i.assigned_to = u.id
       WHERE u.role IN ('INTAKE', 'HANDLER')
       GROUP BY u.id
       ORDER BY u.role, u.full_name`
    );
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error("Get Staff Error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve staff." });
  }
}

async function createStaff(req, res) {
  const { full_name, email, role, specialization } = req.body;
  const cleanName = typeof full_name === "string" ? full_name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const cleanSpecialization = role === "HANDLER" ? normalizeCategory(specialization) : null;

  if (!cleanName || cleanName.length > 120 || !isValidEmail(cleanEmail)) {
    return res.status(400).json({ success: false, message: "Provide a valid staff name and email address." });
  }
  if (!STAFF_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: "Staff role must be INTAKE or HANDLER." });
  }
  try {
    const existing = await pool.query("SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1", [cleanEmail]);
    if (existing.rows.length) return res.status(409).json({ success: false, message: "An account with this email already exists." });
    if (role === "HANDLER") {
      const category = await pool.query("SELECT 1 FROM inquiry_categories WHERE name = $1 AND is_active = TRUE", [cleanSpecialization]);
      if (!category.rows.length) return res.status(400).json({ success: false, message: "Select an active inquiry category for this handler." });
    }
    const temporaryPassword = crypto.randomBytes(18).toString("base64url");
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, specialization, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, full_name, email, role, specialization, is_active, created_at`,
      [cleanName, cleanEmail, passwordHash, role, cleanSpecialization]
    );
    return res.status(201).json({ success: true, message: "Staff member created.", data: { ...result.rows[0], assigned_inquiry_count: 0 }, temporary_password: temporaryPassword });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "A staff account with this email already exists." });
    console.error("Create Staff Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create staff member." });
  }
}

async function updateStaff(req, res) {
  const { id } = req.params;
  const { full_name, email, specialization } = req.body;
  if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid staff ID." });
  const cleanName = typeof full_name === "string" ? full_name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanName || cleanName.length > 120 || !isValidEmail(cleanEmail)) return res.status(400).json({ success: false, message: "Provide a valid staff name and email address." });

  try {
    const staff = await pool.query("SELECT role FROM users WHERE id = $1 AND role IN ('INTAKE', 'HANDLER')", [id]);
    if (!staff.rows.length) return res.status(404).json({ success: false, message: "Staff member not found." });
    const duplicate = await pool.query("SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1", [cleanEmail, id]);
    if (duplicate.rows.length) return res.status(409).json({ success: false, message: "An account with this email already exists." });
    const role = staff.rows[0].role;
    const cleanSpecialization = role === "HANDLER" ? normalizeCategory(specialization) : null;
    if (role === "HANDLER") {
      const category = await pool.query("SELECT 1 FROM inquiry_categories WHERE name = $1", [cleanSpecialization]);
      if (!category.rows.length) return res.status(400).json({ success: false, message: "Select a valid inquiry category for this handler." });
    }
    const result = await pool.query(
      `UPDATE users SET full_name = $1, email = $2, specialization = $3
       WHERE id = $4 AND role IN ('INTAKE', 'HANDLER')
       RETURNING id, full_name, email, role, specialization, is_active, created_at`,
      [cleanName, cleanEmail, cleanSpecialization, id]
    );
    return res.status(200).json({ success: true, message: "Staff member updated.", data: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "A staff account with this email already exists." });
    console.error("Update Staff Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update staff member." });
  }
}

async function resetStaffPassword(req, res) {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid staff ID." });
  try {
    const temporaryPassword = crypto.randomBytes(18).toString("base64url");
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const result = await pool.query(
      `UPDATE users SET password_hash = $1
       WHERE id = $2 AND role IN ('INTAKE', 'HANDLER')
       RETURNING id, full_name`,
      [passwordHash, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Staff member not found." });
    await pool.query("DELETE FROM user_sessions WHERE sess::jsonb->'user'->>'id' = $1", [String(id)]);
    return res.status(200).json({ success: true, message: "Temporary password generated.", data: result.rows[0], temporary_password: temporaryPassword });
  } catch (error) {
    console.error("Reset Staff Password Error:", error);
    return res.status(500).json({ success: false, message: "Failed to reset the staff password." });
  }
}

async function deleteStaff(req, res) {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid staff ID." });
  try {
    const staff = await pool.query("SELECT id, full_name, is_active FROM users WHERE id=$1 AND role IN ('INTAKE','HANDLER')", [id]);
    if (!staff.rows.length) return res.status(404).json({ success: false, message: "Staff member not found." });
    if (staff.rows[0].is_active) {
      return res.status(409).json({ success: false, message: "Deactivate this account before deleting it." });
    }
    const references = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM inquiries WHERE assigned_to=$1 OR created_by=$1) +
         (SELECT COUNT(*) FROM inquiry_assignments WHERE handler_id=$1 OR assigned_by=$1) +
         (SELECT COUNT(*) FROM inquiry_history WHERE changed_by=$1) AS count`,
      [id]
    );
    if (Number(references.rows[0].count) > 0) {
      return res.status(409).json({ success: false, message: "This account is linked to inquiry records. Deactivate it instead to preserve the inquiry history." });
    }
    const deleted = await pool.query(
      "DELETE FROM users WHERE id=$1 AND role IN ('INTAKE','HANDLER') AND is_active=FALSE RETURNING id",
      [id]
    );
    if (!deleted.rows.length) {
      return res.status(409).json({ success: false, message: "Deactivate this account before deleting it." });
    }
    await pool.query("UPDATE assignment_state SET last_assigned_handler_id=NULL WHERE last_assigned_handler_id=$1", [id]);
    await pool.query("DELETE FROM user_sessions WHERE sess::jsonb->'user'->>'id' = $1", [String(id)]);
    return res.status(200).json({ success: true, message: `${staff.rows[0].full_name} was deleted.` });
  } catch (error) {
    if (error.code === "23503") return res.status(409).json({ success: false, message: "This account is linked to inquiry records. Deactivate it instead to preserve the inquiry history." });
    console.error("Delete Staff Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete staff member." });
  }
}

async function setStaffActive(req, res) {
  const { id } = req.params;
  const { is_active } = req.body;
  if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid staff ID." });
  if (typeof is_active !== "boolean") return res.status(400).json({ success: false, message: "is_active must be a boolean." });
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = $1 WHERE id = $2 AND role IN ('INTAKE', 'HANDLER')
       RETURNING id, full_name, email, role, specialization, is_active, created_at`,
      [is_active, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Staff member not found." });
    if (!is_active) {
      await pool.query("DELETE FROM user_sessions WHERE sess::jsonb->'user'->>'id' = $1", [String(id)]);
    }
    return res.status(200).json({ success: true, message: `Staff member ${is_active ? "activated" : "deactivated"}.`, data: result.rows[0] });
  } catch (error) {
    console.error("Update Staff Status Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update staff status." });
  }
}

async function getCategories(req, res) {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.is_active, c.created_at, c.updated_at, COUNT(i.id)::int AS inquiry_count
       FROM inquiry_categories c
       LEFT JOIN inquiries i ON i.category = c.name
       GROUP BY c.id
       ORDER BY c.name`
    );
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error("Get Categories Error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve categories." });
  }
}

async function createCategory(req, res) {
  const name = normalizeCategory(req.body.name);
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(name)) return res.status(400).json({ success: false, message: "Use 2–40 letters, numbers, or underscores; the name must start with a letter." });
  try {
    const result = await pool.query(
      "INSERT INTO inquiry_categories (name, is_active) VALUES ($1, TRUE) RETURNING id, name, is_active, created_at, updated_at",
      [name]
    );
    return res.status(201).json({ success: true, message: "Category created.", data: { ...result.rows[0], inquiry_count: 0 } });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "This category already exists." });
    console.error("Create Category Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create category." });
  }
}

async function updateCategory(req, res) {
  const { id } = req.params;
  const { name: inputName, is_active } = req.body;
  if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid category ID." });
  if (inputName === undefined && is_active === undefined) return res.status(400).json({ success: false, message: "Provide a new category name or active state." });
  if (is_active !== undefined && typeof is_active !== "boolean") return res.status(400).json({ success: false, message: "is_active must be a boolean." });
  const name = inputName === undefined ? null : normalizeCategory(inputName);
  if (name !== null && !/^[A-Z][A-Z0-9_]{1,39}$/.test(name)) return res.status(400).json({ success: false, message: "Use 2–40 letters, numbers, or underscores; the name must start with a letter." });
  try {
    const result = await pool.query(
      `UPDATE inquiry_categories
       SET name = COALESCE($1, name), is_active = COALESCE($2, is_active), updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, name, is_active, created_at, updated_at`,
      [name, is_active ?? null, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Category not found." });
    const count = await pool.query("SELECT COUNT(*)::int AS inquiry_count FROM inquiries WHERE category = $1", [result.rows[0].name]);
    return res.status(200).json({ success: true, message: "Category updated.", data: { ...result.rows[0], ...count.rows[0] } });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "This category name already exists." });
    console.error("Update Category Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update category." });
  }
}

async function deleteCategory(req, res) {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid category ID." });
  try {
    const categoryResult = await pool.query("SELECT id, name FROM inquiry_categories WHERE id=$1", [id]);
    if (!categoryResult.rows.length) return res.status(404).json({ success: false, message: "Category not found." });
    const category = categoryResult.rows[0];
    const references = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM inquiries WHERE category=$1) +
         (SELECT COUNT(*) FROM users WHERE role='HANDLER' AND specialization=$1) AS count`,
      [category.name]
    );
    if (Number(references.rows[0].count) > 0) {
      return res.status(409).json({ success: false, message: "This category is used by inquiries or handlers. Deactivate it to preserve existing records." });
    }
    await pool.query("DELETE FROM inquiry_categories WHERE id=$1", [id]);
    return res.status(200).json({ success: true, message: `Category ${category.name} was deleted.` });
  } catch (error) {
    if (error.code === "23503") return res.status(409).json({ success: false, message: "This category is used by inquiries or handlers. Deactivate it to preserve existing records." });
    console.error("Delete Category Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete category." });
  }
}

module.exports = { getStaff, createStaff, updateStaff, resetStaffPassword, deleteStaff, setStaffActive, getCategories, createCategory, updateCategory, deleteCategory };
