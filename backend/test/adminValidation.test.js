const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const controller = require("../src/controllers/adminController");

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("category creation normalizes valid names and returns the created record", async (t) => {
  const originalQuery = pool.query;
  let captured;
  pool.query = async (sql, values) => {
    captured = { sql, values };
    return { rows: [{ id: 12, name: "PRODUCT_QUESTION", is_active: true }] };
  };
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();

  await controller.createCategory({ body: { name: "  Product Question " } }, response);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(captured.values, ["PRODUCT_QUESTION"]);
  assert.match(captured.sql, /INSERT INTO inquiry_categories/);
  assert.equal(response.body.data.name, "PRODUCT_QUESTION");
});

test("invalid category names are rejected before database access", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => { throw new Error("Database should not be queried for an invalid category."); };
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();

  await controller.createCategory({ body: { name: "A" } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
});

test("staff status changes require a boolean and a valid staff ID", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => { throw new Error("Database should not be queried for invalid staff status input."); };
  t.after(() => { pool.query = originalQuery; });

  const invalidValueResponse = mockResponse();
  await controller.setStaffActive({ params: { id: "4" }, body: { is_active: "false" } }, invalidValueResponse);
  assert.equal(invalidValueResponse.statusCode, 400);

  const invalidIdResponse = mockResponse();
  await controller.setStaffActive({ params: { id: "0" }, body: { is_active: false } }, invalidIdResponse);
  assert.equal(invalidIdResponse.statusCode, 400);
});

test("invalid staff email or role is rejected before database access", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => { throw new Error("Database should not be queried for invalid staff input."); };
  t.after(() => { pool.query = originalQuery; });

  const invalidEmail = mockResponse();
  await controller.createStaff({ body: { full_name: "Test User", email: "not-an-email", role: "INTAKE" } }, invalidEmail);
  assert.equal(invalidEmail.statusCode, 400);

  const invalidRole = mockResponse();
  await controller.createStaff({ body: { full_name: "Test User", email: "test@example.test", role: "ADMIN" } }, invalidRole);
  assert.equal(invalidRole.statusCode, 400);
});
