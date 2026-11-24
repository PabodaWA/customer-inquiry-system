const pool = require("../config/database");
const { canAccessInquiry } = require("../services/inquiryAccess");
const validId = (id) => /^[1-9]\d*$/.test(String(id));

async function getDashboard(req, res) {
  const handlerId = req.session.user.id;
  try {
    const [inquiries, declined] = await Promise.all([
      pool.query(`SELECT i.*, u.full_name AS assigned_staff_name, COALESCE(a.assigned_at,i.created_at) AS assigned_at FROM inquiries i LEFT JOIN users u ON u.id=i.assigned_to LEFT JOIN LATERAL (SELECT assigned_at FROM inquiry_assignments WHERE inquiry_id=i.id AND handler_id=$1 ORDER BY assigned_at DESC LIMIT 1) a ON TRUE WHERE i.assigned_to=$1 ORDER BY COALESCE(a.assigned_at,i.created_at) DESC,i.id DESC`, [handlerId]),
      pool.query("SELECT COUNT(*)::int AS count FROM inquiry_history WHERE changed_by=$1 AND action='DECLINED'", [handlerId]),
    ]);
    const counts = { total: inquiries.rows.length, pending: inquiries.rows.filter((i) => i.handler_response_status === "WAITING").length, in_progress: inquiries.rows.filter((i) => i.status === "IN_PROGRESS").length, resolved: inquiries.rows.filter((i) => i.status === "RESOLVED").length, declined: declined.rows[0].count };
    return res.json({ success: true, data: inquiries.rows, stats: counts });
  } catch (error) { console.error("Handler dashboard:", error); return res.status(500).json({ success: false, message: "Could not load your dashboard." }); }
}

async function getMyDeclinedInquiries(req, res) {
  const handlerId = req.session.user.id;
  try {
    const result = await pool.query(
      `SELECT i.*, a.decline_reason, a.declined_at, a.assigned_at
       FROM inquiry_assignments a
       JOIN inquiries i ON i.id=a.inquiry_id
       WHERE a.handler_id=$1 AND a.status='DECLINED'
       ORDER BY a.declined_at DESC, a.id DESC`,
      [handlerId]
    );
    for (const inquiry of result.rows) {
      const evidence = await pool.query(
        "SELECT id, file_name, mime_type, file_data FROM inquiry_evidence WHERE inquiry_id=$1 ORDER BY id",
        [inquiry.id]
      );
      inquiry.evidence_files = evidence.rows.map((file) => ({
        id: file.id,
        file_name: file.file_name,
        mime_type: file.mime_type,
        data_url: `data:${file.mime_type};base64,${file.file_data.toString("base64")}`,
      }));
    }
    return res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error("Handler declined inquiries:", error);
    return res.status(500).json({ success: false, message: "Could not load your declined inquiries." });
  }
}

async function acceptInquiry(req, res) {
  const { id } = req.params;
  if (!validId(id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM inquiries WHERE id=$1 FOR UPDATE", [id]);
    const inquiry = found.rows[0];
    if (!inquiry) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Inquiry not found." }); }
    if (Number(inquiry.assigned_to) !== Number(req.session.user.id)) { await client.query("ROLLBACK"); return res.status(403).json({ success: false, message: "This inquiry is not assigned to you." }); }
    if (inquiry.status !== "NEW" || inquiry.handler_response_status !== "WAITING") { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "This assignment is no longer awaiting acceptance." }); }
    const updated = await client.query(`UPDATE inquiries SET status='IN_PROGRESS', handler_response_status='ACCEPTED', accepted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [id]);
    await client.query(`UPDATE inquiry_assignments SET status='ACCEPTED', accepted_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM inquiry_assignments WHERE inquiry_id=$1 AND handler_id=$2 ORDER BY assigned_at DESC LIMIT 1)`, [id, req.session.user.id]);
    await client.query("INSERT INTO inquiry_history (inquiry_id,changed_by,action,old_value,new_value) VALUES ($1,$2,'ACCEPTED','NEW','IN_PROGRESS')", [id, req.session.user.id]);
    if (inquiry.created_by) await client.query("INSERT INTO user_notifications (user_id,inquiry_id,kind,message) VALUES ($1,$2,'INQUIRY_UPDATE',$3)", [inquiry.created_by, id, `Inquiry CN-${String(id).padStart(4, "0")} was accepted and is now in progress.`]);
    await client.query("COMMIT");
    return res.json({ success: true, message: "Inquiry accepted.", data: updated.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); console.error("Accept inquiry:", error); return res.status(500).json({ success: false, message: "Could not accept this inquiry." }); }
  finally { client.release(); }
}

async function declineInquiry(req, res) {
  const { id } = req.params;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!validId(id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID." });
  if (reason.length < 10 || reason.length > 2000) return res.status(400).json({ success: false, message: "Enter a meaningful decline reason (10–2,000 characters)." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM inquiries WHERE id=$1 FOR UPDATE", [id]);
    const inquiry = found.rows[0];
    if (!inquiry) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Inquiry not found." }); }
    if (Number(inquiry.assigned_to) !== Number(req.session.user.id)) { await client.query("ROLLBACK"); return res.status(403).json({ success: false, message: "This inquiry is not assigned to you." }); }
    if (inquiry.status !== "NEW" || inquiry.handler_response_status !== "WAITING") { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Only a pending assignment can be declined." }); }
    await client.query(`UPDATE inquiries SET assigned_to=NULL, assignment_status='PENDING', handler_response_status='DECLINED', decline_reason=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [id, reason]);
    await client.query(`UPDATE inquiry_assignments SET status='DECLINED', decline_reason=$3, declined_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM inquiry_assignments WHERE inquiry_id=$1 AND handler_id=$2 ORDER BY assigned_at DESC LIMIT 1)`, [id, req.session.user.id, reason]);
    await client.query("INSERT INTO inquiry_history (inquiry_id,changed_by,action,old_value,new_value) VALUES ($1,$2,'DECLINED',$3,$4)", [id, req.session.user.id, String(req.session.user.id), reason]);
    const admins = await client.query("SELECT id FROM users WHERE role='ADMIN' AND is_active=TRUE");
    for (const admin of admins.rows) await client.query("INSERT INTO user_notifications (user_id,inquiry_id,kind,message) VALUES ($1,$2,'DECLINED_ASSIGNMENT',$3)", [admin.id, id, `Inquiry CN-${String(id).padStart(4, "0")} was declined: ${reason}`]);
    if (inquiry.created_by) await client.query("INSERT INTO user_notifications (user_id,inquiry_id,kind,message) VALUES ($1,$2,'INQUIRY_UPDATE',$3)", [inquiry.created_by, id, `The handler returned inquiry CN-${String(id).padStart(4, "0")} for reassignment.`]);
    await client.query("COMMIT");
    return res.json({ success: true, message: "Inquiry returned to the admin reassignment queue." });
  } catch (error) { await client.query("ROLLBACK"); console.error("Decline inquiry:", error); return res.status(500).json({ success: false, message: "Could not decline this inquiry." }); }
  finally { client.release(); }
}

