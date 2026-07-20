import Link from "next/link";

export function ConsumerAccountNav({ active }: { active: "profile" | "watch" | "messages" | "notifications" | "password" | "subscription" | "security" }) {
  const links: Array<[typeof active, string, string]> = [
    ["profile", "Profile", "/account"],
    ["watch", "My watch", "/account/saved-listings"],
    ["messages", "Message center", "/account/messages"],
    ["notifications", "Notifications", "/account/notifications"],
    ["password", "Password", "/account/password"],
    ["subscription", "Subscription", "/account/subscription"],
    ["security", "Security", "/account/security"],
  ];

  return <nav aria-label="My account sections" className="account-section-nav consumer-account-nav">
    <span>My account</span>
    {links.map(([key, label, href]) => <Link key={key} className={active === key ? "active" : ""} href={href}>{label}</Link>)}
  </nav>;
}
