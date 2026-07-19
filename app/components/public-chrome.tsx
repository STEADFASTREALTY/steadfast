import Link from "next/link";
import { BrandLogo } from "@/app/components/brand-logo";
import { PublicCurrencySelector } from "@/app/components/public-currency-selector";
import { signOutAction } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

const links = [["Home", "/"], ["Search", "/properties"], ["About", "/about"], ["Careers", "/careers"], ["Feedback", "/feedback"], ["Advertise", "/advertise"], ["Support", "/support"]] as const;

export async function PublicHeader() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: person } = user
    ? await supabase.from("people").select("display_name").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  return <header className="public-header"><BrandLogo /><nav aria-label="Public navigation">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav><PublicCurrencySelector />{user ? <div className="public-account-session"><Link href="/account">{person?.display_name ?? "My account"}</Link><form action={signOutAction} data-prompt-title="Sign out on this machine?" data-prompt-message="Only this browser session will end. Other machines remain signed in." data-prompt-confirm="Sign out here"><input type="hidden" name="scope" value="local" /><button aria-label="Sign out on this machine" className="account-exit-button" title="Sign out on this machine" type="submit"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 5H5v14h5" /><path d="M14 8l4 4-4 4" /><path d="M8 12h10" /></svg></button></form></div> : <Link className="outline-button" href="/sign-in">Sign in</Link>}</header>;
}
export function PublicFooter() { return <footer className="public-footer"><div><strong className="public-footer-name">ProperAP -</strong><p>Jamaica&apos;s connected property platform.</p></div><nav aria-label="Footer navigation">{links.slice(2).map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}<Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><div className="public-social" aria-label="ProperAP social media"><span title="LinkedIn">in</span><span title="Instagram">◎</span><span title="Facebook">f</span><span title="YouTube">▶</span><span title="TikTok">♪</span></div></footer>; }
