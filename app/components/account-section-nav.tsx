import Link from "next/link";

export function AccountSectionNav({ active }: { active: "profile" | "photo" | "password" | "subscription" | "payment" | "security" }) {
  return <nav aria-label="My account sections" className="account-section-nav">
    <span>My account</span>
    <Link className={active === "profile" ? "active" : ""} href="/account?section=profile">Profile</Link>
    <Link className={active === "photo" ? "active" : ""} href="/account?section=photo">My photo</Link>
    <Link className={active === "password" ? "active" : ""} href="/account/password">Password</Link>
    <Link className={active === "subscription" ? "active" : ""} href="/account/subscription">Subscription</Link>
    <Link className={active === "payment" ? "active" : ""} href="/account/payment">Payment</Link>
    <Link className={active === "security" ? "active" : ""} href="/account/security">Security</Link>
  </nav>;
}
