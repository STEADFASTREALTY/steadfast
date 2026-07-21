"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { getAppUrl, safeInternalPath } from "@/lib/app-url";
import {
  forgotPasswordSchema,
  passwordSetupSchema,
  registerSchema,
  signInSchema,
  signOutSchema,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/auth/session";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function steadfastCookieDomain() {
  const host = (await headers()).get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  return host === "properap.com" || host?.endsWith(".properap.com")
    ? ".properap.com"
    : undefined;
}

export async function signInAction(formData: FormData) {
  const parsed = signInSchema.safeParse({
    email: readText(formData, "email"),
    password: readText(formData, "password"),
    rememberDevice: readText(formData, "rememberDevice") || undefined,
  });
  const next = safeInternalPath(readText(formData, "next"));

  if (!parsed.success) {
    redirect(`/sign-in?error=Enter+a+valid+email+and+password.&next=${encodeURIComponent(next)}`);
  }

  const rememberDevice = parsed.data.rememberDevice === "on";
  const cookieStore = await cookies();
  const cookieDomain = await steadfastCookieDomain();
  if (rememberDevice) {
    cookieStore.set("sf_remember_device", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 400 * 24 * 60 * 60,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
  } else {
    cookieStore.delete("sf_remember_device");
    if (cookieDomain) cookieStore.delete({ name: "sf_remember_device", domain: cookieDomain });
  }

  const supabase = await createClient({ persistentSession: rememberDevice, cookieDomain });
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    redirect(`/sign-in?error=We+could+not+sign+you+in+with+those+details.&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function registerAction(formData: FormData) {
  const next = safeInternalPath(readText(formData, "next"));
  const parsed = registerSchema.safeParse({
    firstName: readText(formData, "firstName"),
    lastName: readText(formData, "lastName"),
    requestedRole: readText(formData, "requestedRole"),
    agentMode: readText(formData, "agentMode") || "brokerage",
    contactPhone: readText(formData, "contactPhone"),
    contactAddress: readText(formData, "contactAddress"),
    brokerageId: readText(formData, "brokerageId"),
    brokerageName: readText(formData, "brokerageName"),
    email: readText(formData, "email"),
    password: readText(formData, "password"),
    confirmPassword: readText(formData, "confirmPassword"),
    privacyAccepted: readText(formData, "privacyAccepted"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the registration form.";
    redirect(`/register?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`);
  }

  const registrationMetadata = {
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    display_name: `${parsed.data.firstName} ${parsed.data.lastName}`,
    requested_role: parsed.data.requestedRole,
    agent_mode: parsed.data.requestedRole === "agent" ? parsed.data.agentMode : undefined,
    contact_phone: parsed.data.contactPhone,
    contact_address: parsed.data.contactAddress,
    brokerage_id: parsed.data.requestedRole === "agent" && parsed.data.agentMode === "brokerage" ? parsed.data.brokerageId || undefined : undefined,
    brokerage_name: parsed.data.brokerageName || undefined,
  };
  const admin = createAdminClient();
  if (parsed.data.requestedRole === "broker") {
    const { data: available, error: availabilityError } = await admin.rpc("brokerage_name_is_available", {
      candidate: parsed.data.brokerageName,
    });
    if (availabilityError || available !== true) {
      redirect(`/register?error=${encodeURIComponent("That brokerage name is already registered or awaiting ProperAP review. Please use the company’s existing account or contact ProperAP support.")}&next=${encodeURIComponent(next)}`);
    }
  }
  const { error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: registrationMetadata,
  });

  if (createError) {
    if (createError.message.toLowerCase().includes("brokerage with this name")) {
      redirect(`/register?error=${encodeURIComponent("That brokerage name is already registered or awaiting ProperAP review. Please use the company’s existing account or contact ProperAP support.")}&next=${encodeURIComponent(next)}`);
    }
    redirect(`/register?error=Registration+could+not+be+completed.+Please+try+again.&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (signInError) {
    redirect(`/sign-in?error=Your+account+was+created,+but+we+could+not+start+your+session.+Please+sign+in.&next=${encodeURIComponent(next)}`);
  }

  if (parsed.data.requestedRole !== "consumer") {
    redirect("/account?notice=Your+professional+registration+has+been+submitted.+ProperAP+will+notify+you+when+activation+is+complete.");
  }
  redirect(next);
}

export async function signOutAction(formData: FormData) {
  const parsed = signOutSchema.safeParse({ scope: readText(formData, "scope") });
  if (!parsed.success) redirect("/account/security?error=Choose+a+valid+sign-out+option.");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: parsed.data.scope });
  if (parsed.data.scope === "others") {
    redirect("/account/security?notice=Other+device+sessions+have+been+signed+out.");
  }
  const cookieStore = await cookies();
  const cookieDomain = await steadfastCookieDomain();
  cookieStore.delete("sf_remember_device");
  if (cookieDomain) cookieStore.delete({ name: "sf_remember_device", domain: cookieDomain });
  redirect(`/sign-in?notice=${parsed.data.scope === "global" ? "You+have+been+signed+out+on+all+machines." : "You+have+been+signed+out+on+this+machine."}`);
}

