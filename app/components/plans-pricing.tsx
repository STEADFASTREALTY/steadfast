"use client";

import Link from "next/link";
import { useState } from "react";

type BillingCycle = "annual" | "monthly";

type Plan = {
  name: string;
  annualPrice: string;
  monthlyPrice?: string;
  description: string;
  features: readonly string[];
  cta: string;
  href: string;
  featured?: boolean;
  annualOnly?: boolean;
};

const professionalPlans: readonly Plan[] = [
  { name: "Independent Agent", annualPrice: "US$440", monthlyPrice: "US$40", description: "For self-managed professionals with independent listing authority.", features: ["Independent listing authority", "Professional public website", "Listing tools, inquiries, analytics, and support", "Self-managed account"], cta: "Choose Independent", href: "/register?role=agent&mode=independent" },
  { name: "Brokerage Agent", annualPrice: "US$330", monthlyPrice: "US$30", description: "Preferred pricing for agents working with an active ProperAP brokerage.", features: ["Brokerage workspace and public website", "Brokerage collaboration and shared inventory", "Inquiries, analytics, and support", "Must belong to an active ProperAP brokerage"], cta: "Join through a brokerage", href: "/register?role=agent&mode=brokerage", featured: true },
  { name: "Broker Core", annualPrice: "US$1,650", monthlyPrice: "US$150", description: "For brokerages that need approval, team, and inventory control.", features: ["Up to 20 affiliated agents", "Up to 5 non-agent staff", "Brokerage website and approval workflow", "Team and brokerage analytics", "Professional agent seats billed separately"], cta: "Choose Core", href: "/register?role=broker" },
  { name: "Broker Growth", annualPrice: "US$3,300", monthlyPrice: "US$300", description: "For established brokerages with larger teams and reporting needs.", features: ["Up to 75 affiliated agents", "Up to 15 non-agent staff", "Advanced brokerage reporting", "Priority onboarding", "Professional agent seats billed separately"], cta: "Choose Growth", href: "/register?role=broker" },
];

const otherPlans: readonly Plan[] = [
  { name: "Consumer", annualPrice: "Free", description: "For buyers, renters, sellers, and property explorers.", features: ["Search Jamaican properties", "Save preferred currency", "Contact the right property agent", "No subscription required"], cta: "Search properties", href: "/properties", annualOnly: true },
  { name: "Enterprise", annualPrice: "Custom", description: "For networks operating above Growth limits or requiring tailored support.", features: ["Custom team capacity", "Data migration planning", "Integration support", "Service-level options", "Volume pricing discussion"], cta: "Contact us", href: "/support", annualOnly: true },
];

function PlanCard({ plan, cycle }: { plan: Plan; cycle: BillingCycle }) {
  const annual = cycle === "annual" || plan.annualOnly;
  const price = annual ? plan.annualPrice : plan.monthlyPrice ?? plan.annualPrice;
  const unit = plan.annualPrice === "Free" || plan.annualPrice === "Custom" ? "" : annual ? "per year" : "per month";

  return <article className={`plan-card${plan.featured ? " featured" : ""}${annual && !plan.annualOnly ? " annual-plan" : ""}`}>
    {plan.featured ? <span className="plan-recommended">Best value through a brokerage</span> : null}
    {annual && !plan.annualOnly ? <span className="plan-annual-badge">1 month free</span> : null}
    <h2>{plan.name}</h2>
    <div className="plan-price">{price}</div>
    {unit ? <p className="plan-unit">{unit}</p> : null}
    {annual && !plan.annualOnly ? <p className="plan-payment-note">Pay for 11 months. Receive 12 months of ProperAP access.</p> : null}
    {!annual && plan.monthlyPrice ? <p className="plan-payment-note">Billed monthly. Switch to annual payment to receive one month free.</p> : null}
    <p>{plan.description}</p>
    <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
    <Link className={plan.featured ? "primary-button" : "outline-button"} href={plan.href}>{plan.cta}</Link>
  </article>;
}

export function PlansPricing() {
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const topPlans = [otherPlans[0], ...professionalPlans.slice(0, 3)];
  const lowerPlans = [professionalPlans[3], otherPlans[1]];
  return <>
    <section className="billing-switcher" aria-label="Choose a payment schedule">
      <div><span>Annual professional membership</span><p>Pay annually upfront to receive one month free and keep your plan price fixed for 12 months.</p></div>
      <div className="billing-toggle" role="group" aria-label="Payment schedule">
        <button type="button" onClick={() => setCycle("monthly")} aria-pressed={cycle === "monthly"}>Monthly</button>
        <button type="button" onClick={() => setCycle("annual")} aria-pressed={cycle === "annual"}>Annual - 1 month free</button>
      </div>
    </section>
    <section className="plans-grid professional-plans-grid" aria-label="ProperAP primary subscription plans">{topPlans.map((plan) => <PlanCard key={plan.name} plan={plan} cycle={cycle} />)}</section>
    <section className="plans-grid other-plans-grid" aria-label="ProperAP growth and enterprise plans">{lowerPlans.map((plan) => <PlanCard key={plan.name} plan={plan} cycle={cycle} />)}</section>
  </>;
}
