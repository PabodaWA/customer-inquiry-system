const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const controller = require("../src/controllers/handlerController");

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function workflowClient(inquiry) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("SELECT * FROM inquiries")) return { rows: inquiry ? [{ ...inquiry }] : [] };
      if (sql.includes("UPDATE inquiries")) {
        const status = sql.includes("status='IN_PROGRESS'") ? "IN_PROGRESS" : "RESOLVED";
        return { rows: [{ ...inquiry, status }] };
      }
      if (sql.includes("SELECT id FROM users")) return { rows: [{ id: 3 }] };
      return { rows: [] };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
}

async function withClient(t, client) {
  const originalConnect = pool.connect;
  pool.connect = async () => client;
  t.after(() => { pool.connect = originalConnect; });
}

const assignedInquiry = (overrides = {}) => ({
  id: 12,
  assigned_to: 8,
  created_by: 42,
  status: "NEW",
  handler_response_status: "WAITING",
  ...overrides,
});

const handlerRequest = (id = "12", overrides = {}) => ({
  params: { id },
  session: { user: { id: 8, role: "HANDLER" } },
  body: {},
  ...overrides,
});

test("handler can accept a pending assignment and the change is recorded", async (t) => {
  const client = workflowClient(assignedInquiry());
  await withClient(t, client);
  const response = mockResponse();

  await controller.acceptInquiry(handlerRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.status, "IN_PROGRESS");
  assert.ok(client.calls.some((call) => call.sql.includes("INSERT INTO inquiry_history") && call.sql.includes("'ACCEPTED'")));
  assert.ok(client.calls.some((call) => call.sql === "COMMIT"));
});

test("handler cannot accept an inquiry assigned to someone else", async (t) => {
  const client = workflowClient(assignedInquiry({ assigned_to: 99 }));
  await withClient(t, client);
  const response = mockResponse();

  await controller.acceptInquiry(handlerRequest(), response);

  assert.equal(response.statusCode, 403);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.calls.some((call) => call.sql.includes("UPDATE inquiries")), false);
});

test("handler decline requires a meaningful reason before opening a transaction", async () => {
  const response = mockResponse();
  await controller.declineInquiry(handlerRequest("12", { body: { reason: "too short" } }), response);
  assert.equal(response.statusCode, 400);
});

test("handler can decline a pending assignment and notify the admin queue", async (t) => {
  const client = workflowClient(assignedInquiry());
  await withClient(t, client);
  const response = mockResponse();

  await controller.declineInquiry(handlerRequest("12", { body: { reason: "This requires billing expertise." } }), response);

  assert.equal(response.statusCode, 200);
  assert.ok(client.calls.some((call) => call.sql.includes("UPDATE inquiries SET assigned_to=NULL")));
  assert.ok(client.calls.some((call) => call.sql.includes("'DECLINED_ASSIGNMENT'")));
  assert.ok(client.calls.some((call) => call.sql === "COMMIT"));
});

test("handler cannot decline an inquiry assigned to someone else", async (t) => {
  const client = workflowClient(assignedInquiry({ assigned_to: 99 }));
  await withClient(t, client);
  const response = mockResponse();

  await controller.declineInquiry(handlerRequest("12", { body: { reason: "This requires billing expertise." } }), response);

  assert.equal(response.statusCode, 403);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.calls.some((call) => call.sql.includes("UPDATE inquiries")), false);
});

test("handler can resolve an accepted inquiry in progress", async (t) => {
  const originalQuery = pool.query;
  const client = workflowClient(assignedInquiry({ status: "IN_PROGRESS", handler_response_status: "ACCEPTED" }));
  await withClient(t, client);
  pool.query = async () => ({ rows: [] });
  t.after(() => { pool.query = originalQuery; });
  const response = mockResponse();

  await controller.resolveInquiry(handlerRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.status, "RESOLVED");
  assert.ok(client.calls.some((call) => call.sql.includes("INSERT INTO inquiry_history") && call.sql.includes("'RESOLVED'")));
  assert.ok(client.calls.some((call) => call.sql === "COMMIT"));
});

test("handler cannot resolve a pending inquiry", async (t) => {
  const client = workflowClient(assignedInquiry());
  await withClient(t, client);
  const response = mockResponse();

  await controller.resolveInquiry(handlerRequest(), response);

  assert.equal(response.statusCode, 409);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.calls.some((call) => call.sql.includes("UPDATE inquiries")), false);
});

test("handler cannot resolve an inquiry assigned to someone else", async (t) => {
  const client = workflowClient(assignedInquiry({ assigned_to: 99, status: "IN_PROGRESS", handler_response_status: "ACCEPTED" }));
  await withClient(t, client);
  const response = mockResponse();

  await controller.resolveInquiry(handlerRequest(), response);

  assert.equal(response.statusCode, 403);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.calls.some((call) => call.sql.includes("UPDATE inquiries")), false);
});
