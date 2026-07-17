import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { commonsCategoryApi, demoListings, DEMO_NOTICE, REALTOR_SOURCE } from "./demo-listings.mjs";

function loadEnvironment(path = ".env.production.local") {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1].trim()] = value.replaceAll("\\n", "\n");
  }
}

loadEnvironment();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Missing Supabase production environment variables.");
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const label = "john-karen-jamaica-market-demo-v1";
const password = "SteadFastDemo26!";
const now = new Date().toISOString();

function sha(value) { return createHash("sha256").update(value).digest("hex"); }
async function expect(query, context) { const result = await query; if (result.error) throw new Error(`${context}: ${result.error.message}`); return result.data; }
async function insert(table, row) { return expect(db.from(table).insert(row).select().single(), `insert ${table}`); }
async function record(batchId, recordType, recordId, sourceUrl = null, sourceLicense = null) {
  await expect(db.from("demo_data_records").insert({ batch_id: batchId, record_type: recordType, record_id: recordId, source_url: sourceUrl, source_license: sourceLicense }), `record ${recordType}`);
}

async function createUser(email, displayName) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName, demo_account: true } });
  if (error) throw new Error(`create ${displayName}: ${error.message}`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const person = await expect(db.from("people").select("id,auth_user_id").eq("auth_user_id", data.user.id).maybeSingle(), `load ${displayName}`);
    if (person) return { user: data.user, person };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Profile trigger did not create ${displayName}.`);
}

async function licensedImages() {
  const response = await fetch(commonsCategoryApi, { headers: { "User-Agent": "SteadFastRealtyDemo/1.0 (contact@lincanada.com)" } });
  if (!response.ok) throw new Error(`Wikimedia returned ${response.status}.`);
  const payload = await response.json();
  return Object.values(payload.query.pages).sort((a, b) => a.title.localeCompare(b.title)).map((page) => {
    const info = page.imageinfo[0];
    return { title: page.title, url: info.url, pageUrl: info.descriptionurl, license: info.extmetadata?.LicenseShortName?.value ?? "See source", artist: info.extmetadata?.Artist?.value ?? "Wikimedia Commons contributor" };
  });
}

const existing = await expect(db.from("demo_data_batches").select("id").eq("label", label).eq("status", "active").maybeSingle(), "check existing demo batch");
if (existing) throw new Error(`Demo batch already exists: ${existing.id}. Delete that recorded batch before recreating it.`);
const batch = await insert("demo_data_batches", { label, delete_after: "2026-09-30T23:59:59Z" });

try {
  const john = await createUser("john.stamp.demo@steadfast.test", "John Stamp");
  const karen = await createUser("karen.stamp.demo@steadfast.test", "Karen Blake");
  await record(batch.id, "auth_user", john.user.id);
  await record(batch.id, "auth_user", karen.user.id);
  await record(batch.id, "person", john.person.id);
  await record(batch.id, "person", karen.person.id);

  const country = await expect(db.from("countries").select("id").eq("code", "JM").single(), "load Jamaica");
  const brokerage = await insert("brokerages", { slug: "stamp-shore-realty", legal_name: "Stamp & Shore Realty Demo Limited", display_name: "Stamp & Shore Realty", status: "active", country_id: country.id, branding: { demo: true } });
  await record(batch.id, "brokerage", brokerage.id);

  const johnMembership = await insert("brokerage_memberships", { brokerage_id: brokerage.id, person_id: john.person.id, status: "active", starts_at: now, approved_by_person_id: john.person.id, reason: "Recorded demonstration account" });
  const karenMembership = await insert("brokerage_memberships", { brokerage_id: brokerage.id, person_id: karen.person.id, status: "active", starts_at: now, approved_by_person_id: john.person.id, reason: "Recorded demonstration account" });
  await record(batch.id, "brokerage_membership", johnMembership.id);
  await record(batch.id, "brokerage_membership", karenMembership.id);
  await expect(db.from("membership_roles").insert([
    { membership_id: johnMembership.id, brokerage_id: brokerage.id, role_key: "broker", granted_by_person_id: john.person.id },
    { membership_id: johnMembership.id, brokerage_id: brokerage.id, role_key: "agent", granted_by_person_id: john.person.id },
    { membership_id: karenMembership.id, brokerage_id: brokerage.id, role_key: "agent", granted_by_person_id: john.person.id },
    { membership_id: karenMembership.id, brokerage_id: brokerage.id, role_key: "broker_staff", granted_by_person_id: john.person.id },
  ]), "assign demo roles");
  for (const permission of ["listing.review", "listing.manage", "agent.manage", "inquiry.manage", "audit.view"]) {
    await expect(db.from("membership_permissions").insert({ membership_id: karenMembership.id, permission_key: permission, effect: "allow", granted_by_person_id: john.person.id, reason: "Broker staff demonstration access" }), `grant ${permission}`);
  }

  await expect(db.from("professional_profiles").upsert([
    { person_id: john.person.id, public_slug: "john-stamp", bio: "Principal broker and property representative serving Jamaica.", service_areas: ["Jamaica"], license_status: "broker_verified", public_contact_preferences: { inquiry_form: true } },
    { person_id: karen.person.id, public_slug: "karen-blake", bio: "Agent and delegated brokerage staff member supporting buyers and sellers.", service_areas: ["Jamaica"], license_status: "broker_verified", public_contact_preferences: { inquiry_form: true } },
  ]), "create professional profiles");
  const brokerageSite = await insert("professional_sites", { site_type: "brokerage", owner_brokerage_id: brokerage.id, slug: "stamp-shore-realty", display_name: "Stamp & Shore Realty", headline: "Brokerage-approved property opportunities across Jamaica.", bio: "A recorded SteadFast demonstration brokerage portfolio.", theme: { accent: "gold", demo: true } });
  const johnSite = await insert("professional_sites", { site_type: "agent", owner_person_id: john.person.id, slug: "john-stamp", display_name: "John Stamp", headline: "Clear guidance for Jamaican property decisions.", bio: "Principal broker and property representative at Stamp & Shore Realty.", theme: { accent: "evergreen", demo: true } });
  const karenSite = await insert("professional_sites", { site_type: "agent", owner_person_id: karen.person.id, slug: "karen-blake", display_name: "Karen Blake", headline: "Professional support for your next property move.", bio: "Agent and brokerage staff member at Stamp & Shore Realty.", theme: { accent: "teal", demo: true } });
  for (const site of [brokerageSite, johnSite, karenSite]) await record(batch.id, "professional_site", site.id);
  for (const [site, host] of [[brokerageSite, "stamp-shore-realty"], [johnSite, "john-stamp"], [karenSite, "karen-blake"]]) {
    const domain = await insert("site_domains", { site_id: site.id, hostname: `${host}.steadfast.rockhillinnovation.com`, verification_status: "verified", verified_at: now, is_primary: true });
    await record(batch.id, "site_domain", domain.id);
  }

  const images = await licensedImages();
  const areas = await expect(db.from("administrative_areas").select("id,code,name").in("code", [...new Set(demoListings.map((item) => item.parishCode))]), "load parishes");
  const createdListings = [];

  for (let index = 0; index < demoListings.length; index += 1) {
    const item = demoListings[index];
    const owner = item.agent === "john" ? john : karen;
    const membership = item.agent === "john" ? johnMembership : karenMembership;
    const area = areas.find((candidate) => candidate.code === item.parishCode);
    if (!area) throw new Error(`Missing parish ${item.parishCode}.`);
    const location = `POINT(${item.lng} ${item.lat})`;
    const address = await insert("property_addresses", { country_id: country.id, administrative_area_id: area.id, address_line_1: `${item.locality} area (demo, approximate)`, normalized_address: `${item.locality.toLowerCase()} demo ${item.parishCode}`, location, geocode_provider: "demo-area-centroid", geocode_confidence: 0.25 });
    await record(batch.id, "property_address", address.id, REALTOR_SOURCE, "Public market facts; coordinates are approximate area centroids");
    const property = await insert("properties", { created_by_brokerage_id: brokerage.id, property_type: item.type, address_id: address.id, address_fingerprint: sha(`${batch.id}:${index}:${item.locality}`) });
    await record(batch.id, "property", property.id, REALTOR_SOURCE, "Public market facts");
    const listing = await insert("listings", { brokerage_id: brokerage.id, property_id: property.id, lifecycle_state: "draft", created_by_person_id: owner.person.id });
    await record(batch.id, "listing", listing.id, REALTOR_SOURCE, "Public market facts; original SteadFast summary");
    const assignment = await insert("listing_assignments", { listing_id: listing.id, brokerage_id: brokerage.id, agent_membership_id: membership.id, status: "active", starts_at: now, assigned_by_person_id: john.person.id, reason: "Demo representative assignment" });
    await record(batch.id, "listing_assignment", assignment.id);
    const versionId = randomUUID();
    const description = `${item.description} ${DEMO_NOTICE}`;
    await expect(db.from("listing_versions").insert({ id: versionId, listing_id: listing.id, version_number: 1, revision_state: "approved", submitted_by_person_id: owner.person.id, submitted_at: now, frozen_at: now, approved_at: now, purpose: "sale", property_type: item.type, property_subtype: item.subtype, requested_lifecycle_state: "active", currency: item.currency, price: item.price, title: item.title, description, bedrooms: item.beds, bathrooms: item.baths, building_area: item.building, land_area: item.land, area_unit: "sq_ft", visibility: "public", public_location_precision: "area", public_location_label: `${item.locality}, ${item.parish}`, public_location: location, attributes: { demo: true, factual_source: REALTOR_SOURCE }, content_hash: sha(JSON.stringify(item)), changed_fields: ["initial_demo_record"], created_by_person_id: owner.person.id }), "insert listing version");
    await record(batch.id, "listing_version", versionId, REALTOR_SOURCE, "Original SteadFast summary of public market facts");
    const review = await insert("listing_reviews", { listing_version_id: versionId, reviewer_person_id: owner.person.id, reviewer_membership_id: membership.id, decision: "approved", comment: "Approved as an explicitly recorded simulation.", is_self_approval: true });
    await record(batch.id, "listing_review", review.id);
    await expect(db.from("listings").update({ lifecycle_state: "active", current_approved_version_id: versionId, current_assignment_id: assignment.id, published_at: now }).eq("id", listing.id), "activate listing");

    const image = images[index % images.length];
    const imageResponse = await fetch(image.url, { headers: { "User-Agent": "SteadFastRealtyDemo/1.0 (contact@lincanada.com)" } });
    if (!imageResponse.ok) throw new Error(`Image download failed: ${imageResponse.status}`);
    const sourceBytes = Buffer.from(await imageResponse.arrayBuffer());
    const originalBytes = await sharp(sourceBytes).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const metadata = await sharp(originalBytes).metadata();
    const mediaId = randomUUID();
    const originalPath = `${brokerage.id}/${listing.id}/${mediaId}/compressed-original.webp`;
    await expect(db.storage.from("listing-originals").upload(originalPath, originalBytes, { contentType: "image/webp", upsert: false, cacheControl: "0" }), "upload compressed original");
    await expect(db.from("listing_media").insert({ id: mediaId, listing_id: listing.id, brokerage_id: brokerage.id, object_path: originalPath, original_filename: "demo-licensed-image.webp", declared_mime_type: "image/webp", detected_mime_type: "image/webp", declared_byte_size: originalBytes.length, actual_byte_size: originalBytes.length, width: metadata.width, height: metadata.height, status: "ready", uploaded_by_person_id: owner.person.id, validated_at: now }), "insert listing media");
    await record(batch.id, "listing_media", mediaId, image.pageUrl, `${image.license}; ${image.artist}`);
    await expect(db.from("listing_version_media").insert({ listing_version_id: versionId, listing_id: listing.id, media_id: mediaId, position: 1, caption: `Illustrative licensed Jamaican property image: ${image.title}` }), "link listing media");

    let cardDerivative;
    for (const variant of [{ name: "thumbnail", width: 480 }, { name: "card", width: 960 }, { name: "gallery", width: 1600 }]) {
      const bytes = await sharp(originalBytes).resize({ width: variant.width, height: variant.width, fit: "inside", withoutEnlargement: true }).webp({ quality: variant.name === "gallery" ? 82 : 78 }).toBuffer();
      const info = await sharp(bytes).metadata();
      const derivativeId = randomUUID();
      const objectPath = `${listing.id}/${mediaId}/${variant.name}-${sha(bytes).slice(0, 16)}.webp`;
      await expect(db.storage.from("listing-public-derivatives").upload(objectPath, bytes, { contentType: "image/webp", upsert: false, cacheControl: "31536000" }), `upload ${variant.name}`);
      await expect(db.from("listing_media_derivatives").insert({ id: derivativeId, listing_id: listing.id, media_id: mediaId, variant: variant.name, object_path: objectPath, byte_size: bytes.length, width: info.width, height: info.height, content_hash: sha(bytes) }), `insert ${variant.name} derivative`);
      await record(batch.id, "listing_media_derivative", derivativeId, image.pageUrl, `${image.license}; privacy-safe re-encoded derivative`);
      const publicMedia = await insert("public_listing_media", { listing_id: listing.id, approved_version_id: versionId, media_id: mediaId, derivative_id: derivativeId, variant: variant.name, position: 1, width: info.width, height: info.height });
      await record(batch.id, "public_listing_media", publicMedia.id, image.pageUrl, image.license);
      if (variant.name === "card") cardDerivative = derivativeId;
    }

    await expect(db.from("public_listing_snapshots").insert({ listing_id: listing.id, approved_version_id: versionId, brokerage_id: brokerage.id, brokerage_name: brokerage.display_name, brokerage_slug: brokerage.slug, assigned_agent_person_id: owner.person.id, assigned_agent_name: owner === john ? "John Stamp" : "Karen Blake", assigned_agent_slug: owner === john ? "john-stamp" : "karen-blake", lifecycle_state: "active", purpose: "sale", property_type: item.type, property_subtype: item.subtype, currency: item.currency, price: item.price, title: item.title, description, bedrooms: item.beds, bathrooms: item.baths, building_area: item.building, land_area: item.land, area_unit: "sq_ft", administrative_area_id: area.id, administrative_area_code: area.code, administrative_area_name: area.name, public_location_precision: "area", public_location_label: `${item.locality}, ${item.parish}`, public_latitude: item.lat, public_longitude: item.lng, ready_media_count: 1, published_at: now, updated_at: now, is_demo: true, demo_notice: DEMO_NOTICE, source_url: REALTOR_SOURCE }), "publish snapshot");
    createdListings.push({ id: listing.id, ownerPersonId: owner.person.id, cardDerivative });
  }

  const johnListing = createdListings.find((item) => item.ownerPersonId === john.person.id);
  const share = await insert("listing_shares", { listing_id: johnListing.id, owner_agent_person_id: john.person.id, displaying_agent_person_id: karen.person.id, granted_by_person_id: john.person.id, status: "active" });
  await record(batch.id, "listing_share", share.id);
  console.log(JSON.stringify({ batchId: batch.id, brokerage: "/brokerages/stamp-shore-realty", john: { email: "john.stamp.demo@steadfast.test", password, site: "/agents/john-stamp" }, karen: { email: "karen.stamp.demo@steadfast.test", password, site: "/agents/karen-blake" }, listings: createdListings.length }, null, 2));
} catch (error) {
  console.error(`Demo creation stopped. Partial records remain tagged under batch ${batch.id}.`);
  throw error;
}
