import type { Metadata } from "next";
import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { StatusMessage } from "@/app/components/status-message";
import { BrandLogo } from "@/app/components/brand-logo";

export const metadata: Metadata = { title: "Sign in", description: "Securely sign in to your SteadFast account.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
}) {
  const params = await searchParams;
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
          <p>Use the email address connected to your SteadFast account.</p>
        </div>
        <StatusMessage error={params.error} notice={params.notice} />
        <form action={signInAction} className="stack-form">
          <input type="hidden" name="next" value={params.next ?? "/account"} />
          <label><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete="current-password" minLength={10} maxLength={128} required /></label>
          <p className="form-assist"><Link href="/forgot-password">Forgot your password?</Link></p>
          <button className="solid-button" type="submit">Sign in</button>
        </form>
        <p className="auth-switch">New to SteadFast? <Link href={`/register?next=${encodeURIComponent(params.next ?? "/account")}`}>Create a free account</Link></p>
      </section>
    </main>
  );
}
