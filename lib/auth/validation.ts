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
    displayName: z.string().trim().min(2).max(120),
    email,
    password,
    confirmPassword: password,
    privacyAccepted: z.literal("on"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
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
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30),
  locale: z.enum(["en-JM"]),
  timezone: z.enum(["America/Jamaica"]),
});

export const applicationSchema = z.object({
  brokerageId: z.string().uuid(),
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
