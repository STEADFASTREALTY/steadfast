"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAppUrl } from "@/lib/app-url";
import { getActiveMembershipContext, requireAccount } from "@/lib/auth/session";
import {
  applicationSchema,
  decisionSchema,
  invitationAcceptanceSchema,
  invitationSchema,
  profileSchema,
} from "@/lib/auth/validation";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function updateProfileAction(formData: FormData) {
  const account = await requireAccount();
  const parsed = profileSchema.safeParse({
    displayName: readText(formData, "displayName"),
    phone: readText(formData, "phone"),
    locale: readText(formData, "locale"),
    timezone: readText(formData, "timezone"),
  });

  if (!parsed.success) redirect("/account?error=Please+check+your+profile+details.");

  const { error } = await account.supabase
    .from("people")
    .update({
      display_name: parsed.data.displayName,
      primary_phone: parsed.data.phone || null,
      locale: parsed.data.locale,
      timezone: parsed.data.timezone,
    })
    .eq("id", account.person.id);

  if (error) redirect("/account?error=Your+profile+could+not+be+updated.");
  redirect("/account?notice=Profile+updated.");
}

export async function submitAgentApplicationAction(formData: FormData) {
  const account = await requireAccount();
  const parsed = applicationSchema.safeParse({
    brokerageId: readText(formData, "brokerageId"),
  });

  if (!parsed.success) redirect("/account?error=Choose+a+valid+brokerage.");

  const { error } = await account.supabase
    .from("agent_application_commands")
    .insert({ brokerage_id: parsed.data.brokerageId });

  if (error) redirect("/account?error=Your+application+could+not+be+submitted.");
  redirect("/account?notice=Your+agent+application+was+sent+to+the+brokerage.");
}

export async function decideAgentApplicationAction(formData: FormData) {
  const context = await getActiveMembershipContext();
  if (!context.membership) redirect("/account?error=An+active+brokerage+membership+is+required.");

  const parsed = decisionSchema.safeParse({
    applicationId: readText(formData, "applicationId"),
    decision: readText(formData, "decision"),
    reason: readText(formData, "reason"),
  });

  if (!parsed.success) redirect("/broker/agents?error=Check+the+application+decision.");

  const { error } = await context.supabase
    .from("agent_application_decision_commands")
    .insert({
      application_id: parsed.data.applicationId,
      decision: parsed.data.decision,
      reason: parsed.data.reason || null,
    });

  if (error) redirect("/broker/agents?error=The+application+decision+could+not+be+saved.");
  revalidatePath("/broker/agents");
  redirect("/broker/agents?notice=Application+decision+saved.");
}

export type InvitationActionState = { error?: string; invitationLink?: string };

export async function createBrokerageInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const context = await getActiveMembershipContext();
  if (!context.membership) return { error: "An active brokerage membership is required." };

  const parsed = invitationSchema.safeParse({
    brokerageId: readText(formData, "brokerageId"),
    email: readText(formData, "email"),
    agent: readText(formData, "agent") || undefined,
    staff: readText(formData, "staff") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the invitation details." };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenDigest = createHash("sha256").update(token).digest("base64url");
  const roleKeys = [
    parsed.data.agent === "on" ? "agent" : null,
    parsed.data.staff === "on" ? "broker_staff" : null,
  ].filter((role): role is string => role !== null);

  const { error } = await context.supabase
    .from("brokerage_invitation_commands")
    .insert({
      brokerage_id: parsed.data.brokerageId,
      email: parsed.data.email,
      token_digest: tokenDigest,
      role_keys: roleKeys,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

  if (error) return { error: "The invitation could not be created." };
  revalidatePath("/broker/agents");
  return { invitationLink: `${getAppUrl()}/invite/accept?token=${token}` };
}

export async function acceptBrokerageInvitationAction(formData: FormData) {
  const account = await requireAccount();
  const parsed = invitationAcceptanceSchema.safeParse({ token: readText(formData, "token") });
  if (!parsed.success) redirect("/account?error=The+invitation+link+is+invalid.");

  const tokenDigest = createHash("sha256").update(parsed.data.token).digest("base64url");
  const { error } = await account.supabase
    .from("brokerage_invitation_acceptance_commands")
    .insert({ token_digest: tokenDigest });

  if (error) redirect("/account?error=This+invitation+could+not+be+accepted.");
  redirect("/account?notice=Welcome+to+your+brokerage.");
}
