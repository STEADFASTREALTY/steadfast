"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveMembershipContext, requireInternalMfa } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function saveFeaturedBrokerageAction(formData: FormData) {
  const brokerageId = z.string().uuid().safeParse(formData.get("brokerageId"));
  const rankText = typeof formData.get("rank") === "string" ? String(formData.get("rank")).trim() : "";
  const rank = rankText ? z.coerce.number().int().min(1).max(4).safeParse(rankText) : null;
  if (!brokerageId.success || (rankText && !rank?.success)) redirect("/workspace/recommendations?error=Choose+a+rank+from+1+to+4.");
  const context = await getActiveMembershipContext("/workspace/recommendations");
  if (!context.platformRoles.some((role) => role === "steadfast_operations" || role === "steadfast_admin")) redirect("/access-denied?reason=platform-recommendations");
  await requireInternalMfa(context, "/workspace/recommendations");
  const admin = createAdminClient();
  if (!rankText) await admin.from("platform_featured_brokerages").delete().eq("brokerage_id", brokerageId.data);
  else { await admin.from("platform_featured_brokerages").delete().eq("display_rank", rank!.data); await admin.from("platform_featured_brokerages").upsert({ brokerage_id: brokerageId.data, display_rank: rank!.data, is_active: true, updated_at: new Date().toISOString() }); }
  revalidatePath("/"); revalidatePath("/workspace/recommendations"); redirect("/workspace/recommendations?notice=Recommended+brokerage+rank+saved.");
}
