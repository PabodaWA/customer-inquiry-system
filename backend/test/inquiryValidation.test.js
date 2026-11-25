const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const { createInquiry } = require("../src/controllers/inquiryController");

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const validInquiry = {
  customer_name: "Test Customer",
  contact: "+1 555 123 4567",
  customer_email: "",
  subject: "Order status",
  description: "A safe test inquiry description.",
  category: "GENERAL",
};

async function assertRejectedBeforeDatabase(t, body) {
  const originalConnect = pool.connect;
  pool.connect = async () => { throw new Error("Database should not be reached for invalid inquiry input."); };
  t.after(() => { pool.connect = originalConnect; });
  const response = mockResponse();

  await createInquiry({
    session: { user: { id: 42, role: "INTAKE" } },
    body,
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
}

test("inquiry creation rejects missing required fields", async (t) => {
  const body = { ...validInquiry };
  delete body.subject;
  await assertRejectedBeforeDatabase(t, body);
});

test("inquiry creation rejects invalid customer email and phone values", async (t) => {
  await assertRejectedBeforeDatabase(t, { ...validInquiry, customer_email: "not-an-email" });
  await assertRejectedBeforeDatabase(t, { ...validInquiry, contact: "not-a-phone" });
});

test("inquiry creation rejects malformed or unsupported evidence", async (t) => {
  await assertRejectedBeforeDatabase(t, {
    ...validInquiry,
    evidence_files: [{ name: "payload.exe", type: "application/octet-stream", data: "AA==" }],
  });
  await assertRejectedBeforeDatabase(t, {
    ...validInquiry,
    evidence_files: [{ name: "invalid.txt", type: "text/plain", data: "AA$=" }],
  });
});

test("inquiry creation rejects evidence larger than five megabytes", async (t) => {
  const tooLarge = Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64");
  await assertRejectedBeforeDatabase(t, {
    ...validInquiry,
    evidence_files: [{ name: "large.txt", type: "text/plain", data: tooLarge }],
  });
});

test("inquiry creation enforces three-file limits separately for images and documents", async (t) => {
  await assertRejectedBeforeDatabase(t, {
    ...validInquiry,
    evidence_files: Array.from({ length: 4 }, (_, index) => ({
      name: `image-${index}.png`,
      type: "image/png",
      data: "AQ==",
    })),
  });
});

test("inquiry creation rejects malformed categories before database access", async (t) => {
  await assertRejectedBeforeDatabase(t, { ...validInquiry, category: "x".repeat(41) });
});
