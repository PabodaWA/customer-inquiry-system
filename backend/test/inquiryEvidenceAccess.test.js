const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const { getInquiryById } = require("../src/controllers/inquiryController");

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("intake staff cannot fetch evidence for an inquiry created by another staff member", async (t) => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql) => {
    calls.push(sql);
    return { rows: [{ id: 81, created_by: 7, assigned_to: 12 }] };
  };
  t.after(() => { pool.query = originalQuery; });

  const response = mockResponse();
  await getInquiryById({
    params: { id: "81" },
    session: { user: { id: 42, role: "INTAKE" } },
  }, response);

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.success, false);
  assert.equal(calls.length, 1);
  assert.equal(calls.some((sql) => sql.includes("inquiry_evidence")), false);
});
