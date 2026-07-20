"use client";

import { useState } from "react";
import { registerAction } from "@/app/actions/auth";

type Brokerage = { id: string; display_name: string };
type RegistrationRole = "consumer" | "agent" | "broker";

function EyeIcon({ open }: { open: boolean }) {
  return open
    ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" /><path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c5.2 0 8.8 4.2 9.8 7-.4 1.1-1.2 2.5-2.5 3.8" /><path d="M6.2 6.2C4.6 7.7 3.5 9.8 3 12c1 2.8 4.8 7 9 7 1.3 0 2.5-.3 3.6-.9" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export function RegistrationForm({ brokerages, next }: { brokerages: Brokerage[]; next: string }) {
  const [role, setRole] = useState<RegistrationRole>("consumer");
  const [showPassword, setShowPassword] = useState(false);
  const passwordType = showPassword ? "text" : "password";

  return (
    <form action={registerAction} className="stack-form two-column">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="requestedRole" value={role} />
      <fieldset className="registration-role-picker full">
        <legend>Account type</legend>
        <p>Choose how you will use ProperAP. Regular User accounts are active immediately; professional accounts begin as inactive while ProperAP reviews the registration.</p>
        <div className="registration-role-options">
          {([
            ["consumer", "Regular User", "Browse, save listings, and contact agents."],
            ["agent", "Agent", "Submit an application to the brokerage that referred you."],
            ["broker", "Broker", "Register your brokerage for ProperAP review and activation."],
          ] as const).map(([value, label, description]) => (
            <label className={`registration-role-option ${role === value ? "selected" : ""}`} key={value}>
              <input type="radio" checked={role === value} onChange={() => setRole(value)} />
              <span><strong>{label}</strong><small>{description}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label><span>First name</span><input name="firstName" autoComplete="given-name" minLength={1} maxLength={80} required /></label>
      <label><span>Last name</span><input name="lastName" autoComplete="family-name" minLength={1} maxLength={80} required /></label>
      <label className="full"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
      <label><span>Password</span><div className="password-input"><input name="password" type={passwordType} autoComplete="new-password" minLength={10} maxLength={128} required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide passwords" : "Show passwords"} title={showPassword ? "Hide passwords" : "Show passwords"}><EyeIcon open={showPassword} /></button></div></label>
      <label><span>Confirm password</span><div className="password-input"><input name="confirmPassword" type={passwordType} autoComplete="new-password" minLength={10} maxLength={128} required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide passwords" : "Show passwords"} title={showPassword ? "Hide passwords" : "Show passwords"}><EyeIcon open={showPassword} /></button></div></label>
      <p className="password-requirements full">Use at least 10 characters, including one uppercase letter, one lowercase letter, and one number.</p>
      {role !== "consumer" && <>
        <label><span>Contact number</span><input name="contactPhone" type="tel" autoComplete="tel" minLength={7} maxLength={30} required /></label>
        <label><span>Business address</span><input name="contactAddress" autoComplete="street-address" minLength={8} maxLength={500} required /></label>
        {role === "agent" ? <label className="full"><span>Brokerage that referred you</span><select name="brokerageId" required defaultValue=""><option value="" disabled>Select your brokerage</option>{brokerages.map((brokerage) => <option value={brokerage.id} key={brokerage.id}>{brokerage.display_name}</option>)}</select></label> : <label className="full"><span>Brokerage name</span><input name="brokerageName" minLength={2} maxLength={160} required placeholder="Your brokerage company name" /></label>}
        <p className="registration-notice full"><strong>Professional testing accounts are free.</strong> ProperAP approval is still required before professional workspace access is enabled. No payment is required during testing.</p>
      </>}
      <label className="check-row full"><input name="privacyAccepted" type="checkbox" required /> I agree to the privacy notice and account terms for this pilot.</label>
      <button className="solid-button full" type="submit">{role === "consumer" ? "Create free account" : "Submit professional registration"}</button>
    </form>
  );
}
