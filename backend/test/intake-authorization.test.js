const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const controller = require("../src/controllers/inquiryController");

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const intakeRequest = (overrides = {}) => ({
  session: { user: { id: 42, role: "INTAKE" } },
  params: { id: "12" },
  body: {},
  query: {},
  ...overrides,
});

function inquiryCreationClient({ handlers = [], workloads = [], cursor = null, failAt = "" } = {}) {
  const calls = [];
  let row = null;
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("SELECT id FROM inquiry_categories")) return { rows: [{ id: 1 }] };
      if (sql.includes("INSERT INTO inquiries")) {
        row = { id: 120, customer_name: values[0], contact: values[1], subject: values[2], description: values[3], category: values[4], created_by: values[5], status: "NEW", assigned_to: null, assignment_status: "PENDING", handler_response_status: "NOT_REQUIRED" };
        return { rows: [row] };
      }
      if (sql.includes("INSERT INTO assignment_state")) return { rows: [] };
      if (sql.includes("SELECT last_assigned_handler_id")) return { rows: [{ last_assigned_handler_id: cursor }] };
      if (sql.includes("SELECT id, full_name") && sql.includes("FROM users")) return { rows: handlers };
      if (sql.includes("SELECT assigned_to AS handler_id")) return { rows: workloads };
      if (sql.includes("UPDATE assignment_state")) {
        if (failAt === "UPDATE assignment_state") throw new Error("cursor update failed");
        return { rows: [] };
      }
      if (sql.includes("UPDATE inquiries")) {
        row = { ...row, assigned_to: values[0], assignment_status: "ASSIGNED", handler_response_status: "WAITING" };
        return { rows: [row] };
      }
      if (sql.includes("SELECT i.*, assigned.full_name")) {
        row = { ...row, assigned_staff_name: row.assigned_to ? handlers.find((handler) => handler.id === row.assigned_to)?.full_name ?? null : null };
        return { rows: [row] };
      }
      if (sql.includes("INSERT INTO inquiry_history")) return { rows: [] };
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
}

test("intake staff cannot manually assign inquiries", async () => {
  const response = mockResponse();
  await controller.assignInquiry(intakeRequest({ body: { assigned_to: "8" } }), response);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.success, false);
});

test("intake staff cannot update inquiry statuses", async () => {
  const response = mockResponse();
  await controller.updateInquiryStatus(intakeRequest({ body: { status: "RESOLVED" } }), response);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.success, false);
});

test("unauthorized handlers cannot create inquiries", async () => {
  const response = mockResponse();
  await controller.createInquiry({ session: { user: { id: 8, role: "HANDLER" } }, body: {} }, response);
  assert.equal(response.statusCode, 403);
});

test("inquiry creation is restricted to Intake Staff", async () => {
  const response = mockResponse();
  await controller.createInquiry({ session: { user: { id: 1, role: "ADMIN" } }, body: {} }, response);
  assert.equal(response.statusCode, 403);
});

test("intake staff cannot provide a handler ID during inquiry creation", async () => {
  const response = mockResponse();
  await controller.createInquiry(intakeRequest({ body: { assigned_to: 8 } }), response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /managed automatically/);
});

test("successful intake creation automatically assigns the handler and returns the assignment", async (t) => {
  const originalConnect = pool.connect;
  const client = inquiryCreationClient({ handlers: [{ id: 8, full_name: "Repair Handler" }], workloads: [] });
  pool.connect = async () => client;
  t.after(() => { pool.connect = originalConnect; });

  const response = mockResponse();
  await controller.createInquiry(intakeRequest({ body: {
    customer_name: "Customer One", contact: "+94 77 123 4567", subject: "Repair request",
    description: "Needs a repair.", category: "REPAIR", created_by: 999,
  } }), response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.created_by, 42);
  assert.equal(response.body.data.status, "NEW");
  assert.equal(response.body.data.assigned_to, 8);
  assert.equal(response.body.data.assignment_status, "ASSIGNED");
  assert.equal(response.body.data.handler_response_status, "WAITING");
  assert.equal(response.body.data.assigned_staff_name, "Repair Handler");
  assert.equal(response.body.assignment.handler.id, 8);
  assert.match(response.body.message, /Repair Handler/);
  assert.ok(client.calls.some((call) => call.sql.includes("'ASSIGNED'")));
  assert.ok(client.calls.some((call) => call.sql === "COMMIT"));
});

