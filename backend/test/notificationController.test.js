const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const { getNotifications, markNotificationRead } = require("../src/controllers/notificationController");

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("notification listing is scoped to the signed-in user and counts unread items", async (t) => {
  const originalQuery = pool.query;
  let captured;
  pool.query = async (sql, values) => {
    captured = { sql, values };
    return { rows: [
      { id: 3, message: "Assigned", read_at: null },
      { id: 2, message: "Resolved", read_at: "2026-01-01T00:00:00.000Z" },
    ] };
  };
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();

  await getNotifications({ session: { user: { id: 42 } } }, response);

  assert.deepEqual(captured.values, [42]);
  assert.match(captured.sql, /WHERE user_id=\$1/);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.length, 2);
  assert.equal(response.body.unread_count, 1);
});

test("marking a notification read is constrained to its owner", async (t) => {
  const originalQuery = pool.query;
  let captured;
  pool.query = async (sql, values) => {
    captured = { sql, values };
    return { rows: [{ id: 9, read_at: "2026-01-01T00:00:00.000Z" }] };
  };
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();

  await markNotificationRead({ params: { id: "9" }, session: { user: { id: 42 } } }, response);

  assert.deepEqual(captured.values, ["9", 42]);
  assert.match(captured.sql, /WHERE id=\$1 AND user_id=\$2/);
  assert.equal(response.statusCode, 200);
});

test("a notification owned by another user is reported as not found", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [] });
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();

  await markNotificationRead({ params: { id: "9" }, session: { user: { id: 99 } } }, response);

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.success, false);
});

test("invalid notification IDs are rejected without querying the database", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => { throw new Error("Database should not be queried for an invalid ID."); };
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();

  await markNotificationRead({ params: { id: "0" }, session: { user: { id: 42 } } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
});
