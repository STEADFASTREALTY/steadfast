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
const testimonialSchema = z.object({
  siteId: z.string().uuid(),
  authorName: z.string().trim().min(1).max(120),
  authorContext: z.string().trim().max(180).optional(),
  quote: z.string().trim().min(10).max(1200),
});
const testimonialEditSchema = testimonialSchema.extend({ testimonialId: z.string().uuid() });

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
    const preparedImage = new Blob([bytes], { type: "image/webp" });
    const { error: uploadError } = await admin.storage.from("professional-site-assets").upload(objectPath, preparedImage, { contentType: "image/webp", cacheControl: "0", upsert: false });
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

export async function createSiteTestimonialAction(formData: FormData) {
  const parsed = testimonialSchema.safeParse({ siteId: text(formData, "siteId"), authorName: text(formData, "authorName"), authorContext: text(formData, "authorContext"), quote: text(formData, "quote") });
  const file = formData.get("testimonialAsset");
  const hasFile = file instanceof File && file.size > 0;
  if (!parsed.success || (hasFile && (!(file instanceof File) || file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)))) redirect("/workspace/site?error=Check+the+testimonial+details+and+optional+image.");
  const { admin, site } = await requireOwnedSite(parsed.data.siteId);
  const { data: existing, error: existingError } = await admin.from("site_testimonials").select("id,position,asset_id,is_active").eq("site_id", site.id);
  if (existingError) redirect("/workspace/site?error=The+testimonial+could+not+be+saved.");
  const usedPositions = new Set((existing ?? []).filter((item) => item.is_active).map((item) => item.position));
  const position = Array.from({ length: 10 }, (_, index) => index + 1).find((value) => !usedPositions.has(value));
  if (!position) redirect("/workspace/site?error=You+can+display+up+to+ten+testimonials.");
  // A removed testimonial remains in the database so its history is retained. Its
  // unique display position can therefore be safely reused instead of trying to
  // insert a second row for the same site and position.
  const retiredTestimonial = (existing ?? []).find((item) => !item.is_active && item.position === position);
  let assetId: string | null = null;
  let objectPath: string | null = null;
  try {
    if (hasFile && file instanceof File) {
      const image = sharp(Buffer.from(await file.arrayBuffer()), { animated: false }).rotate();
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width < 128 || metadata.height < 128 || metadata.width * metadata.height > 40_000_000) throw new Error("invalid dimensions");
      const bytes = await image.resize({ width: 800, height: 800, fit: "cover", position: "attention", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
      const output = await sharp(bytes).metadata();
      assetId = randomUUID(); objectPath = `${site.id}/testimonial-photo/${assetId}.webp`;
      const { error: uploadError } = await admin.storage.from("professional-site-assets").upload(objectPath, new Blob([bytes], { type: "image/webp" }), { contentType: "image/webp", cacheControl: "0", upsert: false });
      if (uploadError) throw uploadError;
      const { error: assetError } = await admin.from("site_assets").insert({ id: assetId, site_id: site.id, placement: "testimonial_photo", object_path: objectPath, original_filename: file.name.slice(0, 180), byte_size: bytes.length, width: output.width, height: output.height });
      if (assetError) throw assetError;
    }
    const testimonialRecord = { author_name: parsed.data.authorName, author_context: parsed.data.authorContext || null, quote: parsed.data.quote, asset_id: assetId, position, is_active: true };
    const { error: testimonialError } = retiredTestimonial
      ? await admin.from("site_testimonials").update(testimonialRecord).eq("id", retiredTestimonial.id).eq("site_id", site.id)
      : await admin.from("site_testimonials").insert({ site_id: site.id, ...testimonialRecord });
    if (testimonialError) throw testimonialError;
    if (retiredTestimonial?.asset_id) {
      const { data: retiredAsset } = await admin.from("site_assets").select("object_path").eq("id", retiredTestimonial.asset_id).maybeSingle();
      await admin.from("site_assets").update({ status: "removed", removed_at: new Date().toISOString() }).eq("id", retiredTestimonial.asset_id);
      if (retiredAsset?.object_path) await admin.storage.from("professional-site-assets").remove([retiredAsset.object_path]);
    }
  } catch {
    if (assetId) await admin.from("site_assets").delete().eq("id", assetId);
    if (objectPath) await admin.storage.from("professional-site-assets").remove([objectPath]);
    redirect("/workspace/site?error=The+testimonial+or+image+could+not+be+saved.");
  }
  revalidatePath(`/agents/${site.slug}`); revalidatePath(`/brokerages/${site.slug}`); revalidatePath(`/sites/${site.slug}`); revalidatePath("/workspace/site");
  redirect("/workspace/site?notice=Testimonial+added+to+your+website.");
}

