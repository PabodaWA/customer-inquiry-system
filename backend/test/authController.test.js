const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const pool = require("../src/config/database");
const { login, logout } = require("../src/controllers/authController");
const { requireAuth, authorizeRoles } = require("../src/middleware/authMiddleware");

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    clearedCookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    clearCookie(name) { this.clearedCookies.push(name); return this; },
  };
}

function mockRequest(email, password, sessionOverrides = {}) {
  return {
    body: { email, password },
    session: {
      user: { id: 99, role: "ADMIN" },
      regenerate(callback) { callback(null); },
      save(callback) { callback(null); },
      ...sessionOverrides,
    },
  };
}

const storedUser = {
  id: 7,
  full_name: "Test Intake User",
  email: "intake@example.test",
  role: "INTAKE",
  specialization: null,
  is_active: true,
};

test("login normalizes email, regenerates the session, and returns a safe user", async (t) => {
  const originalQuery = pool.query;
  const passwordHash = bcrypt.hashSync("safe-test-password", 4);
  let queryValues;
  pool.query = async (_sql, values) => {
    queryValues = values;
    return { rows: [{ ...storedUser, password_hash: passwordHash }] };
  };
  t.after(() => { pool.query = originalQuery; });

  const response = mockResponse();
  let regenerated = false;
  let saved = false;
  const request = mockRequest(" INTAKE@EXAMPLE.TEST ", "safe-test-password", {
    regenerate(callback) {
      regenerated = true;
      this.user = undefined;
      callback(null);
    },
    save(callback) {
      saved = true;
      callback(null);
    },
  });

  await login(request, response);

  assert.deepEqual(queryValues, ["intake@example.test"]);
  assert.equal(regenerated, true);
  assert.equal(saved, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.id, storedUser.id);
  assert.equal(response.body.user.role, storedUser.role);
  assert.equal("password_hash" in response.body.user, false);
  assert.equal(request.session.user.id, storedUser.id);
});

test("login rejects a wrong password without creating a session", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ ...storedUser, password_hash: bcrypt.hashSync("other-test-password", 4) }] });
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();
  let regenerated = false;

  await login(mockRequest(storedUser.email, "wrong-test-password", {
    regenerate(callback) { regenerated = true; callback(null); },
  }), response);

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(regenerated, false);
});

test("login requires both credentials before querying the database", async () => {
  const response = mockResponse();
  await login(mockRequest("", ""), response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
});

test("inactive accounts cannot create a session", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ ...storedUser, is_active: false, password_hash: "unused" }] });
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();
  let regenerated = false;

  await login(mockRequest(storedUser.email, "safe-test-password", {
    regenerate(callback) { regenerated = true; callback(null); },
  }), response);

  assert.equal(response.statusCode, 403);
  assert.equal(regenerated, false);
});

test("session save failures are reported instead of returning a successful login", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ ...storedUser, password_hash: bcrypt.hashSync("safe-test-password", 4) }] });
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();

  await login(mockRequest(storedUser.email, "safe-test-password", {
    save(callback) { callback(new Error("test-only session-store failure")); },
  }), response);

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.success, false);
});

test("logout destroys the session and clears the session cookie", async () => {
  const response = mockResponse();
  let destroyed = false;

  logout({ session: { destroy(callback) { destroyed = true; callback(null); } } }, response);

  assert.equal(destroyed, true);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.clearedCookies, ["inquiry.sid"]);
});

test("authentication middleware rejects missing sessions and permits logged-in users", () => {
  let continued = false;
  const response = mockResponse();
  requireAuth({ session: null }, response, () => { continued = true; });
  assert.equal(response.statusCode, 401);
  assert.equal(continued, false);

  requireAuth({ session: { user: { id: 7 } } }, mockResponse(), () => { continued = true; });
  assert.equal(continued, true);
});

test("role middleware distinguishes unauthenticated, disallowed, and allowed users", () => {
  const requireAdmin = authorizeRoles("ADMIN");
  let continued = false;
  const anonymousResponse = mockResponse();
  requireAdmin({ session: null }, anonymousResponse, () => { continued = true; });
  assert.equal(anonymousResponse.statusCode, 401);
  assert.equal(continued, false);

  const intakeResponse = mockResponse();
  requireAdmin({ session: { user: { role: "INTAKE" } } }, intakeResponse, () => { continued = true; });
  assert.equal(intakeResponse.statusCode, 403);
  assert.equal(continued, false);

  requireAdmin({ session: { user: { role: "ADMIN" } } }, mockResponse(), () => { continued = true; });
  assert.equal(continued, true);
});
