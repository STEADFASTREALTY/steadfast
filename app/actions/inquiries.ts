"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createInquirySchema, inquiryStatusSchema } from "@/lib/inquiries/validation";
import { createClient } from "@/lib/supabase/server";
import { getActiveMembershipContext } from "@/lib/auth/session";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function propertyRedirect(listingId: string, kind: "error" | "notice", message: string): never {
  const safeId = /^[0-9a-f-]{36}$/i.test(listingId) ? listingId : "";
  redirect(safeId ? `/properties/${safeId}?${kind}=${encodeURIComponent(message)}#contact-agent` : "/properties");
}

export async function createInquiryAction(formData: FormData) {
  const input = {
    requestId: readText(formData, "requestId"),
    listingId: readText(formData, "listingId"),
    selectedAgentPersonId: readText(formData, "selectedAgentPersonId"),
    sourceSiteId: readText(formData, "sourceSiteId"),
    requesterName: readText(formData, "requesterName"),
    requesterEmail: readText(formData, "requesterEmail"),
    requesterPhone: readText(formData, "requesterPhone"),
    contactPreference: readText(formData, "contactPreference"),
    message: readText(formData, "message"),
    consentToContact: readText(formData, "consentToContact"),
    website: readText(formData, "website"),
  };
  const parsed = createInquirySchema.safeParse(input);
  if (!parsed.success) {
    propertyRedirect(input.listingId, "error", parsed.error.issues[0]?.message ?? "Check your contact details and try again.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("create_inquiry_commands").insert({
    request_id: parsed.data.requestId,
    listing_id: parsed.data.listingId,
    selected_agent_person_id: parsed.data.selectedAgentPersonId,
    source_site_id: parsed.data.sourceSiteId || null,
    requester_name: parsed.data.requesterName,
    requester_email: parsed.data.requesterEmail,
    requester_phone: parsed.data.requesterPhone || null,
    contact_preference: parsed.data.contactPreference,
    message: parsed.data.message,
    consent_version: "inquiry-contact-v1",
    consent_to_contact: true,
    source_surface: "marketplace",
    website: parsed.data.website,
  });

  if (error) {
    const isLimited = /wait|limit/i.test(error.message);
    propertyRedirect(parsed.data.listingId, "error", isLimited
      ? "Please wait before sending another inquiry."
      : "Your inquiry could not be sent. Please check the details and try again.");
  }

  revalidatePath(`/properties/${parsed.data.listingId}`);
  propertyRedirect(parsed.data.listingId, "notice", "Your inquiry was sent securely to the listing representative.");
}

export async function updateInquiryStatusAction(formData: FormData) {
  const parsed = inquiryStatusSchema.safeParse({
    inquiryId: readText(formData, "inquiryId"),
    operation: readText(formData, "operation"),
  });
  if (!parsed.success) redirect("/workspace/inquiries?error=That+inquiry+action+is+not+valid.");

  const context = await getActiveMembershipContext("/workspace/inquiries");
  const { error } = await context.supabase.from("inquiry_status_commands").insert({
    inquiry_id: parsed.data.inquiryId,
    operation: parsed.data.operation,
  });
  if (error) redirect("/workspace/inquiries?error=The+inquiry+could+not+be+updated.+Your+current+access+was+checked.");

  revalidatePath("/workspace/inquiries");
  revalidatePath("/account/notifications");
  redirect("/workspace/inquiries?notice=Inquiry+status+updated.");
}
