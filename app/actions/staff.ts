"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const actionSchema = z.object({
  requestId: z.string().uuid(),
  operation: z.enum(["process", "payment", "approve", "activate"]),
  notes: z.string().trim().max(2000),
});

export async function progressProfessionalRegistrationAction(formData: FormData) {
  const context = await getActiveMembershipContext("/staff/registrations");
  if (!context.platformRoles.some((role) => role === "steadfast_operations" || role === "steadfast_admin")) redirect("/access-denied?reason=platform-operations");
  const parsed = actionSchema.safeParse({ requestId: formData.get("requestId"), operation: formData.get("operation"), notes: formData.get("notes") ?? "" });
  if (!parsed.success) redirect("/staff/registrations?error=Check+the+registration+action.");

  const admin = createAdminClient();
  const { data: request } = await admin.from("professional_registration_requests").select("id,status,person_id,request_type,agent_mode").eq("id", parsed.data.requestId).maybeSingle();
  if (!request) redirect("/staff/registrations?error=Registration+request+not+found.");

  const allowed: Record<typeof parsed.data.operation, string[]> = {
    process: ["submitted", "brokerage_approved"],
    payment: ["processing"],
    approve: ["payment_pending"],
    activate: ["approved"],
  };
  if (!allowed[parsed.data.operation].includes(request.status)) redirect("/staff/registrations?error=That+step+is+not+available+for+this+request.");
  if (parsed.data.operation === "process" && request.request_type === "agent" && request.agent_mode !== "independent" && request.status !== "brokerage_approved") redirect("/staff/registrations?error=The+brokerage+must+approve+an+agent+before+ProperAP+can+process+the+request.");

  const next = parsed.data.operation === "process" ? "processing" : parsed.data.operation === "payment" ? "payment_pending" : parsed.data.operation === "approve" ? "approved" : "active";
  const update: Record<string, unknown> = { status: next };
  if (parsed.data.operation === "process") Object.assign(update, { processed_by_person_id: context.person.id, processed_at: new Date().toISOString(), process_notes: parsed.data.notes || null });
  if (parsed.data.operation === "payment") Object.assign(update, { payment_recorded_by_person_id: context.person.id, payment_recorded_at: new Date().toISOString(), payment_reference: parsed.data.notes || null });
  if (parsed.data.operation === "approve") Object.assign(update, { properap_decided_by: context.person.id, properap_decided_at: new Date().toISOString(), decision_reason: parsed.data.notes || null });
  if (parsed.data.operation === "activate") {
    await admin.from("people").update({ account_status: "active" }).eq("id", request.person_id);
    if (request.request_type === "agent" && request.agent_mode === "independent") {
      await admin.from("independent_agent_profiles").update({ status: "active", activated_at: new Date().toISOString(), deactivated_at: null }).eq("person_id", request.person_id);
    }
  }
  const { error } = await admin.from("professional_registration_requests").update(update).eq("id", request.id);
  if (error) redirect("/staff/registrations?error=The+registration+could+not+be+updated.");
  await admin.from("audit_events").insert({ actor_person_id: context.person.id, effective_role_key: "steadfast_operations", action: `professional_registration.${next}`, target_type: "professional_registration_request", target_id: request.id, source: "web", correlation_id: crypto.randomUUID(), reason: parsed.data.notes || null, after_summary: { status: next } });
  revalidatePath("/staff"); revalidatePath("/staff/registrations");
  redirect(`/staff/registrations?notice=${encodeURIComponent(`Registration moved to ${next.replaceAll("_", " ")}.`)}`);
}