export async function removeSiteTestimonialAction(formData: FormData) {
  const siteId = z.string().uuid().safeParse(text(formData, "siteId"));
  const testimonialId = z.string().uuid().safeParse(text(formData, "testimonialId"));
  if (!siteId.success || !testimonialId.success) redirect("/workspace/site?error=The+testimonial+could+not+be+removed.");
  const { admin, site } = await requireOwnedSite(siteId.data);
  const { error } = await admin.from("site_testimonials").update({ is_active: false }).eq("id", testimonialId.data).eq("site_id", site.id);
  if (error) redirect("/workspace/site?error=The+testimonial+could+not+be+removed.");
  revalidatePath(`/agents/${site.slug}`); revalidatePath(`/brokerages/${site.slug}`); revalidatePath(`/sites/${site.slug}`); revalidatePath("/workspace/site");
  redirect("/workspace/site?notice=Testimonial+removed+from+your+website.");
}

export async function updateSiteTestimonialAction(formData: FormData) {
  const parsed = testimonialEditSchema.safeParse({ siteId: text(formData, "siteId"), testimonialId: text(formData, "testimonialId"), authorName: text(formData, "authorName"), authorContext: text(formData, "authorContext"), quote: text(formData, "quote") });
  const file = formData.get("testimonialAsset");
  const hasFile = file instanceof File && file.size > 0;
  if (!parsed.success || (hasFile && (!(file instanceof File) || file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)))) redirect("/workspace/site?error=Check+the+testimonial+details+and+optional+image.");
  const { admin, site } = await requireOwnedSite(parsed.data.siteId);
  const { data: testimonial, error: testimonialLookupError } = await admin.from("site_testimonials").select("id,asset_id").eq("id", parsed.data.testimonialId).eq("site_id", site.id).eq("is_active", true).maybeSingle();
  if (testimonialLookupError || !testimonial) redirect("/workspace/site?error=The+testimonial+could+not+be+found.");
  let newAssetId: string | null = null;
  let newObjectPath: string | null = null;
  try {
    if (hasFile && file instanceof File) {
      const image = sharp(Buffer.from(await file.arrayBuffer()), { animated: false }).rotate();
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width < 128 || metadata.height < 128 || metadata.width * metadata.height > 40_000_000) throw new Error("invalid dimensions");
      const bytes = await image.resize({ width: 800, height: 800, fit: "cover", position: "attention", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
      const output = await sharp(bytes).metadata();
      newAssetId = randomUUID(); newObjectPath = `${site.id}/testimonial-photo/${newAssetId}.webp`;
      const { error: uploadError } = await admin.storage.from("professional-site-assets").upload(newObjectPath, new Blob([bytes], { type: "image/webp" }), { contentType: "image/webp", cacheControl: "0", upsert: false });
      if (uploadError) throw uploadError;
      const { error: assetError } = await admin.from("site_assets").insert({ id: newAssetId, site_id: site.id, placement: "testimonial_photo", object_path: newObjectPath, original_filename: file.name.slice(0, 180), byte_size: bytes.length, width: output.width, height: output.height });
      if (assetError) throw assetError;
    }
    const { error: updateError } = await admin.from("site_testimonials").update({ author_name: parsed.data.authorName, author_context: parsed.data.authorContext || null, quote: parsed.data.quote, ...(newAssetId ? { asset_id: newAssetId } : {}) }).eq("id", testimonial.id).eq("site_id", site.id);
    if (updateError) throw updateError;
    if (newAssetId && testimonial.asset_id) {
      const { data: oldAsset } = await admin.from("site_assets").select("object_path").eq("id", testimonial.asset_id).maybeSingle();
      await admin.from("site_assets").update({ status: "removed", removed_at: new Date().toISOString() }).eq("id", testimonial.asset_id);
      if (oldAsset?.object_path) await admin.storage.from("professional-site-assets").remove([oldAsset.object_path]);
    }
  } catch {
    if (newAssetId) await admin.from("site_assets").delete().eq("id", newAssetId);
    if (newObjectPath) await admin.storage.from("professional-site-assets").remove([newObjectPath]);
    redirect("/workspace/site?error=The+testimonial+or+image+could+not+be+saved.");
  }
  revalidatePath(`/agents/${site.slug}`); revalidatePath(`/brokerages/${site.slug}`); revalidatePath(`/sites/${site.slug}`); revalidatePath("/workspace/site");
  redirect("/workspace/site?notice=Testimonial+updated+on+your+website.");
}
