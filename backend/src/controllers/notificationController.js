const pool = require("../config/database");

async function getNotifications(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, inquiry_id, kind, message, created_at, read_at
       FROM user_notifications WHERE user_id=$1
       ORDER BY created_at DESC, id DESC LIMIT 30`,
      [req.session.user.id]
    );
    return res.json({ success: true, data: result.rows, unread_count: result.rows.filter((item) => !item.read_at).length });
  } catch (error) {
    console.error("Get notifications:", error);
    return res.status(500).json({ success: false, message: "Could not load notifications." });
  }
}

async function markNotificationRead(req, res) {
  if (!/^[1-9]\d*$/.test(String(req.params.id))) return res.status(400).json({ success: false, message: "Invalid notification ID." });
  try {
    const result = await pool.query(
      "UPDATE user_notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=$1 AND user_id=$2 RETURNING id,read_at",
      [req.params.id, req.session.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Notification not found." });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Mark notification read:", error);
    return res.status(500).json({ success: false, message: "Could not update notification." });
  }
}

module.exports = { getNotifications, markNotificationRead };