async function resolveInquiry(req, res) {
  const { id } = req.params;
  if (!validId(id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID." });
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM inquiries WHERE id=$1 FOR UPDATE", [id]);
    const item = found.rows[0];
    if (!item) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Inquiry not found." }); }
    if (Number(item.assigned_to) !== Number(req.session.user.id)) { await client.query("ROLLBACK"); return res.status(403).json({ success: false, message: "This inquiry is not assigned to you." }); }
    if (item.status !== "IN_PROGRESS" || item.handler_response_status !== "ACCEPTED") { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Only an accepted inquiry in progress can be resolved." }); }
    const updated = await client.query("UPDATE inquiries SET status='RESOLVED', resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *", [id]);
    await client.query("UPDATE inquiry_assignments SET status='RESOLVED', resolved_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM inquiry_assignments WHERE inquiry_id=$1 AND handler_id=$2 ORDER BY assigned_at DESC LIMIT 1)", [id, req.session.user.id]);
    await client.query("INSERT INTO inquiry_history (inquiry_id,changed_by,action,old_value,new_value) VALUES ($1,$2,'RESOLVED','IN_PROGRESS','RESOLVED')", [id, req.session.user.id]);
    await client.query("COMMIT");
    committed = true;
    if (item.created_by) {
      try {
        await pool.query(
          "INSERT INTO user_notifications (user_id,inquiry_id,kind,message) SELECT $1,$2,'INQUIRY_UPDATE',$3 WHERE EXISTS (SELECT 1 FROM users WHERE id=$1)",
          [item.created_by, id, `Inquiry CN-${String(id).padStart(4, "0")} has been resolved.`]
        );
      } catch (notificationError) {
        console.warn("Resolve inquiry notification:", notificationError);
      }
    }
    return res.json({ success: true, message: "Inquiry resolved.", data: updated.rows[0] });
  } catch (error) {
    if (!committed) {
      try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("Resolve inquiry rollback:", rollbackError); }
    }
    console.error("Resolve inquiry:", error);
    return res.status(500).json({ success: false, message: "Could not resolve this inquiry." });
  }
  finally { client.release(); }
}

async function getAssignmentHistory(req, res) {
  const { id } = req.params;
  if (!validId(id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID." });
  try {
    const visible = await pool.query("SELECT created_by,assigned_to FROM inquiries WHERE id=$1", [id]);
    if (!visible.rows.length) return res.status(404).json({ success: false, message: "Inquiry not found." });
    if (!canAccessInquiry(req.session.user, visible.rows[0])) return res.status(403).json({ success: false, message: "You cannot view this inquiry." });
    const result = await pool.query(`SELECT a.*, h.full_name AS handler_name, u.full_name AS assigned_by_name FROM inquiry_assignments a JOIN users h ON h.id=a.handler_id LEFT JOIN users u ON u.id=a.assigned_by WHERE a.inquiry_id=$1 ORDER BY a.assigned_at DESC`, [id]);
    return res.json({ success: true, data: result.rows });
  } catch (error) { console.error("Assignment history:", error); return res.status(500).json({ success: false, message: "Could not retrieve assignment history." }); }
}

module.exports = { getDashboard, getMyDeclinedInquiries, acceptInquiry, declineInquiry, resolveInquiry, getAssignmentHistory };
