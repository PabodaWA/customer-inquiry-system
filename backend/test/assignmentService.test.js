const test = require("node:test");
const assert = require("node:assert/strict");
const { assignInquiryAutomatically } = require("../src/services/assignmentService");

function assignmentClient({ handlers, cursor = null, workloads = [] }) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT last_assigned_handler_id")) return { rows: [{ last_assigned_handler_id: cursor }] };
      if (sql.includes("SELECT id, full_name") && sql.includes("FROM users")) return { rows: handlers };
      if (sql.includes("SELECT assigned_to AS handler_id")) return { rows: workloads };
      return { rows: [] };
    },
  };
}

test("selects the eligible handler with the lowest active workload across categories", async () => {
  const client = assignmentClient({
    handlers: [{ id: 2, full_name: "Handler Two" }, { id: 5, full_name: "Handler Five" }, { id: 9, full_name: "Handler Nine" }],
    workloads: [{ handler_id: 2, active_workload: 4 }, { handler_id: 5, active_workload: 1 }, { handler_id: 9, active_workload: 3 }],
  });
  const result = await assignInquiryAutomatically(client, "REPAIR");
  assert.equal(result.handler.id, 5);
  const eligibilityQuery = client.calls.find((call) => call.sql.includes("SELECT id, full_name"));
  assert.match(eligibilityQuery.sql, /role = 'HANDLER'/);
  assert.match(eligibilityQuery.sql, /is_active = TRUE/);
  assert.match(eligibilityQuery.sql, /specialization = \$1/);
  assert.match(eligibilityQuery.sql, /ORDER BY id ASC\s+FOR UPDATE/);
  assert.deepEqual(eligibilityQuery.values, ["REPAIR"]);
  const workloadQuery = client.calls.find((call) => call.sql.includes("SELECT assigned_to AS handler_id"));
  assert.match(workloadQuery.sql, /status IN \('NEW', 'IN_PROGRESS'\)/);
  assert.doesNotMatch(workloadQuery.sql, /category\s*=/);
});

test("breaks equal-load ties by advancing round-robin after the saved handler", async () => {
  const client = assignmentClient({
    handlers: [{ id: 2, full_name: "Handler Two" }, { id: 5, full_name: "Handler Five" }, { id: 9, full_name: "Handler Nine" }],
    cursor: 5,
    workloads: [{ handler_id: 2, active_workload: 3 }, { handler_id: 5, active_workload: 3 }, { handler_id: 9, active_workload: 3 }],
  });
  const result = await assignInquiryAutomatically(client, "REPAIR");
  assert.equal(result.handler.id, 9);
  const cursorUpdate = client.calls.find((call) => call.sql.includes("UPDATE assignment_state"));
  assert.deepEqual(cursorUpdate.values, ["REPAIR", 9]);
});

test("wraps round-robin to the first tied handler when the cursor is past all candidates", async () => {
  const client = assignmentClient({
    handlers: [{ id: 2, full_name: "Handler Two" }, { id: 5, full_name: "Handler Five" }],
    cursor: 99,
    workloads: [{ handler_id: 2, active_workload: 0 }, { handler_id: 5, active_workload: 0 }],
  });
  const result = await assignInquiryAutomatically(client, "REPAIR");
  assert.equal(result.handler.id, 2);
});

test("updates the cursor even when there is only one eligible lowest-load handler", async () => {
  const client = assignmentClient({ handlers: [{ id: 7, full_name: "Only Repair Handler" }] });
  const result = await assignInquiryAutomatically(client, "REPAIR");
  assert.equal(result.handler.id, 7);
  assert.deepEqual(client.calls.find((call) => call.sql.includes("UPDATE assignment_state")).values, ["REPAIR", 7]);
});

test("keeps assignment pending when no eligible handler exists and does not advance the cursor", async () => {
  const client = assignmentClient({ handlers: [] });
  const result = await assignInquiryAutomatically(client, "REPAIR");
  assert.deepEqual(result, { handler: null, workload: null });
  assert.equal(client.calls.some((call) => call.sql.includes("SELECT assigned_to AS handler_id")), false);
  assert.equal(client.calls.some((call) => call.sql.includes("UPDATE assignment_state")), false);
});

test("locks category state before handler rows and calculates workload only after both locks", async () => {
  const client = assignmentClient({ handlers: [{ id: 7, full_name: "Handler Seven" }] });
  await assignInquiryAutomatically(client, "REPAIR");
  const lockOrder = client.calls.map((call) => call.sql).filter((sql) => sql.includes("FOR UPDATE") || sql.includes("SELECT assigned_to AS handler_id"));
  assert.match(lockOrder[0], /assignment_state[\s\S]*FOR UPDATE/);
  assert.match(lockOrder[1], /FROM users[\s\S]*FOR UPDATE/);
  assert.match(lockOrder[2], /SELECT assigned_to AS handler_id/);
});
