const pool = require("../config/database");
const validId = (id) => /^[1-9]\d*$/.test(String(id));

async function getDeclinedAssignments(_req, res) {
  try {
    const result = await pool.query(`SELECT i.id,i.customer_name,i.subject,i.category,i.status,i.assignment_status,i.handler_response_status,i.decline_reason,i.created_at,a.declined_at,h.full_name AS previous_handler FROM inquiries i LEFT JOIN LATERAL (SELECT * FROM inquiry_assignments WHERE inquiry_id=i.id AND status='DECLINED' ORDER BY declined_at DESC NULLS LAST,assigned_at DESC LIMIT 1) a ON TRUE LEFT JOIN users h ON h.id=a.handler_id WHERE i.assigned_to IS NULL ORDER BY CASE WHEN i.handler_response_status='DECLINED' THEN 0 ELSE 1 END,a.declined_at DESC NULLS LAST,i.updated_at DESC`);
    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) { console.error("Declined assignments:", error); return res.status(500).json({ success: false, message: "Could not retrieve reassignment requests." }); }
}

async function getActiveHandlers(_req, res) {
  try {
    const result = await pool.query("SELECT id,full_name,specialization FROM users WHERE role='HANDLER' AND is_active=TRUE ORDER BY full_name");
    return res.json({ success: true, data: result.rows });
  } catch (error) { console.error("Active handlers:", error); return res.status(500).json({ success: false, message: "Could not retrieve active handlers." }); }
}

async function updateDeclinedCategory(req, res) {
  const { id } = req.params;
  const category = typeof req.body.category === "string" ? req.body.category.trim().toUpperCase().replace(/\s+/g, "_") : "";
  if (!validId(id) || !category) return res.status(400).json({ success: false, message: "A valid inquiry and category are required." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const item = await client.query("SELECT category,assigned_to,handler_response_status FROM inquiries WHERE id=$1 FOR UPDATE", [id]);
    if (!item.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Inquiry not found." }); }
    if (item.rows[0].assigned_to !== null) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Only an unassigned inquiry can be changed." }); }
    const valid = await client.query("SELECT 1 FROM inquiry_categories WHERE name=$1 AND is_active=TRUE", [category]);
    if (!valid.rows.length) { await client.query("ROLLBACK"); return res.status(400).json({ success: false, message: "Select an active category." }); }
    const oldCategory = item.rows[0].category;
    if (category !== oldCategory) {
      await client.query("UPDATE inquiries SET category=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2", [category, id]);
      await client.query("INSERT INTO inquiry_history (inquiry_id,changed_by,action,old_value,new_value) VALUES ($1,$2,'CATEGORY_CHANGED',$3,$4)", [id, req.session.user.id, oldCategory, category]);
    }
    await client.query("COMMIT");
    return res.json({ success: true, message: "Inquiry category updated." });
  } catch (error) { await client.query("ROLLBACK"); console.error("Update declined category:", error); return res.status(500).json({ success: false, message: "Could not update category." }); }
  finally { client.release(); }
}

async function reassignDeclinedInquiry(req, res) {
  const { id } = req.params;
  const handlerId = req.body.handler_id;
  if (!validId(id) || !validId(handlerId)) return res.status(400).json({ success: false, message: "Valid inquiry and handler IDs are required." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const item = await client.query("SELECT * FROM inquiries WHERE id=$1 FOR UPDATE", [id]);
    if (!item.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Inquiry not found." }); }
    const inquiry = item.rows[0];
    if (inquiry.assigned_to !== null) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Only an unassigned inquiry can be assigned here." }); }
    const handler = await client.query("SELECT id,full_name,specialization FROM users WHERE id=$1 AND role='HANDLER' AND is_active=TRUE AND specialization=$2", [handlerId, inquiry.category]);
    if (!handler.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Active handler not found." }); }
    const selected = handler.rows[0];
    await client.query("UPDATE inquiries SET assigned_to=$1,assignment_status='ASSIGNED',handler_response_status='WAITING',status='NEW',decline_reason=NULL,accepted_at=NULL,resolved_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$2", [selected.id, id]);
    await client.query("INSERT INTO inquiry_assignments (inquiry_id,handler_id,assigned_by,status) VALUES ($1,$2,$3,'PENDING_ACCEPTANCE')", [id, selected.id, req.session.user.id]);
    const action = inquiry.handler_response_status === "DECLINED" ? "REASSIGNED" : "ASSIGNED";
    await client.query("INSERT INTO inquiry_history (inquiry_id,changed_by,action,old_value,new_value) VALUES ($1,$2,$3,$4,$5)", [id, req.session.user.id, action, inquiry.decline_reason ?? null, String(selected.id)]);
    await client.query("INSERT INTO user_notifications (user_id,inquiry_id,kind,message) VALUES ($1,$2,'NEW_ASSIGNMENT',$3)", [selected.id, id, `Inquiry CN-${String(id).padStart(4, "0")} has been assigned to you.`]);
    await client.query("COMMIT");
    return res.json({ success: true, message: `Inquiry assigned to ${selected.full_name}.` });
  } catch (error) { await client.query("ROLLBACK"); console.error("Reassign inquiry:", error); return res.status(500).json({ success: false, message: "Could not reassign this inquiry." }); }
  finally { client.release(); }
}

module.exports = { getDeclinedAssignments, getActiveHandlers, updateDeclinedCategory, reassignDeclinedInquiry };
