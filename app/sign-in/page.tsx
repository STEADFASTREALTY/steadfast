import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/actions/auth";
import { StatusMessage } from "@/app/components/status-message";
import { BrandLogo } from "@/app/components/brand-logo";
import { safeInternalPath } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in", description: "Securely sign in to your ProperAP account.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next ?? null);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <BrandLogo />
        <span className="eyebrow"><i /> Professional access</span>
        <h1>Welcome<br />back.</h1>
        <p>Manage your account, applications, listings, and brokerage work from one clear workspace.</p>
      </section>
      <section className="auth-card">
        <div>
          <span className="eyebrow dark"><i /> Secure account</span>
          <h2>Sign in</h2>
          <p>Use the email address connected to your ProperAP account.</p>
        </div>
        <StatusMessage error={params.error} notice={params.notice} />
        <form action={signInAction} className="stack-form" noValidate>
          <input type="hidden" name="next" value={next} />
          <label><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={320} /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete="current-password" minLength={10} maxLength={128} /></label>
          <label className="remember-device"><input name="rememberDevice" type="checkbox" /><span>Keep me signed in on this machine</span></label>
          <p className="form-assist"><Link href="/forgot-password">Forgot your password?</Link></p>
          <button className="solid-button" type="submit">Sign in</button>
        </form>
        <p className="auth-switch">New to ProperAP? <Link href={`/register?next=${encodeURIComponent(next)}`}>Create a free account</Link></p>
      </section>
    </main>
  );
}