test("successful intake creation remains pending when no handler is eligible", async (t) => {
  const originalConnect = pool.connect;
  const client = inquiryCreationClient({ handlers: [] });
  pool.connect = async () => client;
  t.after(() => { pool.connect = originalConnect; });

  const response = mockResponse();
  await controller.createInquiry(intakeRequest({ body: {
    customer_name: "Customer One", contact: "+94 77 123 4567", subject: "Repair request",
    description: "Needs a repair.", category: "REPAIR",
  } }), response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.assigned_to, null);
  assert.equal(response.body.data.assignment_status, "PENDING");
  assert.equal(response.body.data.handler_response_status, "NOT_REQUIRED");
  assert.equal(response.body.assignment.handler, null);
  assert.match(response.body.message, /pending/);
  assert.equal(client.calls.some((call) => call.sql.includes("UPDATE assignment_state")), false);
  assert.ok(client.calls.some((call) => call.sql === "COMMIT"));
});

test("rolls back inquiry creation if automatic assignment fails", async (t) => {
  const originalConnect = pool.connect;
  const originalError = console.error;
  const client = inquiryCreationClient({ handlers: [{ id: 8, full_name: "Repair Handler" }], failAt: "UPDATE assignment_state" });
  pool.connect = async () => client;
  console.error = () => {};
  t.after(() => { pool.connect = originalConnect; console.error = originalError; });

  const response = mockResponse();
  await controller.createInquiry(intakeRequest({ body: {
    customer_name: "Customer One", contact: "+94 77 123 4567", subject: "Repair request",
    description: "Needs a repair.", category: "REPAIR",
  } }), response);

  assert.equal(response.statusCode, 500);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.calls.some((call) => call.sql === "COMMIT"), false);
});

test("intake staff cannot read inquiries or histories they did not create", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ id: 12, created_by: 7, assigned_to: null }] });
  t.after(() => { pool.query = originalQuery; });

  const detailResponse = mockResponse();
  await controller.getInquiryById(intakeRequest(), detailResponse);
  assert.equal(detailResponse.statusCode, 403);

  const historyResponse = mockResponse();
  await controller.getInquiryHistory(intakeRequest(), historyResponse);
  assert.equal(historyResponse.statusCode, 403);
});

test("inquiry listing applies the authenticated intake owner's scope and safe pagination", async (t) => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("AS count")) return { rows: [{ count: 1 }] };
    if (sql.includes("AS new_count")) return { rows: [{ total: 1, new_count: 1, in_progress: 0, resolved: 0 }] };
    return { rows: [{ id: 12, created_by: 42, customer_name: "Authorized customer" }] };
  };
  t.after(() => { pool.query = originalQuery; });

  const response = mockResponse();
  await controller.getAllInquiries(intakeRequest({ query: { page: "1", pageSize: "10", search: "CN-0012" } }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].created_by, 42);
  assert.equal(response.body.pagination.totalPages, 1);
  const listing = calls.find((call) => call.sql.includes("SELECT i.*"));
  assert.match(listing.sql, /i\.created_by = \$1/);
  assert.match(listing.sql, /assigned\.full_name ILIKE \$2/);
  assert.deepEqual(listing.values, [42, "%CN-0012%", 10, 0]);
});

test("invalid pagination is rejected before querying the database", async () => {
  const originalQuery = pool.query;
  pool.query = async () => { throw new Error("Database should not be called for invalid pagination."); };
  try {
    const response = mockResponse();
    await controller.getAllInquiries(intakeRequest({ query: { page: "1", pageSize: "15" } }), response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
  } finally {
    pool.query = originalQuery;
  }
});

test("unknown categories are rejected before listing records", async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [] });
  try {
    const response = mockResponse();
    await controller.getAllInquiries(intakeRequest({ query: { category: "NOT_A_CATEGORY" } }), response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, "Invalid inquiry category.");
  } finally {
    pool.query = originalQuery;
  }
});

test("registration rejects invalid contact numbers on the server", async () => {
  const response = mockResponse();
  await controller.createInquiry(intakeRequest({ body: {
    customer_name: "Customer",
    contact: "not-a-phone",
    subject: "Order question",
    description: "Question about a recent order.",
    category: "GENERAL",
  } }), response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
});
