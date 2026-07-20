import Link from "next/link";

export function StaffNav({ active }: { active: "dashboard" | "registrations" | "brokerages" | "listings" | "recommendations" }) {
  const links: Array<[typeof active, string, string]> = [
    ["dashboard", "Dashboard", "/staff"],
    ["registrations", "Registrations", "/staff/registrations"],
    ["brokerages", "Brokerages", "/staff/brokerages"],
    ["listings", "Listing monitor", "/staff/listings"],
    ["recommendations", "Recommendations", "/workspace/recommendations"],
  ];
  return <nav aria-label="ProperAP staff navigation" className="account-section-nav staff-section-nav">
    <span>ProperAP staff</span>
    {links.map(([key, label, href]) => <Link key={key} href={href} className={active === key ? "active" : ""}>{label}</Link>)}
  </nav>;
}
