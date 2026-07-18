import Link from "next/link";
import { BrandLogo } from "@/app/components/brand-logo";

const links = [["Home", "/"], ["Search", "/properties"], ["About SteadFast", "/about"], ["Careers", "/careers"], ["Feedback", "/feedback"], ["Advertise", "/advertise"], ["Support", "/support"]] as const;

export function PublicHeader() { return <header className="public-header"><BrandLogo /><nav aria-label="Public navigation">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav><Link className="outline-button" href="/sign-in">Sign in</Link></header>; }
export function PublicFooter() { return <footer className="public-footer"><div><BrandLogo compact /><p>Jamaica&apos;s connected property platform.</p></div><nav aria-label="Footer navigation">{links.slice(2).map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}<Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><div className="public-social" aria-label="SteadFast social media"><span title="LinkedIn">in</span><span title="Instagram">◎</span><span title="Facebook">f</span><span title="YouTube">▶</span><span title="TikTok">♪</span></div></footer>; }
