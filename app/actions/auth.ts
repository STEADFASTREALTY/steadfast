"use server";

import { redirect } from "next/navigation";
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

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function steadfastCookieDomain() {
  const host = (await headers()).get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  return host === "steadfast.rockhillinnovation.com" || host?.endsWith(".steadfast.rockhillinnovation.com")
    ? ".steadfast.rockhillinnovation.com"
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
    displayName: readText(formData, "displayName"),
    email: readText(formData, "email"),
    password: readText(formData, "password"),
    confirmPassword: readText(formData, "confirmPassword"),
    privacyAccepted: readText(formData, "privacyAccepted"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the registration form.";
    redirect(`/register?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/register?error=Registration+could+not+be+completed.+Please+try+again.&next=${encodeURIComponent(next)}`);
  }
  redirect("/sign-in?notice=Check+your+email+to+confirm+your+new+account.");
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