export async function forgotPasswordAction(formData: FormData) {
  const parsed = forgotPasswordSchema.safeParse({
    email: readText(formData, "email"),
  });

  if (!parsed.success) {
    redirect("/forgot-password?error=Enter+a+valid+email+address.");
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getAppUrl()}/auth/callback?next=%2Fset-password`,
  });

  // Always return the same response so this form cannot reveal registered emails.
  redirect("/forgot-password?sent=1");
}

export async function setPasswordAction(formData: FormData) {
  const parsed = passwordSetupSchema.safeParse({
    password: readText(formData, "password"),
    confirmPassword: readText(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the password fields.";
    redirect(`/set-password?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/sign-in?error=Your+invitation+session+has+expired.+Please+request+a+new+invitation.");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    redirect("/set-password?error=Your+password+could+not+be+saved.+Please+try+again.");
  }

  await supabase.auth.signOut({ scope: "others" });

  redirect("/account?notice=Your+password+has+been+updated.");
}

export async function requestEmailVerificationAction() {
  const account = await requireAccount("/account/security");
  if (!account.person.primary_email) {
    redirect("/account/security?error=Add+an+email+address+to+your+profile+before+verifying+it.");
  }
  if (account.person.email_verified_at) {
    redirect("/account/security?notice=Your+email+address+is+already+verified.");
  }

  const { error } = await account.supabase.auth.signInWithOtp({
    email: account.person.primary_email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=%2Faccount%2Fsecurity&email_verification=1`,
    },
  });
  if (error) redirect("/account/security?error=We+could+not+send+the+verification+email.+Please+try+again.");

  await createAdminClient()
    .from("people")
    .update({ email_verification_requested_at: new Date().toISOString() })
    .eq("id", account.person.id);
  redirect("/account/security?notice=Verification+email+sent.+Open+the+link+in+your+email+to+finish.");
}

async function removePersonalAccountAssets(personId: string) {
  const admin = createAdminClient();
  const [{ data: profileAssets, error: profileAssetsError }, { data: sites, error: sitesError }] = await Promise.all([
    admin.from("person_profile_assets").select("bucket_id,object_path").eq("person_id", personId),
    admin.from("professional_sites").select("id").eq("owner_person_id", personId),
  ]);
  if (profileAssetsError || sitesError) throw new Error("We could not prepare your private images for deletion.");

  const siteIds = (sites ?? []).map((site) => site.id);
  const { data: siteAssets, error: siteAssetsError } = siteIds.length
    ? await admin.from("site_assets").select("bucket_id,object_path").in("site_id", siteIds)
    : { data: [], error: null };
  if (siteAssetsError) throw new Error("We could not prepare your website images for deletion.");

  const filesByBucket = new Map<string, string[]>();
  for (const asset of [...(profileAssets ?? []), ...(siteAssets ?? [])]) {
    const paths = filesByBucket.get(asset.bucket_id) ?? [];
    paths.push(asset.object_path);
    filesByBucket.set(asset.bucket_id, paths);
  }
  for (const [bucket, paths] of filesByBucket) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) throw new Error("We could not remove every private image. Please try again.");
  }
}

export async function permanentlyDeleteAccountAction(formData: FormData) {
  const acknowledgement = readText(formData, "acknowledgement");
  const confirmation = readText(formData, "confirmation");
  if (acknowledgement !== "on" || confirmation !== "DELETE MY ACCOUNT") {
    redirect("/account/security?error=Confirm+the+warning+and+type+DELETE+MY+ACCOUNT+exactly.");
  }

  const account = await requireAccount("/account/security");
  try {
    await removePersonalAccountAssets(account.person.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "We could not prepare your account for deletion.";
    redirect(`/account/security?error=${encodeURIComponent(message)}`);
  }

  const { error: deletionError } = await account.supabase
    .from("permanent_account_deletion_commands")
    .insert({ request_id: randomUUID() });
  if (deletionError) {
    const message = deletionError.message.includes("principal broker")
      ? "Transfer or close your brokerage before permanently deleting a principal broker account."
      : deletionError.message.includes("staff and administrator")
        ? "ProperAP staff and administrator accounts must be removed by another administrator."
        : "Your account could not be deleted. Please try again or contact ProperAP support.";
    redirect(`/account/security?error=${encodeURIComponent(message)}`);
  }

  const admin = createAdminClient();
  const { error: authDeletionError } = await admin.auth.admin.deleteUser(account.user.id, false);
  if (authDeletionError) {
    redirect("/sign-in?error=Your+profile+was+removed,+but+we+could+not+finish+removing+the+sign-in+account.+Please+contact+ProperAP+support.");
  }

  await account.supabase.auth.signOut({ scope: "global" });
  const cookieStore = await cookies();
  const cookieDomain = await steadfastCookieDomain();
  cookieStore.delete("sf_remember_device");
  if (cookieDomain) cookieStore.delete({ name: "sf_remember_device", domain: cookieDomain });
  redirect("/sign-in?notice=Your+account+has+been+permanently+deleted.");
}
