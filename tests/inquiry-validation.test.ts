import assert from "node:assert/strict";
import test from "node:test";
import { createInquirySchema, inquiryStatusSchema } from "../lib/inquiries/validation";

const validInquiry = {
  requestId: "10000000-0000-4000-8000-000000000001",
  listingId: "10000000-0000-4000-8000-000000000002",
  selectedAgentPersonId: "10000000-0000-4000-8000-000000000003",
  sourceSiteId: "",
  requesterName: "  Visitor Person  ",
  requesterEmail: "  VISITOR@EXAMPLE.TEST  ",
  requesterPhone: "",
  contactPreference: "email",
  message: "  I would like to arrange a property viewing.  ",
  consentToContact: "on",
  website: "",
};

test("normalizes bounded inquiry contact input", () => {
  const parsed = createInquirySchema.parse(validInquiry);
  assert.equal(parsed.requesterName, "Visitor Person");
  assert.equal(parsed.requesterEmail, "visitor@example.test");
  assert.equal(parsed.message, "I would like to arrange a property viewing.");
});

test("requires a phone number when the visitor requests a phone response", () => {
  const parsed = createInquirySchema.safeParse({ ...validInquiry, contactPreference: "phone" });
  assert.equal(parsed.success, false);
});

test("rejects consent, honeypot, and status values outside the command contract", () => {
  assert.equal(createInquirySchema.safeParse({ ...validInquiry, consentToContact: "" }).success, false);
  assert.equal(createInquirySchema.safeParse({ ...validInquiry, website: "x".repeat(201) }).success, false);
  assert.equal(inquiryStatusSchema.safeParse({ inquiryId: validInquiry.requestId, operation: "delete" }).success, false);
});
