import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaChallenge } from "@/app/components/mfa-challenge";
import { BrandLogo } from "@/app/components/brand-logo";
import { safeInternalPath } from "@/lib/app-url";
import { requireAccount } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Verify authenticator", description: "Verify your identity before opening restricted SteadFast tools.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MfaChallengePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeInternalPath((await searchParams).next ?? null, "/account");
  const account = await requireAccount(`/mfa/challenge?next=${encodeURIComponent(next)}`);
  const { data } = await account.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal2") redirect(next);
  if (data?.nextLevel !== "aal2") redirect(`/mfa/setup?next=${encodeURIComponent(next)}`);

  return <main className="auth-page"><section className="auth-intro"><BrandLogo /><span className="eyebrow"><i /> Identity check</span><h1>One more<br />step.</h1><p>Enter the current code from your authenticator app to open restricted SteadFast tools.</p></section><section className="auth-card"><div><span className="eyebrow dark"><i /> Secure verification</span><h2>Verify it’s you</h2><p>Authenticator codes change every 30 seconds.</p></div><MfaChallenge nextPath={next} /></section></main>;
}
