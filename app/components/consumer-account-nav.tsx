import Link from "next/link";

export function ConsumerAccountNav({ active }: { active: "profile" | "saved" | "messages" | "notifications" | "security" }) {
  const links: Array<[typeof active, string, string]> = [
    ["profile", "Profile", "/account"],
    ["saved", "Liked listings", "/account/saved-listings"],
    ["messages", "Message center", "/account/messages"],
    ["notifications", "Notifications", "/account/notifications"],
    ["security", "Security", "/account/security"],
  ];

  return <nav aria-label="My account sections" className="account-section-nav consumer-account-nav">
    <span>My account</span>
    {links.map(([key, label, href]) => <Link key={key} className={active === key ? "active" : ""} href={href}>{label}</Link>)}
  </nav>;
}
