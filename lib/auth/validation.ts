import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(320);
const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Password is too long.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a number.");

export const signInSchema = z.object({
  email,
  password,
  rememberDevice: z.literal("on").optional(),
});

export const signOutSchema = z.object({
  scope: z.enum(["local", "global", "others"]),
});

export const forgotPasswordSchema = z.object({ email });

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    requestedRole: z.enum(["consumer", "agent", "broker"]),
    agentMode: z.enum(["brokerage", "independent"]),
    contactPhone: z.string().trim().max(30),
    contactAddress: z.string().trim().max(500),
    brokerageId: z.string().uuid().optional().or(z.literal("")),
    brokerageName: z.string().trim().max(160),
    email,
    password,
    confirmPassword: password,
    privacyAccepted: z.literal("on"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  }).superRefine((value, context) => {
    if (value.requestedRole === "consumer") return;
    if (value.contactPhone.length < 7) context.addIssue({ code: "custom", path: ["contactPhone"], message: "Enter a valid contact number." });
    if (value.contactAddress.length < 8) context.addIssue({ code: "custom", path: ["contactAddress"], message: "Enter your business address." });
    if (value.requestedRole === "agent" && value.agentMode === "brokerage" && !value.brokerageId) context.addIssue({ code: "custom", path: ["brokerageId"], message: "Choose the brokerage that referred you." });
    if (value.requestedRole === "broker" && value.brokerageName.length < 2) context.addIssue({ code: "custom", path: ["brokerageName"], message: "Enter your brokerage name." });
  });

export const passwordSetupSchema = z
  .object({
    password,
    confirmPassword: password,
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30),
  locale: z.enum(["en-JM"]),
  timezone: z.enum(["America/Jamaica"]),
});

export const applicationSchema = z.object({
  brokerageId: z.string().uuid(),
});

export const professionalUpgradeSchema = z
  .object({
    requestedRole: z.enum(["agent", "broker"]),
    contactPhone: z.string().trim().min(7, "Enter a valid contact number.").max(30),
    contactAddress: z.string().trim().min(8, "Enter your business address.").max(500),
    brokerageId: z.string().uuid().optional().or(z.literal("")),
    brokerageName: z.string().trim().max(160),
  })
  .superRefine((value, context) => {
    if (value.requestedRole === "agent" && !value.brokerageId) {
      context.addIssue({ code: "custom", path: ["brokerageId"], message: "Choose the brokerage you want to join." });
    }
    if (value.requestedRole === "broker" && value.brokerageName.length < 2) {
      context.addIssue({ code: "custom", path: ["brokerageName"], message: "Enter your brokerage name." });
    }
  });

export const decisionSchema = z
  .object({
    applicationId: z.string().uuid(),
    decision: z.enum(["approve", "deny"]),
    reason: z.string().trim().max(2000),
  })
  .refine((value) => value.decision !== "deny" || value.reason.length > 0, {
    message: "Please provide a reason when declining an application.",
    path: ["reason"],
  });

export const invitationSchema = z.object({
  brokerageId: z.string().uuid(),
  email,
  agent: z.enum(["on"]).optional(),
  staff: z.enum(["on"]).optional(),
}).refine((value) => value.agent === "on" || value.staff === "on", {
  message: "Choose at least one role.",
});

export const invitationAcceptanceSchema = z.object({
  token: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
});

export const staffCapabilitySchema = z.object({
  membershipId: z.string().uuid(),
  permissionKey: z.enum([
    "listing.review",
    "listing.manage",
    "listing.reassign",
    "agent.manage",
    "staff.manage_limited",
    "brokerage.profile",
    "inquiry.manage",
    "report.view",
    "audit.view",
    "billing.view",
    "integration.manage",
  ]),
  operation: z.enum(["grant", "revoke"]),
  reason: z.string().trim().max(1000),
});

export const agentDepartureSchema = z.object({
  membershipId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  confirmation: z.literal("on"),
});
