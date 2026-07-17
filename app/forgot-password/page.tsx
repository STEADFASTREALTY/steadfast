import type { Metadata } from "next";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";
import { StatusMessage } from "@/app/components/status-message";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Link className="brand" href="/"><span className="brand-mark">S</span><span>SteadFast</span></Link>
        <span className="eyebrow"><i /> Account recovery</span>
        <h1>Return to<br />your work.</h1>
        <p>Enter your account email. If it matches a SteadFast account, we will send a private recovery link.</p>
      </section>
      <section className="auth-card">
        <div>
          <span className="eyebrow dark"><i /> Secure account</span>
          <h2>Reset password</h2>
          <p>For privacy, we show the same confirmation whether or not an account exists.</p>
        </div>
        <StatusMessage
          error={params.error}
          notice={sent ? "If an account exists for that email, a password-reset link has been sent. Please also check your junk folder." : undefined}
        />
        {!sent ? (
          <form action={forgotPasswordAction} className="stack-form">
            <label><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
            <button className="solid-button" type="submit">Send recovery link</button>
          </form>
        ) : null}
        <p className="auth-switch"><Link href="/sign-in">Return to sign in</Link></p>
      </section>
    </main>
  );
}
