import type { Metadata } from "next";
import Link from "next/link";
import { registerAction } from "@/app/actions/auth";
import { StatusMessage } from "@/app/components/status-message";

export const metadata: Metadata = { title: "Create account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Link className="brand" href="/"><span className="brand-mark">S</span><span>SteadFast</span></Link>
        <span className="eyebrow"><i /> Start simply</span>
        <h1>Your property<br />account.</h1>
        <p>Every account starts free. Agents join a brokerage only after the brokerage approves their application or invitation.</p>
      </section>
      <section className="auth-card wide">
        <div><span className="eyebrow dark"><i /> Free registration</span><h2>Create account</h2></div>
        <StatusMessage error={params.error} />
        <form action={registerAction} className="stack-form two-column">
          <input type="hidden" name="next" value={params.next ?? "/account"} />
          <label className="full"><span>Your name</span><input name="displayName" autoComplete="name" minLength={2} maxLength={120} required /></label>
          <label className="full"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
          <label><span>Confirm password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
          <label className="check-row full"><input name="privacyAccepted" type="checkbox" required /> I agree to the privacy notice and account terms for this pilot.</label>
          <button className="solid-button full" type="submit">Create free account</button>
        </form>
        <p className="auth-switch">Already registered? <Link href="/sign-in">Sign in</Link></p>
      </section>
    </main>
  );
}
