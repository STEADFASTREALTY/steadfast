"use server";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSiteRichText } from "@/lib/sites/rich-text";

const sections = ["hero", "about", "search", "listings", "testimonials", "contact"] as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const contentSchema = z.object({
  aboutHtml: z.string().max(20000).optional().default(""),
  contactEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional(),
  strengths: z.string().trim().max(800).optional(),
});

function text(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value : ""; }

async function requireOwnedSite(siteId: string) {
  const context = await getActiveMembershipContext("/workspace/site");
  const admin = createAdminClient();
  const { data: site } = await admin.from("professional_sites")
    .select("id,slug,site_type,owner_person_id,owner_brokerage_id")
    .eq("id", siteId).maybeSingle();
  const ownsAgentSite = site?.owner_person_id === context.person.id;
  const ownsBrokerageSite = Boolean(site?.owner_brokerage_id && context.membership?.brokerage_id === site.owner_brokerage_id && context.roles.includes("broker"));
  if (!site || (!ownsAgentSite && !ownsBrokerageSite)) redirect("/access-denied?reason=site-builder");
  return { context, admin, site };
}

export async function saveSiteBuilderAction(formData: FormData) {
  const siteId = z.string().uuid().safeParse(text(formData, "siteId"));
  const sectionOrder = z.array(z.enum(sections)).length(sections.length).safeParse(JSON.parse(text(formData, "sectionOrder") || "[]"));
  const content = contentSchema.safeParse(JSON.parse(text(formData, "content") || "{}"));
  const theme = z.object({ primary: hex, accent: hex, background: hex, text: hex }).safeParse(JSON.parse(text(formData, "theme") || "{}"));
  if (!siteId.success || !sectionOrder.success || new Set(sectionOrder.data).size !== sections.length || !content.success || !theme.success) {
    redirect("/workspace/site?error=Please+check+your+website+settings.");
  }
  const { admin, site } = await requireOwnedSite(siteId.data);
  const safeContent = { ...content.data, aboutHtml: sanitizeSiteRichText(content.data.aboutHtml) };
  const { error } = await admin.from("professional_sites").update({
    layout: { sectionOrder: sectionOrder.data }, content: safeContent, theme: { ...theme.data, managedBy: "site-builder" },
  }).eq("id", site.id);
  if (error) redirect("/workspace/site?error=Your+website+could+not+be+saved.");
  revalidatePath(`/agents/${site.slug}`); revalidatePath(`/brokerages/${site.slug}`); revalidatePath(`/sites/${site.slug}`); revalidatePath("/workspace/site");
  redirect(`/workspace/site?notice=${encodeURIComponent("Website changes saved.")}`);
}

export async function uploadSiteAssetAction(formData: FormData) {
  const siteId = z.string().uuid().safeParse(text(formData, "siteId"));
  const placement = z.enum(["profile_photo", "brokerage_logo"]).safeParse(text(formData, "placement"));
  const file = formData.get("asset");
  if (!siteId.success || !placement.success || !(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    redirect("/workspace/site?error=Choose+a+JPEG,+PNG,+or+WebP+image+under+5+MB.");
  }
  const { admin, site } = await requireOwnedSite(siteId.data);
  let objectPath: string | null = null;
  let previous: { id: string; object_path: string }[] = [];
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { animated: false }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 128 || metadata.height < 128 || metadata.width * metadata.height > 40_000_000) throw new Error("invalid dimensions");
    const bytes = await image.resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const output = await sharp(bytes).metadata();
    const assetId = randomUUID(); const pathPlacement = placement.data.replaceAll("_", "-");
    objectPath = `${site.id}/${pathPlacement}/${assetId}.webp`;
    const { error: uploadError } = await admin.storage.from("professional-site-assets").upload(objectPath, bytes, { contentType: "image/webp", cacheControl: "0", upsert: false });
    if (uploadError) throw uploadError;
    const { data: existing, error: existingError } = await admin.from("site_assets").select("id,object_path").eq("site_id", site.id).eq("placement", placement.data).eq("status", "ready");
    if (existingError) throw existingError;
    previous = existing ?? [];
    if (previous.length) {
      const { error: retireError } = await admin.from("site_assets").update({ status: "removed", removed_at: new Date().toISOString() }).in("id", previous.map((item) => item.id));
      if (retireError) throw retireError;
    }
    const { error: insertError } = await admin.from("site_assets").insert({ id: assetId, site_id: site.id, placement: placement.data, object_path: objectPath, original_filename: file.name.slice(0, 180), byte_size: bytes.length, width: output.width, height: output.height });
    if (insertError) {
      if (previous.length) await admin.from("site_assets").update({ status: "ready", removed_at: null }).in("id", previous.map((item) => item.id));
      throw insertError;
    }
    if (previous?.length) {
      await admin.storage.from("professional-site-assets").remove(previous.map((item) => item.object_path));
    }
  } catch {
    if (objectPath) await admin.storage.from("professional-site-assets").remove([objectPath]);
    redirect("/workspace/site?error=The+image+could+not+be+prepared.+Use+a+clear+still+photograph+or+logo.");
  }
  revalidatePath(`/agents/${site.slug}`); revalidatePath(`/brokerages/${site.slug}`); revalidatePath("/workspace/site");
  redirect("/workspace/site?notice=Your+website+image+was+prepared+and+saved.");
}
