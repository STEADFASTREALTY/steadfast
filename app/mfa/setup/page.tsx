import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MfaEnrollment } from "@/app/components/mfa-enrollment";
import { BrandLogo } from "@/app/components/brand-logo";
import { safeInternalPath } from "@/lib/app-url";
import { requireAccount } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set up authenticator", description: "Protect restricted SteadFast work with an authenticator.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeInternalPath((await searchParams).next ?? null, "/workspace");
  const account = await requireAccount(`/mfa/setup?next=${encodeURIComponent(next)}`);
  const { data } = await account.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal2") redirect(next);
  if (data?.nextLevel === "aal2") redirect(`/mfa/challenge?next=${encodeURIComponent(next)}`);

  return <main className="auth-page"><section className="auth-intro"><BrandLogo /><span className="eyebrow"><i /> Two-step security</span><h1>Protect your<br />access.</h1><p>SteadFast internal work requires a password and a current authenticator code.</p></section><section className="auth-card"><div><span className="eyebrow dark"><i /> Required setup</span><h2>Add an authenticator</h2><p>Scan one secure setup code, then confirm that your app is generating valid six-digit codes.</p></div><MfaEnrollment nextPath={next} /><p className="auth-switch">Your password remains unchanged. <Link href="/account">Return to account</Link></p></section></main>;
}
