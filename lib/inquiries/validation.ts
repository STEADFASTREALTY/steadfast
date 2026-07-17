import { z } from "zod";

const phonePattern = /^[0-9+(). -]{7,30}$/;

export const createInquirySchema = z.object({
  requestId: z.string().uuid("This inquiry request is not valid."),
  listingId: z.string().uuid("This property is not available."),
  selectedAgentPersonId: z.string().uuid("The listing representative is not available."),
  requesterName: z.string().trim().min(2, "Enter your name.").max(120, "Your name is too long."),
  requesterEmail: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  requesterPhone: z.string().trim().max(30).refine(
    (value) => value === "" || phonePattern.test(value),
    "Enter a valid phone number.",
  ),
  contactPreference: z.enum(["email", "phone", "either"]),
  message: z.string().trim().min(10, "Tell the agent a little more about your inquiry.").max(2000, "Your message is too long."),
  consentToContact: z.literal("on", { error: "Confirm that the listing representative may contact you." }),
  website: z.string().max(200).default(""),
}).superRefine((value, context) => {
  if ((value.contactPreference === "phone" || value.contactPreference === "either") && !value.requesterPhone) {
    context.addIssue({ code: "custom", path: ["requesterPhone"], message: "Add a phone number for that contact preference." });
  }
});

export const inquiryStatusSchema = z.object({
  inquiryId: z.string().uuid("This inquiry is not valid."),
  operation: z.enum(["claim", "close", "reopen"]),
});

