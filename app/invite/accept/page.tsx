import type { Metadata } from "next";
import Link from "next/link";
import { acceptBrokerageInvitationAction } from "@/app/actions/onboarding";
import { requireAccount } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = params.token ?? "";
  await requireAccount(`/invite/accept?token=${encodeURIComponent(token)}`);
  return <main className="auth-page"><section className="auth-intro"><Link className="brand" href="/"><span className="brand-mark">S</span><span>SteadFast</span></Link><span className="eyebrow"><i /> Brokerage invitation</span><h1>Join your<br />team.</h1><p>Your brokerage has invited you to work in SteadFast with assigned professional access.</p></section><section className="auth-card"><div><span className="eyebrow dark"><i /> Confirm access</span><h2>Accept invitation</h2><p>We will verify that this invitation matches your signed-in email before activating your membership.</p></div><form action={acceptBrokerageInvitationAction} className="stack-form"><input type="hidden" name="token" value={token} /><button className="solid-button" type="submit" disabled={!token}>Accept and join brokerage</button></form><p className="auth-switch"><Link href="/account">Return to my account</Link></p></section></main>;
}
