"use client";

import { useState } from "react";
import { requestProfessionalUpgradeAction } from "@/app/actions/onboarding";

type Brokerage = { id: string; display_name: string };

export function ProfessionalUpgradeForm({ brokerages }: { brokerages: Brokerage[] }) {
  const [role, setRole] = useState<"agent" | "broker">("agent");

  return <form action={requestProfessionalUpgradeAction} className="professional-upgrade-form">
    <div className="form-grid two-columns">
      <label>Upgrade to
        <select name="requestedRole" value={role} onChange={(event) => setRole(event.target.value as "agent" | "broker")}>
          <option value="agent">Agent</option>
          <option value="broker">Broker</option>
        </select>
      </label>
      <label>Contact number
        <input name="contactPhone" type="tel" required placeholder="Your contact number" />
      </label>
    </div>
    <label>Business address
      <input name="contactAddress" required placeholder="Street address, city or parish" />
    </label>
    {role === "agent" ? <label>Brokerage
      <select name="brokerageId" required>
        <option value="">Choose the brokerage you want to join</option>
        {brokerages.map((brokerage) => <option key={brokerage.id} value={brokerage.id}>{brokerage.display_name}</option>)}
      </select>
    </label> : <label>Brokerage name
      <input name="brokerageName" required placeholder="Your brokerage name" />
    </label>}
    <p className="form-help">Your account stays a free Registered User account while ProperAP reviews this request. Professional tools activate only after approval.</p>
    <button type="submit" className="primary-button">Send upgrade request</button>
  </form>;
}
