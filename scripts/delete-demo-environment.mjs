import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  process.env[match[1].trim()] = value.replaceAll("\\n", "\n");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Missing Supabase production environment variables.");
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const confirmation = process.argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length);
if (!confirmation) throw new Error("Refusing to delete without --confirm=<demo-batch-uuid>.");

async function expect(query, context) { const result = await query; if (result.error) throw new Error(`${context}: ${result.error.message}`); return result.data; }
const batch = await expect(db.from("demo_data_batches").select("id,label,status").eq("id", confirmation).single(), "load demo batch");
if (batch.status !== "active") throw new Error(`Batch ${batch.id} is already ${batch.status}.`);
const records = await expect(db.from("demo_data_records").select("record_type,record_id").eq("batch_id", batch.id), "load demo ledger");
const ids = (type) => records.filter((record) => record.record_type === type).map((record) => record.record_id);

const mediaIds = ids("listing_media");
const derivativeIds = ids("listing_media_derivative");
if (mediaIds.length) {
  const media = await expect(db.from("listing_media").select("object_path").in("id", mediaIds), "load original object paths");
  const paths = media.map((item) => item.object_path);
  if (paths.length) await expect(db.storage.from("listing-originals").remove(paths), "remove compressed originals");
}
if (derivativeIds.length) {
  const derivatives = await expect(db.from("listing_media_derivatives").select("object_path").in("id", derivativeIds), "load derivative paths");
  const paths = derivatives.map((item) => item.object_path);
  if (paths.length) await expect(db.storage.from("listing-public-derivatives").remove(paths), "remove public derivatives");
}

async function removeById(table, type, column = "id") {
  const values = ids(type);
  if (values.length) await expect(db.from(table).delete().in(column, values), `delete ${table}`);
}

const listingIds = ids("listing");
if (listingIds.length) {
  await expect(db.from("listings").update({ current_approved_version_id: null, current_assignment_id: null }).in("id", listingIds), "detach listing pointers");
  await expect(db.from("public_listing_snapshots").delete().in("listing_id", listingIds), "delete snapshots");
  await expect(db.from("publication_records").delete().in("listing_id", listingIds), "delete publication records");
  await expect(db.from("listing_version_media").delete().in("listing_id", listingIds), "delete version media links");
}
await removeById("listing_shares", "listing_share");
await removeById("public_listing_media", "public_listing_media");
await removeById("listing_media_derivatives", "listing_media_derivative");
await removeById("listing_media", "listing_media");
await removeById("listing_reviews", "listing_review");
await removeById("listing_versions", "listing_version");
await removeById("listing_assignments", "listing_assignment");
await removeById("listings", "listing");
await removeById("properties", "property");
await removeById("property_addresses", "property_address");
await removeById("professional_sites", "professional_site");
await removeById("brokerage_memberships", "brokerage_membership");
await removeById("brokerages", "brokerage");
await removeById("people", "person");
for (const userId of ids("auth_user")) {
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(`delete auth user: ${error.message}`);
}
await expect(db.from("demo_data_batches").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", batch.id), "close demo batch");
console.log(JSON.stringify({ batchId: batch.id, label: batch.label, status: "deleted", recordedItems: records.length }, null, 2));
