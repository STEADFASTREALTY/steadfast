"use server";

import { redirect } from "next/navigation";
import { getAppUrl, safeInternalPath } from "@/lib/app-url";
import { registerSchema, signInSchema } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signInAction(formData: FormData) {
  const parsed = signInSchema.safeParse({
    email: readText(formData, "email"),
    password: readText(formData, "password"),
  });
  const next = safeInternalPath(readText(formData, "next"));

  if (!parsed.success) {
    redirect(`/sign-in?error=Enter+a+valid+email+and+password.&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
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

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in?notice=You+have+been+signed+out.");
}
