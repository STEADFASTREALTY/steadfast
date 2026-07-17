import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setPasswordAction } from "@/app/actions/auth";
import { StatusMessage } from "@/app/components/status-message";
import { BrandLogo } from "@/app/components/brand-logo";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set password", description: "Set a secure password for your SteadFast account.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/sign-in?notice=Open+your+invitation+email+to+set+your+password.");
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <BrandLogo />
        <span className="eyebrow"><i /> Secure account</span>
        <h1>Protect your<br />account.</h1>
        <p>Create the private password you will use to access SteadFast. Recovery links expire and can only be used through your email.</p>
      </section>
      <section className="auth-card">
        <div><span className="eyebrow dark"><i /> Account recovery</span><h2>Set your password</h2></div>
        <StatusMessage error={params.error} />
        <form action={setPasswordAction} className="stack-form">
          <label><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
          <label><span>Confirm password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
          <p>Use at least 10 characters with uppercase, lowercase, and a number.</p>
          <button className="solid-button" type="submit">Set password and continue</button>
        </form>
      </section>
    </main>
  );
}
