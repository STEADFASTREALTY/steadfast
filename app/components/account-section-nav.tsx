import Link from "next/link";

export function AccountSectionNav({ active }: { active: "profile" | "photo" | "security" }) {
  return <nav aria-label="My account sections" className="account-section-nav">
    <span>My account</span>
    <Link className={active === "profile" ? "active" : ""} href="/account?section=profile">Profile</Link>
    <Link className={active === "photo" ? "active" : ""} href="/account?section=photo">My photo</Link>
    <Link className={active === "security" ? "active" : ""} href="/account/security">Security</Link>
  </nav>;
}
